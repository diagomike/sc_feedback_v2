"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import * as templates from "@/server/templates/templates";
import { createTemplateSchema, updateTemplateSchema } from "@/lib/schemas/templates";
import type { ActionResult } from "./auth";

export async function createTemplateAction(_prev: ActionResult, formData: FormData): Promise<ActionResult & { id?: string }> {
  const user = await requireUser();
  const parsed = createTemplateSchema.safeParse({
    title: formData.get("title"),
    targetGroup: formData.get("targetGroup"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    const t = await templates.createTemplate(user.id, parsed.data);
    revalidatePath("/manage/templates");
    return { ok: true, id: t.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function updateTemplateAction(
  templateId: string,
  input: { title: string; sections: unknown[] },
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = updateTemplateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    await templates.updateTemplate(user.id, templateId, parsed.data);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath(`/manage/templates/${templateId}`);
  revalidatePath("/manage/templates");
  return { ok: true };
}

export async function cloneTemplateAction(templateId: string): Promise<ActionResult & { id?: string }> {
  const user = await requireUser();
  try {
    const t = await templates.cloneTemplate(user.id, templateId);
    revalidatePath("/manage/templates");
    return { ok: true, id: t.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function publishTemplateAction(templateId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await templates.publishTemplate(user.id, templateId);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath(`/manage/templates/${templateId}`);
  revalidatePath("/manage/templates");
  return { ok: true };
}

export async function archiveTemplateAction(templateId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await templates.archiveTemplate(user.id, templateId);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath(`/manage/templates/${templateId}`);
  revalidatePath("/manage/templates");
  return { ok: true };
}
