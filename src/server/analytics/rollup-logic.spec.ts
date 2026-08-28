import { describe, it, expect } from "vitest";
import {
  rollupBranch,
  pickOutliers,
  weakestCompetency,
  countDivergentGaps,
  type BranchRollup,
  type RollupContributor,
} from "./rollup-logic";

function contributor(nodeId: string, score: number, n = 10, cells: Map<string, number | null> = new Map()): RollupContributor {
  return { nodeId, name: nodeId, templateTitle: `${nodeId} template`, campaignName: `${nodeId} campaign`, score, n, cells };
}

/** A BranchRollup as rollupBranch would build it for a plain leaf — composite/n/cells
 *  mirror what the fixture's own contributor carries, since as of the dedup rewrite
 *  rollupBranch only ever reads `contributors`, never a child's own composite/n/cells
 *  directly (see rollupBranch's own comment on why). */
function leafRollup(nodeId: string, score: number, n = 10, cells: Map<string, number | null> = new Map()): BranchRollup {
  return { nodeId, name: nodeId, level: 2, n, composite: score, cells, contributors: [contributor(nodeId, score, n, cells)] };
}

describe("rollupBranch", () => {
  it("reports its own measurement untouched when the node ran its own campaign", () => {
    const cells = new Map([["Ethics", 70]]);
    const own = contributor("cse", 58.9, 40, cells);
    const result = rollupBranch(
      { nodeId: "cse", name: "CSE", level: 2, n: 40, composite: 58.9, cells, contributor: own },
      [leafRollup("epc", 90)], // must be ignored — this node reports its own measurement, not a rollup
    );
    expect(result).toEqual({ nodeId: "cse", name: "CSE", level: 2, n: 40, composite: 58.9, cells, contributors: [own] });
  });

  it("means its children's composites when it has no campaign of its own, and lists them as contributors", () => {
    const children: BranchRollup[] = [
      leafRollup("cse", 60, 40, new Map([["Ethics", 70], ["Punctuality", 50]])),
      leafRollup("epc", 70, 20, new Map([["Ethics", 80]])),
    ];
    const result = rollupBranch(
      { nodeId: "eec", name: "EEC", level: 1, n: 0, composite: null, cells: new Map(), contributor: null },
      children,
    );
    expect(result.composite).toBe(65); // mean(60, 70)
    expect(result.n).toBe(60); // sum, not mean — a count, not a rate
    expect(result.cells.get("Ethics")).toBe(75); // mean(70, 80)
    expect(result.cells.get("Punctuality")).toBe(50); // only one child measures it
    expect(result.contributors.map((c) => c.nodeId)).toEqual(["cse", "epc"]);
  });

  it("returns a null composite and no contributors when neither the node nor any child has data", () => {
    const result = rollupBranch(
      { nodeId: "mdes", name: "Mechanical Design", level: 2, n: 0, composite: null, cells: new Map(), contributor: null },
      [],
    );
    expect(result.composite).toBeNull();
    expect(result.n).toBe(0);
    expect(result.cells.size).toBe(0);
    expect(result.contributors).toEqual([]);
  });

  it("skips children with no data of their own rather than treating their null as zero", () => {
    const children: BranchRollup[] = [
      leafRollup("a", 60, 10),
      { nodeId: "b", name: "B", level: 2, n: 0, composite: null, cells: new Map(), contributors: [] },
    ];
    const result = rollupBranch(
      { nodeId: "p", name: "P", level: 1, n: 0, composite: null, cells: new Map(), contributor: null },
      children,
    );
    expect(result.composite).toBe(60);
    expect(result.n).toBe(10);
    expect(result.contributors.map((c) => c.nodeId)).toEqual(["a"]);
  });

  it("flattens contributors through a multi-level rollup instead of just re-listing the direct child", () => {
    // A ← College (rollup of two departments) ← Office (rollup of the college) — the
    // Office's contributors must be the two departments, not the college itself.
    const college: BranchRollup = rollupBranch(
      { nodeId: "college", name: "College", level: 1, n: 0, composite: null, cells: new Map(), contributor: null },
      [leafRollup("cse", 60, 40), leafRollup("epc", 70, 20)],
    );
    const office = rollupBranch(
      { nodeId: "office", name: "Office", level: 0, n: 0, composite: null, cells: new Map(), contributor: null },
      [college],
    );
    expect(office.contributors.map((c) => c.nodeId)).toEqual(["cse", "epc"]);
  });

  it("dedupes a department reachable via two different parent branches instead of double-counting it", () => {
    // The real bug this guards against: CSE reports to both a College and the
    // cross-cutting QA directorate, so at the Office level (whose children are the
    // College AND QA) CSE would otherwise be averaged in twice — once inside the
    // College's own rollup, once again as QA's rollup (since QA's only other
    // department, Applied Physics, has no data here) — inflating CSE's weight and the
    // response count. A department NOT shared (EPC) must still count normally.
    const cseCells = new Map([["Ethics", 70]]);
    const cse = leafRollup("cse", 62.2, 218, cseCells);
    const epc = leafRollup("epc", 63.2, 79, new Map([["Ethics", 62]]));

    const college = rollupBranch(
      { nodeId: "college", name: "College", level: 1, n: 0, composite: null, cells: new Map(), contributor: null },
      [cse, epc],
    );
    // QA's rollup reaches CSE too — a second, independent path to the same leaf.
    const qa = rollupBranch({ nodeId: "qa", name: "QA", level: 1, n: 0, composite: null, cells: new Map(), contributor: null }, [cse]);

    const office = rollupBranch(
      { nodeId: "office", name: "Office", level: 0, n: 0, composite: null, cells: new Map(), contributor: null },
      [college, qa],
    );

    expect(office.contributors.map((c) => c.nodeId).sort()).toEqual(["cse", "epc"]); // cse listed once, not twice
    expect(office.composite).toBe(mean([62.2, 63.2])); // NOT mean(college=62.7, qa=62.2), which would double-weight cse
    expect(office.n).toBe(218 + 79); // NOT 218+79+218 — cse's responses counted once
    expect(office.cells.get("Ethics")).toBe(mean([70, 62])); // NOT weighted by how many paths reach cse
  });
});

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

describe("pickOutliers", () => {
  const mk = (score: number, name: string) => ({ kind: "teacher" as const, name, where: "", why: "", score });

  it("splits a large pool into the requested count on each side with no overlap", () => {
    const candidates = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((s) => mk(s, `t${s}`));
    const { low, high } = pickOutliers(candidates, 4);
    expect(low.map((c) => c.score)).toEqual([10, 20, 30, 40]);
    expect(high.map((c) => c.score)).toEqual([100, 90, 80, 70]);
  });

  it("shrinks below `count` on a small pool instead of overlapping low and high", () => {
    const candidates = [10, 20, 30].map((s) => mk(s, `t${s}`));
    const { low, high } = pickOutliers(candidates, 4);
    expect(low.map((c) => c.score)).toEqual([10]);
    expect(high.map((c) => c.score)).toEqual([30, 20]);
    const names = new Set([...low, ...high].map((c) => c.name));
    expect(names.size).toBe(low.length + high.length); // no candidate appears in both
  });

  it("returns empty arrays for an empty pool", () => {
    expect(pickOutliers([], 4)).toEqual({ low: [], high: [] });
  });
});

describe("weakestCompetency", () => {
  it("picks the lowest mean-scoring competency and counts how often it is the individual low point", () => {
    const leaves = [
      new Map([["Ethics", 70], ["Assessment Feedback", 40]]),
      new Map([["Ethics", 80], ["Assessment Feedback", 50]]),
      new Map([["Ethics", 60], ["Assessment Feedback", 90]]), // here Ethics is the low point, not Assessment Feedback
    ];
    const result = weakestCompetency(leaves);
    expect(result?.title).toBe("Assessment Feedback"); // mean 60 < Ethics mean 70
    expect(result?.score).toBe(60);
    expect(result?.note).toBe("lowest in 2 of 3 branches");
  });

  it("returns null when nothing has any data", () => {
    expect(weakestCompetency([new Map(), new Map([["Ethics", null]])])).toBeNull();
  });
});

describe("countDivergentGaps", () => {
  it("counts gaps beyond the threshold in either direction and ignores nulls", () => {
    expect(countDivergentGaps([20, -20, 10, -10, null, 15.1, -15], 15)).toBe(3); // 20, -20, 15.1 (exactly ±15 does not count)
  });

  it("honors a custom threshold", () => {
    expect(countDivergentGaps([6, -6, 4], 5)).toBe(2);
  });
});
