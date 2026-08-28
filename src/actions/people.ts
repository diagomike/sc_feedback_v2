"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import * as people from "@/server/people";
import { createPersonSchema } from "@/lib/schemas/people";
import type { ActionResult } from "./auth";

export async function createPersonAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = createPersonSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    kind: formData.get("kind"),
    groupIds: formData.getAll("groupIds").map(String),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    await people.createPerson(user.id, parsed.data);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/manage/people");
  return { ok: true };
}

export async function resendPersonInvitationAction(targetUserId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await people.resendForPerson(user.id, targetUserId);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/manage/people");
  return { ok: true };
}
