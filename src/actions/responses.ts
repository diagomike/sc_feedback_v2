"use server";

import { requireUser } from "@/server/auth/session";
import * as responses from "@/server/responses/responses";
import { submitResponseSchema } from "@/lib/schemas/responses";

export interface SubmitResult {
  ok: boolean;
  error?: string;
  terminal?: "invalid" | "already" | "closed";
}

export async function submitByTokenAction(token: string, answers: unknown): Promise<SubmitResult> {
  const parsed = submitResponseSchema.safeParse({ answers });
  if (!parsed.success) return { ok: false, error: "Invalid submission" };
  try {
    await responses.submitByToken(token, parsed.data.answers);
    return { ok: true };
  } catch (e) {
    return mapError(e);
  }
}

export async function submitByTaskIdAction(taskId: string, answers: unknown): Promise<SubmitResult> {
  const user = await requireUser();
  const parsed = submitResponseSchema.safeParse({ answers });
  if (!parsed.success) return { ok: false, error: "Invalid submission" };
  try {
    await responses.submitByTaskId(taskId, user.id, parsed.data.answers);
    return { ok: true };
  } catch (e) {
    return mapError(e);
  }
}

function mapError(e: unknown): SubmitResult {
  const err = e as Error;
  if (err.constructor.name === "NotFoundError") return { ok: false, terminal: "invalid", error: err.message };
  if (err.constructor.name === "ConflictError") return { ok: false, terminal: "already", error: err.message };
  if (err.constructor.name === "ClosedError") return { ok: false, terminal: "closed", error: err.message };
  return { ok: false, error: err.message ?? "Could not submit your feedback" };
}
