"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import * as publicCampaigns from "@/server/public/public-campaigns";
import { submitResponseSchema, startBallotSchema } from "@/lib/schemas/responses";

async function hashedIp(): Promise<string | null> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex");
}

export interface StartBallotResult {
  ok: boolean;
  error?: string;
  terminal?: "invalid" | "already" | "closed" | "cap";
  ballotToken?: string;
  form?: Awaited<ReturnType<typeof publicCampaigns.startBallot>>["form"];
}

export async function startBallotAction(slug: string, teacherId: string): Promise<StartBallotResult> {
  const parsed = startBallotSchema.safeParse({ teacherId });
  if (!parsed.success) return { ok: false, error: "Invalid teacher" };
  try {
    const res = await publicCampaigns.startBallot(slug, parsed.data.teacherId, await hashedIp());
    return { ok: true, ballotToken: res.ballotToken, form: res.form };
  } catch (e) {
    return mapError(e);
  }
}

export interface SubmitBallotResult {
  ok: boolean;
  error?: string;
  terminal?: "invalid" | "already" | "closed" | "cap";
}

export async function submitBallotAction(ballotToken: string, answers: unknown): Promise<SubmitBallotResult> {
  const parsed = submitResponseSchema.safeParse({ answers });
  if (!parsed.success) return { ok: false, error: "Invalid submission" };
  try {
    await publicCampaigns.submitBallot(ballotToken, parsed.data.answers);
    return { ok: true };
  } catch (e) {
    return mapError(e);
  }
}

function mapError(e: unknown): { ok: false; error: string; terminal?: "invalid" | "already" | "closed" | "cap" } {
  const err = e as Error;
  const name = err.constructor.name;
  if (name === "NotFoundError") return { ok: false, terminal: "invalid", error: err.message };
  if (name === "ConflictError") return { ok: false, terminal: "already", error: err.message };
  if (name === "GoneError") return { ok: false, terminal: "closed", error: err.message };
  if (name === "CapReachedError") return { ok: false, terminal: "cap", error: err.message };
  return { ok: false, error: err.message ?? "Something went wrong" };
}
