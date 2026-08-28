import "server-only";
import { prisma } from "@/server/db";
import { semesterLabel, semesterSortKey } from "@/lib/semester";
import type { Term } from "@prisma/client";

export class SemesterError extends Error {}

export interface SemesterRow {
  id: string;
  academicYear: number;
  term: Term;
  label: string;
  startsAt: Date;
  endsAt: Date;
  active: boolean;
  campaignCount: number;
}

/** Newest first — the same "real, admin-managed row" this whole module exists to
 *  provide instead of v1's date-guessing seasonLabel()/offset mechanism (see
 *  schema.prisma's Semester comment). */
export async function listSemesters(): Promise<SemesterRow[]> {
  const rows = await prisma.semester.findMany({
    include: { _count: { select: { campaigns: true } } },
  });
  return rows
    .map((s) => ({
      id: s.id,
      academicYear: s.academicYear,
      term: s.term,
      label: semesterLabel(s),
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      active: s.active,
      campaignCount: s._count.campaigns,
    }))
    .sort((a, b) => semesterSortKey(b) - semesterSortKey(a));
}

export async function createSemester(input: { academicYear: number; term: Term; startsAt: Date; endsAt: Date }) {
  if (input.endsAt <= input.startsAt) {
    throw new SemesterError("End date must be after the start date");
  }
  const existing = await prisma.semester.findUnique({
    where: { academicYear_term: { academicYear: input.academicYear, term: input.term } },
  });
  if (existing) {
    throw new SemesterError(`${semesterLabel(input)} already exists`);
  }
  await prisma.semester.create({ data: input });
}

export async function deactivateSemester(id: string): Promise<void> {
  const s = await prisma.semester.findUniqueOrThrow({ where: { id } });
  if (!s.active) throw new SemesterError("This semester is already inactive");
  await prisma.semester.update({ where: { id }, data: { active: false } });
}

export async function reactivateSemester(id: string): Promise<void> {
  const s = await prisma.semester.findUniqueOrThrow({ where: { id } });
  if (s.active) throw new SemesterError("This semester is already active");
  await prisma.semester.update({ where: { id }, data: { active: true } });
}

/** Real deletion — only when nothing references it, matching deleteNode's precedent
 *  (nothing is ever deleted while it still means something to history). */
export async function deleteSemester(id: string): Promise<void> {
  const count = await prisma.campaign.count({ where: { semesterId: id } });
  if (count > 0) {
    throw new SemesterError(`Cannot delete this semester — ${count} campaign(s) belong to it`);
  }
  await prisma.semester.delete({ where: { id } });
}
