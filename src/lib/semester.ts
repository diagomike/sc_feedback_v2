import type { Term } from "@prisma/client";

/**
 * v2's replacement for v1's `seasonLabel()` date-guessing heuristic
 * (`month >= 6 ? "Fall" : "Spring"`, applied to `closesAt`). A Semester is a real,
 * admin-managed row — see schema.prisma's Semester model comment for the three v1 bugs
 * this removes (duplicate labels, a missing round, NULLS-order flips).
 */

export interface SemesterLike {
  academicYear: number;
  term: Term;
}

const TERM_LABEL: Record<Term, string> = {
  FALL: "Fall",
  SPRING: "Spring",
  SUMMER: "Summer",
};

const TERM_SHORT: Record<Term, string> = {
  FALL: "F",
  SPRING: "S",
  SUMMER: "Su",
};

/** "Fall 2026/27" — academicYear is the start year of the academic year. */
export function semesterLabel(s: SemesterLike): string {
  const endYY = String((s.academicYear + 1) % 100).padStart(2, "0");
  return `${TERM_LABEL[s.term]} ${s.academicYear}/${endYY}`;
}

/** "F26/27" — compact form for chart axes and dense tables. */
export function semesterShortLabel(s: SemesterLike): string {
  const startYY = String(s.academicYear % 100).padStart(2, "0");
  const endYY = String((s.academicYear + 1) % 100).padStart(2, "0");
  return `${TERM_SHORT[s.term]}${startYY}/${endYY}`;
}

/** Chronological sort key — startsAt is the canonical order (never enum declaration
 *  order, which only happens to read Fall/Spring/Summer). */
export function semesterSortKey(s: { startsAt: Date }): number {
  return s.startsAt.getTime();
}
