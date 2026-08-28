"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { dryRunImport, commitImport } from "@/server/import/import";

export async function dryRunImportAction(csv: string) {
  const user = await requireUser();
  try {
    return { ok: true as const, result: await dryRunImport(user.id, csv) };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function commitImportAction(csv: string) {
  const user = await requireUser();
  try {
    const result = await commitImport(user.id, csv);
    revalidatePath("/manage/people");
    return { ok: true as const, result };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
