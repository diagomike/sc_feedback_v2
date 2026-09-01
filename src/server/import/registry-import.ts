import "server-only";
import { prisma } from "@/server/db";
import { ownDepartmentNode } from "@/server/scope";
import { semesterLabel } from "@/lib/semester";
import {
  commitEnrollmentsCore,
  commitOfferingsCore,
  commitStudentsCore,
  dryRunEnrollmentsCore,
  dryRunOfferingsCore,
  dryRunStudentsCore,
} from "./registry-core";

/**
 * The department-scoped wrapper around registry-core.ts. This file owns exactly two things
 * the core deliberately does not: the ownDepartmentNode guard (a head loads their OWN
 * department's export, same rule as every other roster surface) and semester resolution.
 * All the import rules live in the core so the real-data loader runs them unchanged.
 */

async function loadSemester(semesterId: string) {
  const semester = await prisma.semester.findUnique({ where: { id: semesterId } });
  if (!semester) throw new Error("Pick a semester before importing");
  return semester;
}

export async function dryRunStudents(requestingUserId: string, csv: string) {
  await ownDepartmentNode(requestingUserId);
  return dryRunStudentsCore(prisma, csv);
}

export async function commitStudents(requestingUserId: string, csv: string) {
  const node = await ownDepartmentNode(requestingUserId);
  return commitStudentsCore(prisma, node.id, csv);
}

export async function dryRunOfferings(requestingUserId: string, csv: string, semesterId: string) {
  const node = await ownDepartmentNode(requestingUserId);
  const semester = await loadSemester(semesterId);
  const result = await dryRunOfferingsCore(prisma, node.id, csv, semester.id);
  return { ...result, semesterLabel: semesterLabel(semester) };
}

export async function commitOfferings(requestingUserId: string, csv: string, semesterId: string) {
  const node = await ownDepartmentNode(requestingUserId);
  const semester = await loadSemester(semesterId);
  return commitOfferingsCore(prisma, node.id, csv, semester.id);
}

export async function dryRunEnrollments(requestingUserId: string, csv: string, semesterId: string) {
  await ownDepartmentNode(requestingUserId);
  const semester = await loadSemester(semesterId);
  const result = await dryRunEnrollmentsCore(prisma, csv, semester.id);
  return { ...result, semesterLabel: semesterLabel(semester) };
}

export async function commitEnrollments(requestingUserId: string, csv: string, semesterId: string) {
  await ownDepartmentNode(requestingUserId);
  const semester = await loadSemester(semesterId);
  return commitEnrollmentsCore(prisma, csv, semester.id);
}
