/**
 * Pure semester-related launch guards — no Prisma dependency, mirrors campaign-logic.ts.
 * See schema.prisma's Semester/Term comment for why Summer exists as a term.
 *
 * Deliberately NOT here: any rule restricting which student groups a Summer campaign
 * may assign. Weekend and Extension are just a different class schedule (weekend or
 * evening meetings instead of daytime) taught by the same teachers as Regular sections —
 * Summer exists only because those two programs have reduced per-term contact hours and
 * make up the difference with a summer term, not because they're a different audience
 * that needs enforcing. A department head naturally only assigns Weekend/Extension
 * groups to a Summer campaign because those are the only students in session that term.
 */

/**
 * One campaign per node + semester + target group — two would make "this department's
 * Fall 2026/27 student round" ambiguous for analytics to resolve. `existingTargetGroups`
 * is whichever target groups OTHER campaigns at this node+semester already use.
 */
export function validateSemesterUniqueness(
  ownTargetGroups: string[],
  existingTargetGroups: string[],
  semesterLabel: string,
): string | null {
  const collision = ownTargetGroups.find((g) => existingTargetGroups.includes(g));
  if (!collision) return null;
  return `A ${collision.toLowerCase()} campaign already exists for ${semesterLabel} at this department`;
}
