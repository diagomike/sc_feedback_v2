/**
 * Pure math for the scope-overview heatmap and outlier lists — no Prisma dependency, so
 * it's directly unit-testable. Ported verbatim from v1's analytics/rollup-logic.ts.
 *
 * A campaign belongs to exactly one HierarchyNode, so there is no single "scope-wide
 * campaign" to read. The heatmap is instead built bottom-up: a node with its own
 * campaign reports its own measured composite; a node without one (an administrative
 * node with no students of its own, e.g. a school or the QA directorate) reports the mean
 * of whichever of its direct children — restricted to the caller's visible set — DO have
 * one. This also naturally handles the QA case: a cross-cutting node's "children" are
 * whichever nodes route to it via a HierarchyEdge, not a subtree, so its rollup only ever
 * pools the branches actually reachable from it.
 *
 * DEDUPING MATTERS because the hierarchy is a DAG, not a tree — a department can report
 * to more than one parent (e.g. CSE reports to both a College and the cross-cutting QA
 * directorate, by design). A node several levels up whose descendants overlap through two
 * different paths (a College that contains CSE, sitting alongside QA which also reaches
 * CSE) must count CSE once, not once per path — otherwise its score is silently
 * over-weighted the higher up the tree you go. `rollupBranch` handles this by always
 * computing from the DEDUPED set of underlying leaf contributors, never by naively
 * meaning its direct children's own composites — see the "Dedupe" comment inside it.
 */

export interface RollupContributor {
  nodeId: string;
  name: string;
  templateTitle: string;
  campaignName: string;
  score: number;
  n: number;
  cells: Map<string, number | null>;
}

export interface BranchRollup {
  nodeId: string;
  name: string;
  level: number;
  n: number;
  composite: number | null;
  cells: Map<string, number | null>;
  contributors: RollupContributor[];
}

export interface OwnMeasurement {
  nodeId: string;
  name: string;
  level: number;
  n: number;
  composite: number | null;
  cells: Map<string, number | null>;
  contributor: RollupContributor | null;
}

/**
 * Combines one node's own measurement (if it ran a campaign of its own) with its
 * already-computed children. A node with its own campaign always reports that — it is
 * never diluted by pooling in child branches it does not administratively contain.
 */
export function rollupBranch(own: OwnMeasurement, children: BranchRollup[]): BranchRollup {
  if (own.composite != null) {
    return {
      nodeId: own.nodeId,
      name: own.name,
      level: own.level,
      n: own.n,
      composite: own.composite,
      cells: own.cells,
      contributors: own.contributor ? [own.contributor] : [],
    };
  }

  const seen = new Map<string, RollupContributor>();
  for (const c of children) for (const contributor of c.contributors) {
    if (!seen.has(contributor.nodeId)) seen.set(contributor.nodeId, contributor);
  }
  const contributors = [...seen.values()];

  const composite = contributors.length > 0 ? mean(contributors.map((c) => c.score)) : null;
  const n = contributors.reduce((sum, c) => sum + c.n, 0);

  const cells = new Map<string, number | null>();
  const titles = new Set<string>();
  for (const c of contributors) for (const t of c.cells.keys()) titles.add(t);
  for (const title of titles) {
    const values = contributors.map((c) => c.cells.get(title)).filter((v): v is number => v != null);
    cells.set(title, values.length > 0 ? mean(values) : null);
  }

  return { nodeId: own.nodeId, name: own.name, level: own.level, n, composite, cells, contributors };
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export interface OutlierCandidate {
  kind: "teacher" | "branch";
  name: string;
  where: string;
  why: string;
  score: number;
}

/**
 * Lowest and highest `count` candidates by score, with no overlap even when the pool is
 * small — a 3-candidate scope gets fewer than 4 of each rather than showing the same
 * entry in both "needs attention" and "strongest".
 */
export function pickOutliers(
  candidates: OutlierCandidate[],
  count = 4,
): { low: OutlierCandidate[]; high: OutlierCandidate[] } {
  const sorted = [...candidates].sort((a, b) => a.score - b.score);
  const n = sorted.length;
  const lowN = Math.min(count, Math.floor(n / 2));
  const highN = Math.min(count, n - lowN);
  return { low: sorted.slice(0, lowN), high: sorted.slice(n - highN).reverse() };
}

export interface WeakestCompetencyResult {
  title: string;
  score: number;
  note: string;
}

/**
 * The scope's single weakest competency, by mean score across every branch that measures
 * it, plus how many of those branches it is individually the low point for.
 */
export function weakestCompetency(leafCells: Map<string, number | null>[]): WeakestCompetencyResult | null {
  const sums = new Map<string, number>();
  const counts = new Map<string, number>();
  const worstCounts = new Map<string, number>();

  for (const cells of leafCells) {
    let worstTitle: string | null = null;
    let worstScore = Infinity;
    for (const [title, score] of cells) {
      if (score == null) continue;
      sums.set(title, (sums.get(title) ?? 0) + score);
      counts.set(title, (counts.get(title) ?? 0) + 1);
      if (score < worstScore) {
        worstScore = score;
        worstTitle = title;
      }
    }
    if (worstTitle != null) worstCounts.set(worstTitle, (worstCounts.get(worstTitle) ?? 0) + 1);
  }

  let best: { title: string; score: number } | null = null;
  for (const [title, sum] of sums) {
    const score = sum / counts.get(title)!;
    if (best == null || score < best.score) best = { title, score };
  }
  if (best == null) return null;

  const measuredBy = counts.get(best.title)!;
  const worstCount = worstCounts.get(best.title) ?? 0;
  return { title: best.title, score: best.score, note: `lowest in ${worstCount} of ${measuredBy} branches` };
}

/** Count of teachers whose composite-vs-self-rated gap exceeds the threshold in either
 *  direction — the scope-level echo of the single-teacher gap panel on the results page. */
export function countDivergentGaps(gaps: (number | null)[], threshold = 15): number {
  return gaps.filter((g) => g != null && Math.abs(g) > threshold).length;
}
