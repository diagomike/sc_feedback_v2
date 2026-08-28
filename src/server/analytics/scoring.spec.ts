import { describe, it, expect } from "vitest";
import {
  computeDashboard,
  normalizeValue,
  isSuppressed,
  cohortAverage,
  percentileBand,
  officialOverall,
  OFFICIAL_WEIGHTS,
  type ScoringSection,
  type ScoringAnswer,
} from "./scoring";

describe("isSuppressed (min-N gate)", () => {
  it("suppresses below the threshold and releases at or above it", () => {
    expect(isSuppressed(4, 5)).toBe(true);
    expect(isSuppressed(5, 5)).toBe(false);
    expect(isSuppressed(6, 5)).toBe(false);
    expect(isSuppressed(0, 5)).toBe(true);
  });

  it("honors a per-campaign override, not just the default of 5", () => {
    expect(isSuppressed(2, 2)).toBe(false);
    expect(isSuppressed(1, 2)).toBe(true);
  });
});

describe("normalizeValue", () => {
  it("maps a value linearly onto 0-100 for the given scale range", () => {
    expect(normalizeValue(1, 1, 5)).toBe(0);
    expect(normalizeValue(5, 1, 5)).toBe(100);
    expect(normalizeValue(3, 1, 5)).toBe(50);
  });

  it("does not divide by zero on a degenerate single-point scale", () => {
    expect(normalizeValue(7, 7, 7)).toBe(100);
  });
});

describe("computeDashboard", () => {
  // Two LIKERT_GRID sections on DIFFERENT scale ranges (1-5 and 0-10), one
  // isOverall section, one FREE_TEXT section, and one LIKERT_GRID section that
  // nobody answered. Numbers are chosen so the expected composite can be
  // verified by hand — see the calculation in comments below.
  const sections: ScoringSection[] = [
    {
      id: "punctuality",
      title: "Punctuality",
      type: "LIKERT_GRID",
      isOverall: false,
      weight: 1,
      scaleMin: 1,
      scaleMax: 5,
      scalePoints: [1, 2, 3, 4, 5],
      items: [
        { id: "p1", text: "Arrives on time", weight: 1 },
        { id: "p2", text: "Uses the full period", weight: 1 },
      ],
    },
    {
      id: "delivery",
      title: "Effective Delivery",
      type: "LIKERT_GRID",
      isOverall: false,
      weight: 2,
      scaleMin: 0,
      scaleMax: 10,
      scalePoints: [0, 2, 4, 6, 8, 10],
      items: [{ id: "d1", text: "Explains clearly", weight: 1 }],
    },
    {
      id: "unanswered",
      title: "Nobody answered this",
      type: "LIKERT_GRID",
      isOverall: false,
      weight: 3, // deliberately large weight — must NOT skew the composite
      scaleMin: 1,
      scaleMax: 5,
      scalePoints: [1, 2, 3, 4, 5],
      items: [{ id: "u1", text: "Never answered", weight: 1 }],
    },
    {
      id: "overall",
      title: "Overall",
      type: "LIKERT_GRID",
      isOverall: true,
      weight: 1,
      scaleMin: 1,
      scaleMax: 5,
      scalePoints: [1, 2, 3, 4, 5],
      items: [{ id: "o1", text: "Overall rating", weight: 1 }],
    },
    {
      id: "comments",
      title: "Comments",
      type: "FREE_TEXT",
      isOverall: false,
      weight: 0,
      items: [{ id: "c1", text: "Anything else?", weight: 1 }],
    },
  ];

  const answers: ScoringAnswer[] = [
    // punctuality: p1 -> [4,5] normalized [75,100] mean 87.5 ; p2 -> [3] normalized 50
    //   section score = (87.5*1 + 50*1) / 2 = 68.75
    { itemId: "p1", pointValue: 4, text: null },
    { itemId: "p1", pointValue: 5, text: null },
    { itemId: "p2", pointValue: 3, text: null },
    // delivery: d1 -> [8] on 0-10 -> normalized 80 ; section score = 80
    { itemId: "d1", pointValue: 8, text: null },
    // overall (isOverall, excluded from composite): o1 -> [5] on 1-5 -> 100
    { itemId: "o1", pointValue: 5, text: null },
    // free text — blanks/whitespace must be filtered out
    { itemId: "c1", pointValue: null, text: "Great teacher" },
    { itemId: "c1", pointValue: null, text: "   " },
    { itemId: "c1", pointValue: null, text: "" },
  ];

  it("computes per-section scores, normalized independently of each section's own scale", () => {
    const result = computeDashboard(sections, answers);
    const byId = Object.fromEntries(result.sections.map((s) => [s.sectionId, s.score]));
    expect(byId.punctuality).toBeCloseTo(68.75);
    expect(byId.delivery).toBeCloseTo(80);
    expect(byId.unanswered).toBeNull();
    expect(byId.comments).toBeNull();
  });

  it("excludes the isOverall section from the composite and reports it separately", () => {
    const result = computeDashboard(sections, answers);
    expect(result.selfRatedOverall).toBeCloseTo(100);
    // composite = (68.75*1 + 80*2) / (1+2) = 76.25 — the isOverall section's
    // weight of 1 must NOT appear in this denominator.
    expect(result.overallScore).toBeCloseTo(76.25);
  });

  it("does not let an unanswered section's weight skew the composite", () => {
    const result = computeDashboard(sections, answers);
    // If the unanswered section's weight=3 had leaked into the denominator,
    // the composite would be (68.75*1 + 80*2) / (1+2+3) = 45.75, not 76.25.
    expect(result.overallScore).toBeCloseTo(76.25);
    expect(result.overallScore).not.toBeCloseTo(45.75);
  });

  it("collects only non-blank free-text answers as comments", () => {
    const result = computeDashboard(sections, answers);
    expect(result.comments).toEqual(["Great teacher"]);
  });

  it("returns nulls throughout when nothing was answered", () => {
    const result = computeDashboard(sections, []);
    expect(result.overallScore).toBeNull();
    expect(result.selfRatedOverall).toBeNull();
    expect(result.comments).toEqual([]);
    expect(result.sections.every((s) => s.score === null)).toBe(true);
  });

  describe("distribution", () => {
    it("aligns counts to scale-point order and keeps unchosen points as zero", () => {
      const result = computeDashboard(sections, answers);
      const punctuality = result.sections.find((s) => s.sectionId === "punctuality")!;
      // scalePoints [1,2,3,4,5]; ratings given were 4, 5 (p1) and 3 (p2).
      // Points 1 and 2 were never chosen and must still be present as zeros —
      // dropping them would silently shift every later bar one column left.
      expect(punctuality.distribution).toEqual([0, 0, 1, 1, 1]);
    });

    it("pools every rating in the section, not one per respondent", () => {
      const result = computeDashboard(sections, answers);
      const punctuality = result.sections.find((s) => s.sectionId === "punctuality")!;
      const total = punctuality.distribution!.reduce((a, b) => a + b, 0);
      expect(total).toBe(3); // 2 ratings on p1 + 1 on p2
    });

    it("aligns to a non-contiguous scale (0,2,4,6,8,10) by value, not by index", () => {
      const result = computeDashboard(sections, answers);
      const delivery = result.sections.find((s) => s.sectionId === "delivery")!;
      // The single rating was 8, which is index 4 of [0,2,4,6,8,10].
      expect(delivery.distribution).toEqual([0, 0, 0, 0, 1, 0]);
    });

    it("is null for free-text sections and all-zero for unanswered grid sections", () => {
      const result = computeDashboard(sections, answers);
      expect(result.sections.find((s) => s.sectionId === "comments")!.distribution).toBeNull();
      expect(result.sections.find((s) => s.sectionId === "unanswered")!.distribution).toEqual([0, 0, 0, 0, 0]);
    });
  });

  describe("per-item detail", () => {
    it("reports each item's own mean", () => {
      const result = computeDashboard(sections, answers);
      const punctuality = result.sections.find((s) => s.sectionId === "punctuality")!;
      const byId = Object.fromEntries(punctuality.items.map((i) => [i.itemId, i.score]));
      expect(byId.p1).toBeCloseTo(87.5); // (75 + 100) / 2
      expect(byId.p2).toBeCloseTo(50);
    });

    it("rolls up to exactly the section score already asserted", () => {
      const result = computeDashboard(sections, answers);
      const punctuality = result.sections.find((s) => s.sectionId === "punctuality")!;
      const answered = punctuality.items.filter((i) => i.score != null);
      const rollup =
        answered.reduce((sum, i) => sum + (i.score as number) * i.weight, 0) /
        answered.reduce((sum, i) => sum + i.weight, 0);
      expect(rollup).toBeCloseTo(punctuality.score!);
      expect(rollup).toBeCloseTo(68.75);
    });

    it("carries item text through and nulls the score for unanswered items", () => {
      const result = computeDashboard(sections, answers);
      const unanswered = result.sections.find((s) => s.sectionId === "unanswered")!;
      expect(unanswered.items[0]).toMatchObject({ text: "Never answered", score: null });
    });
  });
});

describe("cohortAverage (department / faculty anchors)", () => {
  it("averages only teachers who individually cleared min-N", () => {
    const avg = cohortAverage(
      [
        { score: 60, responseCount: 7 },
        { score: 80, responseCount: 5 },
        { score: 10, responseCount: 2 }, // below min-N — must not pull the mean down
      ],
      5,
    );
    expect(avg).toBeCloseTo(70); // (60 + 80) / 2, not (60 + 80 + 10) / 3
  });

  it("does not let a suppressed teacher's score be derived by differencing", () => {
    // The leak: a two-teacher department where one is suppressed. If the average
    // included the suppressed teacher, anyone could compute
    //   suppressed = average * 2 - visible
    // and recover exactly the number min-N exists to hide.
    const visible = { score: 60, responseCount: 9 };
    const suppressed = { score: 20, responseCount: 1 };

    const avg = cohortAverage([visible, suppressed], 5)!;

    expect(avg).toBeCloseTo(60); // the visible teacher alone
    const derived = avg * 2 - visible.score;
    expect(derived).not.toBeCloseTo(suppressed.score);
  });

  it("returns null when nobody in the cohort cleared min-N", () => {
    expect(cohortAverage([{ score: 50, responseCount: 1 }], 5)).toBeNull();
  });

  it("returns null for an empty cohort rather than NaN", () => {
    expect(cohortAverage([], 5)).toBeNull();
  });

  it("ignores entries that cleared min-N but have no computable score", () => {
    const avg = cohortAverage(
      [
        { score: null, responseCount: 8 }, // answered, but nothing scoreable
        { score: 40, responseCount: 8 },
      ],
      5,
    );
    expect(avg).toBeCloseTo(40);
  });
});

describe("percentileBand (self-view 'against your colleagues')", () => {
  it("returns null below the minimum colleague count", () => {
    expect(percentileBand(55, [])).toBeNull();
    expect(percentileBand(55, [60])).toBeNull();
    expect(percentileBand(55, [60, 70])).toBeNull(); // exactly 2 — still under the gate
  });

  it("computes an interpolated 25th/75th percentile once the gate clears", () => {
    // 3 colleagues is exactly the minimum — sorted with mine: [40, 50, 55, 60, 70]
    const band = percentileBand(55, [40, 50, 60, 70])!;
    expect(band).not.toBeNull();
    expect(band.mine).toBe(55);
    expect(band.sampleSize).toBe(4);
    // idx(25) = 0.25*4 = 1 -> exact -> sorted[1] = 50
    expect(band.p25).toBeCloseTo(50);
    // idx(75) = 0.75*4 = 3 -> exact -> sorted[3] = 60
    expect(band.p75).toBeCloseTo(60);
  });

  it("interpolates between points when the percentile index is fractional", () => {
    // sorted with mine: [10, 20, 30] — idx(25) = 0.25*2 = 0.5 -> halfway between 10 and 20
    const band = percentileBand(30, [10, 20])!;
    expect(band).toBeNull(); // only 2 colleagues — gate still applies

    const withThird = percentileBand(30, [10, 20, 25])!; // sorted: [10,20,25,30]
    // idx(25) = 0.25*3 = 0.75 -> between sorted[0]=10 and sorted[1]=20
    expect(withThird.p25).toBeCloseTo(10 + (20 - 10) * 0.75);
  });

  it("does not let a two-colleague comparison identify a specific colleague's score", () => {
    // With the gate at 3, a manager or teacher watching this band across rounds
    // cannot isolate one colleague's movement the way a 1- or 2-person cohort would.
    expect(percentileBand(50, [45, 55])).toBeNull();
  });
});

describe("officialOverall (evaluation-letter weighting)", () => {
  it("matches the legislated 50/15/35 split", () => {
    expect(OFFICIAL_WEIGHTS).toEqual({ student: 0.5, peer: 0.15, manager: 0.35 });
  });

  it("reproduces the sample letter's own arithmetic: 5.00/5.00/5.00 -> 5.00 overall", () => {
    const overall = officialOverall({ student: 100, peer: 100, manager: 100 });
    // On our 0-100 scale, a perfect score everywhere is 100 — equivalent to the
    // sample letter's "5.00, 5.00, and 5.00 ... results in 5.00 overall".
    expect(overall).toBeCloseTo(100);
  });

  it("weights each source by its stated share, not a plain average", () => {
    // student 80, peer 40, manager 60 -> 80*.5 + 40*.15 + 60*.35 = 40 + 6 + 21 = 67
    const overall = officialOverall({ student: 80, peer: 40, manager: 60 });
    expect(overall).toBeCloseTo(67);
  });

  it("returns null when any one source is missing, rather than silently reweighting", () => {
    // A formula that quietly renormalizes over the sources it happens to have is not
    // the 50/15/35 split the letter cites — it would be a different, unstated formula.
    expect(officialOverall({ student: 80, peer: null, manager: 60 })).toBeNull();
    expect(officialOverall({ student: null, peer: 40, manager: 60 })).toBeNull();
    expect(officialOverall({ student: 80, peer: 40, manager: null })).toBeNull();
  });

  it("accepts custom weights without mutating the exported default", () => {
    const overall = officialOverall({ student: 100, peer: 0, manager: 0 }, { student: 1, peer: 0, manager: 0 });
    expect(overall).toBeCloseTo(100);
    expect(OFFICIAL_WEIGHTS.student).toBe(0.5); // untouched
  });
});
