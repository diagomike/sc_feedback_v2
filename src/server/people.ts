import "server-only";
import { prisma } from "@/server/db";
import { ownDepartmentNode } from "@/server/scope";
import { inviteNewUser, resendInvitation } from "@/server/auth/invitation";
import { registrationState } from "@/server/hierarchy/registration-state";
import type { RoleKind } from "@prisma/client";

/**
 * "Teachers & students" is deliberately scoped to the caller's OWN department, not the
 * wider visibleNodeIds() subtree Analyse uses — matching the ASTU fixtures, where the
 * CSE head manages CSE's own people, not a dean's several descendant departments at
 * once. Ported from v1's PeopleService.
 */
export interface PersonRow {
  id: string;
  name: string;
  email: string;
  kind: "TEACHER" | "STUDENT";
  groups: string[];
  status: "registered" | "invited" | "expired";
  statusDetail: string | null;
}

export async function listPeople(requestingUserId: string) {
  const node = await ownDepartmentNode(requestingUserId);

  const memberships = await prisma.membership.findMany({
    where: { nodeId: node.id },
    include: { user: true },
    orderBy: { user: { name: "asc" } },
  });

  const groupMemberships = await prisma.studentGroupMember.findMany({
    where: { userId: { in: memberships.map((m) => m.userId) } },
    include: { group: { select: { name: true } } },
  });
  const groupNamesByUser = new Map<string, string[]>();
  for (const gm of groupMemberships) {
    const list = groupNamesByUser.get(gm.userId) ?? [];
    list.push(gm.group.name);
    groupNamesByUser.set(gm.userId, list);
  }

  const people: PersonRow[] = [];
  let notRegistered = 0;
  for (const m of memberships) {
    let status: PersonRow["status"];
    let detail: string | null;
    if (m.user.status === "ACTIVE") {
      status = "registered";
      detail = null;
    } else {
      const invitation = await prisma.invitation.findFirst({
        where: { emailLower: m.user.emailLower, consumedAt: null },
        orderBy: { createdAt: "desc" },
      });
      ({ status, detail } = registrationState({ userStatus: m.user.status, invitation }));
    }
    if (status !== "registered") notRegistered++;

    people.push({
      id: m.userId,
      name: m.user.name,
      email: m.user.email,
      kind: m.kind as "TEACHER" | "STUDENT",
      groups: m.kind === "STUDENT" ? (groupNamesByUser.get(m.userId) ?? []) : [],
      status,
      statusDetail: detail,
    });
  }

  return {
    people,
    counts: {
      total: people.length,
      teachers: people.filter((p) => p.kind === "TEACHER").length,
      students: people.filter((p) => p.kind === "STUDENT").length,
      notRegistered,
    },
  };
}

export async function createPerson(
  requestingUserId: string,
  input: { name: string; email: string; kind: Extract<RoleKind, "TEACHER" | "STUDENT">; groupIds: string[] },
): Promise<void> {
  const node = await ownDepartmentNode(requestingUserId);

  const { userId } = await inviteNewUser({
    name: input.name,
    email: input.email,
    role: input.kind,
    managedByNodeId: node.id,
  });
  await prisma.membership.create({ data: { userId, nodeId: node.id, kind: input.kind } });

  if (input.kind === "STUDENT" && input.groupIds.length > 0) {
    const groups = await prisma.studentGroup.findMany({ where: { id: { in: input.groupIds }, nodeId: node.id } });
    if (groups.length !== input.groupIds.length) {
      throw new Error("One or more groups do not belong to your department");
    }
    await prisma.studentGroupMember.createMany({ data: groups.map((g) => ({ groupId: g.id, userId })) });
  }
}

export async function resendForPerson(requestingUserId: string, targetUserId: string): Promise<void> {
  const node = await ownDepartmentNode(requestingUserId);
  const membership = await prisma.membership.findFirst({ where: { userId: targetUserId, nodeId: node.id } });
  if (!membership) throw new Error("This person is not in your department");
  await resendInvitation(targetUserId);
}
