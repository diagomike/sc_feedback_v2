"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import * as groups from "@/server/groups";
import { createGroupSchema } from "@/lib/schemas/people";
import type { ActionResult } from "./auth";

export async function createGroupAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = createGroupSchema.safeParse({ name: formData.get("name"), program: formData.get("program") });
  if (!parsed.success) return { ok: false, error: "Enter a valid name" };

  try {
    await groups.createGroup(user.id, parsed.data);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/manage/groups");
  return { ok: true };
}

export async function addGroupMembersAction(groupId: string, userIds: string[]): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await groups.addMembers(user.id, groupId, userIds);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath(`/manage/groups`);
  return { ok: true };
}

export async function getGroupDetailAction(groupId: string) {
  const user = await requireUser();
  return groups.getGroup(user.id, groupId);
}

export async function listCandidatesAction(groupId: string) {
  const user = await requireUser();
  return groups.listCandidates(user.id, groupId);
}

export async function removeGroupMemberAction(groupId: string, userId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await groups.removeMember(user.id, groupId, userId);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath(`/manage/groups`);
  return { ok: true };
}
