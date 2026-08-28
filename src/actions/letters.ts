"use server";

import { requireUser } from "@/server/auth/session";
import { previewLetters } from "@/server/letters/letters";
import { letterRequestSchema } from "@/lib/schemas/letters";

export async function previewLettersAction(input: unknown) {
  const user = await requireUser();
  const parsed = letterRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid input" };
  try {
    const preview = await previewLetters(user.id, parsed.data);
    return { ok: true as const, preview };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
