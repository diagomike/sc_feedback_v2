import "server-only";
import { prisma } from "@/server/db";
import { ownDepartmentNode } from "@/server/scope";
import type { StudentProgram } from "@prisma/client";

/** Scoped to the caller's own department, same simplification as people.ts. Ported
 *  from v1's GroupsService, with `program` added to the create/list surface. */

export interface GroupSummary {
  id: string;
  name: string;
  program: StudentProgram;
  memberCount: number;
  campaignCount: number;
  createdAt: Date;
}

export async function listGroups(requestingUserId: string): Promise<GroupSummary[]> {
  const node = await ownDepartmentNode(requestingUserId);
  const groups = await prisma.studentGroup.findMany({
    where: { nodeId: node.id },
    include: { _count: { select: { members: true } } },
    orderBy: { name: "asc" },
  });

  const assignments = await prisma.campaignAssignment.findMany({
    where: { studentGroupId: { in: groups.map((g) => g.id) } },
    select: { studentGroupId: true, campaignId: true },
    distinct: ["studentGroupId", "campaignId"],
  });
  const campaignCountByGroup = new Map<string, number>();
  for (const a of assignments) {
    if (!a.studentGroupId) continue;
    campaignCountByGroup.set(a.studentGroupId, (campaignCountByGroup.get(a.studentGroupId) ?? 0) + 1);
  }

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    program: g.program,
    memberCount: g._count.members,
    campaignCount: campaignCountByGroup.get(g.id) ?? 0,
    createdAt: g.createdAt,
  }));
}

export async function createGroup(requestingUserId: string, input: { name: string; program: StudentProgram }) {
  const node = await ownDepartmentNode(requestingUserId);
  const group = await prisma.studentGroup.create({ data: { nodeId: node.id, name: input.name, program: input.program } });
  return group;
}

export async function getGroup(requestingUserId: string, groupId: string) {
  const node = await ownDepartmentNode(requestingUserId);
  const group = await prisma.studentGroup.findFirst({
    where: { id: groupId, nodeId: node.id },
    include: { members: { include: { user: true } } },
  });
  if (!group) throw new Error("Group not found");

  const active = group.members.filter((m) => m.user.status === "ACTIVE");
  const invitations = await prisma.invitation.findMany({
    where: { emailLower: { in: active.map((m) => m.user.emailLower) }, consumedAt: { not: null } },
    orderBy: { consumedAt: "desc" },
  });
  const registeredAtByEmail = new Map<string, Date>();
  for (const inv of invitations) {
    if (!registeredAtByEmail.has(inv.emailLower)) registeredAtByEmail.set(inv.emailLower, inv.consumedAt!);
  }

  const members = [...group.members]
    .sort((a, b) => a.user.name.localeCompare(b.user.name))
    .map((m) => ({
      id: m.userId,
      name: m.user.name,
      email: m.user.email,
      registeredAt: registeredAtByEmail.get(m.user.emailLower) ?? null,
    }));

  return { id: group.id, name: group.name, program: group.program, members };
}

/** Students already in this department but not yet in this particular group. */
export async function listCandidates(requestingUserId: string, groupId: string) {
  const node = await ownDepartmentNode(requestingUserId);
  await assertOwnGroup(node.id, groupId);

  const existingMemberIds = (
    await prisma.studentGroupMember.findMany({ where: { groupId }, select: { userId: true } })
  ).map((m) => m.userId);

  const students = await prisma.membership.findMany({
    where: { nodeId: node.id, kind: "STUDENT", userId: { notIn: existingMemberIds } },
    include: { user: true },
    orderBy: { user: { name: "asc" } },
  });

  return students.map((s) => ({ id: s.userId, name: s.user.name, email: s.user.email }));
}

export async function addMembers(requestingUserId: string, groupId: string, userIds: string[]): Promise<void> {
  const node = await ownDepartmentNode(requestingUserId);
  await assertOwnGroup(node.id, groupId);

  const validStudents = await prisma.membership.findMany({
    where: { nodeId: node.id, kind: "STUDENT", userId: { in: userIds } },
  });
  if (validStudents.length !== userIds.length) {
    throw new Error("One or more students are not in your department");
  }

  for (const s of validStudents) {
    await prisma.studentGroupMember.upsert({
      where: { groupId_userId: { groupId, userId: s.userId } },
      create: { groupId, userId: s.userId },
      update: {},
    });
  }
}

export async function removeMember(requestingUserId: string, groupId: string, userId: string): Promise<void> {
  const node = await ownDepartmentNode(requestingUserId);
  await assertOwnGroup(node.id, groupId);
  await prisma.studentGroupMember.deleteMany({ where: { groupId, userId } });
}

async function assertOwnGroup(nodeId: string, groupId: string): Promise<void> {
  const group = await prisma.studentGroup.findFirst({ where: { id: groupId, nodeId } });
  if (!group) throw new Error("Group not found");
}
