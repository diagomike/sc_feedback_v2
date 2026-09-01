"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { dryRunImport, commitImport } from "@/server/import/import";
import {
  commitEnrollments,
  commitOfferings,
  commitStudents,
  dryRunEnrollments,
  dryRunOfferings,
  dryRunStudents,
} from "@/server/import/registry-import";

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

/**
 * The registry importers — students, offerings, enrolments. Each is a dry-run/commit pair
 * that shares one classifier server-side (registry-import.ts), so committing can never do
 * something the preview did not show. The CSV text is re-sent on commit rather than a row
 * list: the client is never trusted to say what should be written.
 */

export async function dryRunStudentsAction(csv: string) {
  const user = await requireUser();
  try {
    return { ok: true as const, result: await dryRunStudents(user.id, csv) };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function commitStudentsAction(csv: string) {
  const user = await requireUser();
  try {
    const result = await commitStudents(user.id, csv);
    revalidatePath("/manage/people");
    revalidatePath("/manage/groups");
    return { ok: true as const, result };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function dryRunOfferingsAction(csv: string, semesterId: string) {
  const user = await requireUser();
  try {
    return { ok: true as const, result: await dryRunOfferings(user.id, csv, semesterId) };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function commitOfferingsAction(csv: string, semesterId: string) {
  const user = await requireUser();
  try {
    const result = await commitOfferings(user.id, csv, semesterId);
    revalidatePath("/manage/offerings");
    revalidatePath("/manage/people");
    return { ok: true as const, result };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function dryRunEnrollmentsAction(csv: string, semesterId: string) {
  const user = await requireUser();
  try {
    return { ok: true as const, result: await dryRunEnrollments(user.id, csv, semesterId) };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function commitEnrollmentsAction(csv: string, semesterId: string) {
  const user = await requireUser();
  try {
    const result = await commitEnrollments(user.id, csv, semesterId);
    revalidatePath("/manage/offerings");
    return { ok: true as const, result };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
