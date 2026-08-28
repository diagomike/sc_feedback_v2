"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import * as scales from "@/server/scales";
import { saveScaleSchema } from "@/lib/schemas/templates";
import type { ActionResult } from "./auth";

export async function createScaleAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const labels = formData.getAll("pointLabel").map(String);
  const values = formData.getAll("pointValue").map(Number);
  const points = labels.map((label, i) => ({ label, value: values[i] }));

  const parsed = saveScaleSchema.safeParse({ name: formData.get("name"), points });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    await scales.createScale(parsed.data);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/manage/scales");
  return { ok: true };
}

export async function getScaleDetailAction(scaleId: string) {
  await requireUser();
  return scales.getScaleDetail(scaleId);
}

export async function updateScaleAction(scaleId: string, input: { name: string; points: { label: string; value: number }[] }): Promise<ActionResult> {
  await requireUser();
  const parsed = saveScaleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    await scales.updateScale(scaleId, parsed.data);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/manage/scales");
  return { ok: true };
}
