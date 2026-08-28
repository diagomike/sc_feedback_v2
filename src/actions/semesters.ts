"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import * as semesters from "@/server/semesters";
import { createSemesterSchema } from "@/lib/schemas/semesters";
import type { ActionResult } from "./auth";

async function requireAdmin() {
  const user = await requireUser();
  if (!user.roles.includes("ADMIN")) throw new Error("Only a system administrator can manage semesters");
  return user;
}

export async function createSemesterAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = createSemesterSchema.safeParse({
    academicYear: Number(formData.get("academicYear")),
    term: formData.get("term"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    await semesters.createSemester({
      academicYear: parsed.data.academicYear,
      term: parsed.data.term,
      startsAt: new Date(parsed.data.startsAt),
      endsAt: new Date(parsed.data.endsAt),
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/manage/semesters");
  return { ok: true };
}

export async function deactivateSemesterAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await semesters.deactivateSemester(id);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/manage/semesters");
  return { ok: true };
}

export async function reactivateSemesterAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await semesters.reactivateSemester(id);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/manage/semesters");
  return { ok: true };
}

export async function deleteSemesterAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await semesters.deleteSemester(id);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/manage/semesters");
  return { ok: true };
}
