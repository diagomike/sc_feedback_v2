import "server-only";
import { prisma } from "@/server/db";
import { inviteNewUser, resendInvitation } from "@/server/auth/invitation";
import { registrationState } from "./registration-state";
import { computeClosureRows } from "./closure-algorithm";
import type { NodeType } from "@prisma/client";

export class HierarchyError extends Error {}

export interface NodeOccupant {
  name: string;
  email: string;
  status: "registered" | "invited" | "expired";
  statusDetail: string | null;
}

export interface HierarchyNodeRow {
  id: string;
  name: string;
  level: number;
  type: NodeType;
  parentIds: string[];
  occupant: NodeOccupant | null;
  teacherCount: number;
  studentCount: number;
  childCount: number;
  active: boolean;
  hasOwnedContent: boolean;
}

/**
 * Recomputes HierarchyClosure from scratch via computeClosureRows (BFS over
 * HierarchyEdge). Called after any edge or node mutation. The org chart is a few
 * hundred nodes and changes rarely, so a full recompute is imperceptibly fast and far
 * less error-prone than incrementally patching the closure table. Ported from v1's
 * HierarchyService.
 */
export async function recomputeClosure(): Promise<void> {
  const nodes = await prisma.hierarchyNode.findMany({ select: { id: true } });
  const edges = await prisma.hierarchyEdge.findMany({ select: { parentId: true, childId: true } });
  const rows = computeClosureRows(nodes.map((n) => n.id), edges);

  await prisma.$transaction([
    prisma.hierarchyClosure.deleteMany({}),
    prisma.hierarchyClosure.createMany({ data: rows }),
  ]);
}

async function assertAdjacentParents(level: number, parentIds: string[]): Promise<void> {
  if (level === 0) {
    if (parentIds.length > 0) throw new HierarchyError("A level 0 node cannot have a parent");
    return;
  }
  if (parentIds.length === 0) {
    throw new HierarchyError("A node above level 0 needs at least one parent");
  }
  const parents = await prisma.hierarchyNode.findMany({ where: { id: { in: parentIds } } });
  if (parents.length !== parentIds.length) {
    throw new HierarchyError("One or more parent nodes do not exist");
  }
  const wrongLevel = parents.find((p) => p.level !== level - 1);
  if (wrongLevel) {
    throw new HierarchyError(
      `Edges only connect adjacent levels — ${wrongLevel.name} is level ${wrongLevel.level}, not ${level - 1}`,
    );
  }
}

/** Every node's parents, occupant registration state, and personnel counts — the flat,
 *  searchable list behind Personnel/Offices/Colleges/Departments, as distinct from the
 *  once-a-year canvas (Structure) used to lay the structure out. */
export async function listGraph(): Promise<HierarchyNodeRow[]> {
  const [nodes, teacherCounts, studentCounts, templateOwners, campaignOwners, groupOwners, scaleOwners] =
    await Promise.all([
      prisma.hierarchyNode.findMany({
        include: {
          user: true,
          incomingEdges: { select: { parentId: true } },
          outgoingEdges: { select: { childId: true } },
        },
        orderBy: [{ level: "asc" }, { name: "asc" }],
      }),
      prisma.membership.groupBy({ by: ["nodeId"], where: { kind: "TEACHER" }, _count: { _all: true } }),
      prisma.membership.groupBy({ by: ["nodeId"], where: { kind: "STUDENT" }, _count: { _all: true } }),
      prisma.template.findMany({ select: { ownerNodeId: true }, distinct: ["ownerNodeId"] }),
      prisma.campaign.findMany({ select: { nodeId: true }, distinct: ["nodeId"] }),
      prisma.studentGroup.findMany({ select: { nodeId: true }, distinct: ["nodeId"] }),
      prisma.likertScale.findMany({ select: { ownerNodeId: true }, distinct: ["ownerNodeId"] }),
    ]);

  const teacherCountByNode = new Map(teacherCounts.map((t) => [t.nodeId, t._count._all]));
  const studentCountByNode = new Map(studentCounts.map((s) => [s.nodeId, s._count._all]));
  const ownedContentNodeIds = new Set([
    ...templateOwners.map((t) => t.ownerNodeId),
    ...campaignOwners.map((c) => c.nodeId),
    ...groupOwners.map((g) => g.nodeId),
    ...scaleOwners.map((s) => s.ownerNodeId).filter((id): id is string => id != null),
  ]);

  const nodesOut: HierarchyNodeRow[] = [];
  for (const n of nodes) {
    let occupant: NodeOccupant | null = null;
    if (n.user) {
      if (n.user.status === "ACTIVE") {
        occupant = { name: n.user.name, email: n.user.email, status: "registered", statusDetail: null };
      } else {
        const invitation = await prisma.invitation.findFirst({
          where: { emailLower: n.user.emailLower, consumedAt: null },
          orderBy: { createdAt: "desc" },
        });
        const { status, detail } = registrationState({ userStatus: n.user.status, invitation });
        occupant = { name: n.user.name, email: n.user.email, status, statusDetail: detail };
      }
    }

    nodesOut.push({
      id: n.id,
      name: n.name,
      level: n.level,
      type: n.type,
      parentIds: n.incomingEdges.map((e) => e.parentId),
      occupant,
      teacherCount: teacherCountByNode.get(n.id) ?? 0,
      studentCount: studentCountByNode.get(n.id) ?? 0,
      childCount: n.outgoingEdges.length,
      active: n.active,
      hasOwnedContent: ownedContentNodeIds.has(n.id),
    });
  }

  return nodesOut;
}

export async function createNodeWithHead(input: {
  name: string;
  level: number;
  type: NodeType;
  parentIds: string[];
  head: { name: string; email: string } | null;
}): Promise<void> {
  await assertAdjacentParents(input.level, input.parentIds);

  const node = await prisma.hierarchyNode.create({
    data: { name: input.name, level: input.level, type: input.type },
  });

  if (input.head) {
    const { userId } = await inviteNewUser({
      name: input.head.name,
      email: input.head.email,
      role: "MANAGER",
      hierarchyNodeId: node.id,
    });
    await prisma.hierarchyNode.update({ where: { id: node.id }, data: { userId } });
  }

  if (input.parentIds.length > 0) {
    await prisma.hierarchyEdge.createMany({
      data: input.parentIds.map((parentId) => ({ parentId, childId: node.id })),
    });
  }
  await recomputeClosure();
}

export async function resendForNode(nodeId: string): Promise<void> {
  const node = await prisma.hierarchyNode.findUniqueOrThrow({ where: { id: nodeId } });
  if (!node.userId) throw new HierarchyError("This node has no occupant to resend an invitation to");
  await resendInvitation(node.userId);
}

export async function revokeAccess(nodeId: string): Promise<void> {
  const node = await prisma.hierarchyNode.findUniqueOrThrow({ where: { id: nodeId } });
  if (!node.userId) throw new HierarchyError("This node has no occupant to revoke");

  await prisma.$transaction([
    prisma.user.update({ where: { id: node.userId }, data: { status: "DISABLED" } }),
    prisma.session.deleteMany({ where: { userId: node.userId } }),
    prisma.hierarchyNode.update({ where: { id: nodeId }, data: { userId: null } }),
  ]);
}

export async function assignHead(nodeId: string, input: { name: string; email: string }): Promise<void> {
  const node = await prisma.hierarchyNode.findUniqueOrThrow({ where: { id: nodeId } });
  if (node.userId) throw new HierarchyError("This node already has an occupant — revoke access first");

  const { userId } = await inviteNewUser({
    name: input.name,
    email: input.email,
    role: "MANAGER",
    hierarchyNodeId: nodeId,
  });
  await prisma.hierarchyNode.update({ where: { id: nodeId }, data: { userId } });
}

/** Soft-disable: revokes the current occupant and flips active false in one action.
 *  History is completely untouched — only new activity is affected. */
export async function deactivateNode(nodeId: string): Promise<void> {
  const node = await prisma.hierarchyNode.findUniqueOrThrow({ where: { id: nodeId } });
  if (!node.active) throw new HierarchyError("This node is already inactive");

  await prisma.$transaction([
    ...(node.userId
      ? [
          prisma.user.update({ where: { id: node.userId }, data: { status: "DISABLED" as const } }),
          prisma.session.deleteMany({ where: { userId: node.userId } }),
        ]
      : []),
    prisma.hierarchyNode.update({ where: { id: nodeId }, data: { active: false, userId: null } }),
  ]);
}

export async function reactivateNode(nodeId: string): Promise<void> {
  const node = await prisma.hierarchyNode.findUniqueOrThrow({ where: { id: nodeId } });
  if (node.active) throw new HierarchyError("This node is already active");
  await prisma.hierarchyNode.update({ where: { id: nodeId }, data: { active: true } });
}

/** Real deletion — the one place in this app something actually disappears rather than
 *  being archived/revoked. Blockers are collected rather than thrown on the first hit
 *  so the admin sees everything that needs clearing in one pass. */
export async function deleteNode(nodeId: string): Promise<void> {
  const node = await prisma.hierarchyNode.findUniqueOrThrow({
    where: { id: nodeId },
    include: { outgoingEdges: true },
  });

  const blockers: string[] = [];
  if (node.userId) blockers.push("has an occupant — revoke access first");
  if (node.outgoingEdges.length > 0) blockers.push(`has ${node.outgoingEdges.length} child node(s)`);

  const [memberships, templates, campaigns, groups, scales] = await Promise.all([
    prisma.membership.count({ where: { nodeId } }),
    prisma.template.count({ where: { ownerNodeId: nodeId } }),
    prisma.campaign.count({ where: { nodeId } }),
    prisma.studentGroup.count({ where: { nodeId } }),
    prisma.likertScale.count({ where: { ownerNodeId: nodeId } }),
  ]);
  if (memberships > 0) blockers.push(`has ${memberships} teacher/student membership(s)`);
  if (templates > 0) blockers.push(`owns ${templates} template(s)`);
  if (campaigns > 0) blockers.push(`owns ${campaigns} campaign(s)`);
  if (groups > 0) blockers.push(`owns ${groups} student group(s)`);
  if (scales > 0) blockers.push(`owns ${scales} Likert scale(s)`);

  if (blockers.length > 0) {
    throw new HierarchyError(`Cannot delete this node — it ${blockers.join("; ")}`);
  }

  await prisma.$transaction([
    prisma.hierarchyEdge.deleteMany({ where: { OR: [{ parentId: nodeId }, { childId: nodeId }] } }),
    prisma.hierarchyNode.delete({ where: { id: nodeId } }),
  ]);
  await recomputeClosure();
}

/** Replaces which parent(s) a node reports under, unless additive (Structure page's
 *  Shift+drop), which adds to the existing set instead — the cross-cutting case, e.g. a
 *  department reporting to both its college and QA. */
export async function reassignParents(nodeId: string, parentIds: string[], additive = false): Promise<void> {
  const node = await prisma.hierarchyNode.findUniqueOrThrow({ where: { id: nodeId }, include: { incomingEdges: true } });
  const finalParentIds = additive
    ? [...new Set([...node.incomingEdges.map((e) => e.parentId), ...parentIds])]
    : parentIds;
  await assertAdjacentParents(node.level, finalParentIds);

  await prisma.$transaction([
    prisma.hierarchyEdge.deleteMany({ where: { childId: nodeId } }),
    prisma.hierarchyEdge.createMany({ data: finalParentIds.map((parentId) => ({ parentId, childId: nodeId })) }),
  ]);
  await recomputeClosure();
}

export async function renameNode(nodeId: string, name: string): Promise<void> {
  await prisma.hierarchyNode.update({ where: { id: nodeId }, data: { name } });
}

export async function changeLevel(nodeId: string, newLevel: number): Promise<void> {
  const node = await prisma.hierarchyNode.findUniqueOrThrow({ where: { id: nodeId } });
  if (node.level === newLevel) return;

  await prisma.$transaction([
    prisma.hierarchyEdge.deleteMany({ where: { OR: [{ parentId: nodeId }, { childId: nodeId }] } }),
    prisma.hierarchyNode.update({ where: { id: nodeId }, data: { level: newLevel } }),
  ]);
  await recomputeClosure();
}

export async function changeType(nodeId: string, type: NodeType): Promise<void> {
  await prisma.hierarchyNode.update({ where: { id: nodeId }, data: { type } });
}
