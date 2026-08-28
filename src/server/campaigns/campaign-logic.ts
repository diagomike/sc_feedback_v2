import type { TargetGroup } from "@prisma/client";

/**
 * Pure min-N gate logic pulled out of CampaignsService so it can be unit tested without
 * a database — mirrors how templates/template-logic.ts keeps the actual rules separate
 * from the Prisma calls that fetch their inputs.
 *
 * A campaign whose only target group is MANAGER is never suppressible: a teacher has
 * exactly one direct manager, so that feedback is identified by design, not anonymous —
 * min-N doesn't apply the way it does to STUDENT/PEER pools.
 */

export interface GateResult {
  ok: boolean;
  label: string;
}

/** The list-row gate — one figure per campaign, pooling every teacher's completed count
 *  across whichever groups they're asked in (list rows don't have per-group detail;
 *  minNGateForTeacher below computes the precise version monitor() shows). */
export function campaignMinNGate(
  tasks: { teacherId: string; completedAt: Date | null }[],
  targetGroupsUsed: TargetGroup[],
  minResponses: number,
): GateResult {
  if (targetGroupsUsed.length > 0 && targetGroupsUsed.every((g) => g === "MANAGER")) {
    return { ok: true, label: "n/a — identified" };
  }
  const teacherIds = [...new Set(tasks.map((t) => t.teacherId))];
  if (teacherIds.length === 0) return { ok: true, label: "not started" };

  const doneByTeacher = new Map<string, number>();
  for (const t of tasks) if (t.completedAt) doneByTeacher.set(t.teacherId, (doneByTeacher.get(t.teacherId) ?? 0) + 1);
  const passCount = teacherIds.filter((id) => (doneByTeacher.get(id) ?? 0) >= minResponses).length;
  return { ok: passCount === teacherIds.length, label: `${passCount} of ${teacherIds.length} teachers` };
}

/** The monitor-row gate — per teacher, per group. A teacher clears the gate only when
 *  EVERY non-MANAGER group they're asked in individually clears minResponses; one weak
 *  group is enough to keep the whole teacher suppressed, same principle as
 *  analytics/scoring.ts's isSuppressed. */
export function teacherMinNGate(
  doneByGroup: Map<TargetGroup, number>,
  targetGroupsUsed: TargetGroup[],
  minResponses: number,
): GateResult {
  const nonManagerGroups = targetGroupsUsed.filter((g) => g !== "MANAGER");
  if (nonManagerGroups.length === 0) return { ok: true, label: "n/a — identified" };
  const failing = nonManagerGroups.filter((g) => (doneByGroup.get(g) ?? 0) < minResponses);
  return { ok: failing.length === 0, label: failing.length === 0 ? "past min-N" : "below min-N" };
}

/**
 * Launch-time window check. "Today counts" — a campaign may open the same day it's
 * launched, so both bounds are `>=`, not `>`, against `today`. Callers pass `today`
 * already truncated to midnight (opensAt/closesAt are date-only inputs from the
 * builder's `<input type="date">`), so a same-day open never fails on a time-of-day
 * technicality.
 */
export function validateWindow(opensAt: Date | null, closesAt: Date | null, today: Date): string | null {
  if (opensAt && opensAt < today) return "Opening date can't be in the past";
  if (closesAt && closesAt < today) return "Closing date can't be in the past";
  if (opensAt && closesAt && closesAt <= opensAt) return "Closing date must be after the opening date";
  return null;
}

/**
 * Launch-time audience floor — configurable per campaign (`minTeachers`/`minStudents`,
 * both default 1). `studentCount` only gates when the campaign actually uses the
 * STUDENT target group; a PEER/MANAGER-only campaign has no students to count. This is
 * also what catches the case a bare "at least one assignment row" check missed: a
 * teacher assigned only to an empty student group used to launch successfully and ask
 * nobody — with the default floor of 1, zero reachable students now fails here instead.
 */
export function validateAudienceMinimums(
  teacherCount: number,
  studentCount: number,
  usesStudentGroup: boolean,
  minTeachers: number,
  minStudents: number,
): string | null {
  if (teacherCount < minTeachers) {
    return `At least ${minTeachers} teacher${minTeachers === 1 ? "" : "s"} must be assigned (${teacherCount} assigned)`;
  }
  if (usesStudentGroup && studentCount < minStudents) {
    return `At least ${minStudents} student${minStudents === 1 ? "" : "s"} must be reachable through assigned groups (${studentCount} reachable)`;
  }
  return null;
}
