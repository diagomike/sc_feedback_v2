"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import * as campaigns from "@/server/campaigns/campaigns";
import { createCampaignSchema, updateCampaignSchema } from "@/lib/schemas/campaigns";
import type { ActionResult } from "./auth";

export async function createCampaignAction(_prev: ActionResult, formData: FormData): Promise<ActionResult & { id?: string }> {
  const user = await requireUser();
  const parsed = createCampaignSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type") || "EMAIL",
    semesterId: formData.get("semesterId"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    const c = await campaigns.createCampaign(user.id, parsed.data);
    revalidatePath("/manage/campaigns");
    return { ok: true, id: c.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function updateCampaignAction(campaignId: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = updateCampaignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    await campaigns.updateCampaign(user.id, campaignId, parsed.data);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath(`/manage/campaigns/${campaignId}`);
  revalidatePath("/manage/campaigns");
  return { ok: true };
}

export async function launchCampaignAction(campaignId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await campaigns.launchCampaign(user.id, campaignId);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath(`/manage/campaigns/${campaignId}`);
  revalidatePath("/manage/campaigns");
  return { ok: true };
}

export async function closeCampaignAction(campaignId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await campaigns.closeCampaign(user.id, campaignId);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/manage/campaigns");
  return { ok: true };
}

export async function remindCampaignAction(campaignId: string, teacherId?: string): Promise<ActionResult & { count?: number }> {
  const user = await requireUser();
  try {
    const res = await campaigns.remindCampaign(user.id, campaignId, teacherId);
    return { ok: true, count: res.count };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
