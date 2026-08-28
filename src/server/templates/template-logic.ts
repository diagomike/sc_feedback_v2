/**
 * Pure decision logic — no Prisma dependency, so it's directly unit-testable. Ported
 * verbatim from v1's templates/template-logic.ts.
 */

export interface VisibilityInput {
  ownerNodeId: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
}

/**
 * Templates inherit DOWN the hierarchy: an ancestor's template becomes visible to every
 * descendant node once (and only once) it is published. A draft or archived template
 * owned by someone else is never visible, even to a direct descendant.
 */
export function isTemplateVisible(template: VisibilityInput, ownNodeId: string, ancestorIds: string[]): boolean {
  if (template.ownerNodeId === ownNodeId) return true;
  return ancestorIds.includes(template.ownerNodeId) && template.status === "PUBLISHED";
}

export interface SectionForShare {
  id: string;
  type: "LIKERT_GRID" | "FREE_TEXT";
  isOverall: boolean;
  weight: number;
}

/**
 * Each LIKERT_GRID, non-overall section's percentage of the composite — exactly the set
 * computeDashboard() sums over for the overall score, so the builder's weight bars never
 * promise a share that scoring wouldn't actually produce.
 */
export function compositeShares(sections: SectionForShare[]): Map<string, number> {
  const contributing = sections.filter((s) => s.type === "LIKERT_GRID" && !s.isOverall);
  const total = contributing.reduce((sum, s) => sum + s.weight, 0);

  const shares = new Map<string, number>();
  for (const s of sections) {
    const inComposite = s.type === "LIKERT_GRID" && !s.isOverall && total > 0;
    shares.set(s.id, inComposite ? Math.round((s.weight / total) * 1000) / 10 : 0);
  }
  return shares;
}
