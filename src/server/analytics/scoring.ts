/**
 * Pure scoring math — no Prisma dependency, so it's directly unit-testable. Ported
 * verbatim from v1 (apps/api/src/analytics/scoring.ts). See design/design-context for
 * the rules this implements.
 */

export interface ScoringItem {
  id: string;
  text: string;
  weight: number;
}

export interface ScoringSection {
  id: string;
  title: string;
  type: "LIKERT_GRID" | "FREE_TEXT";
  isOverall: boolean;
  weight: number;
  scaleMin?: number;
  scaleMax?: number;
  scalePoints?: number[];
  items: ScoringItem[];
}

export interface ScoringAnswer {
  itemId: string;
  pointValue: number | null;
  text: string | null;
}

export interface ItemScoreResult {
  itemId: string;
  text: string;
  weight: number;
  score: number | null;
}

export interface SectionScoreResult {
  sectionId: string;
  title: string;
  isOverall: boolean;
  score: number | null;
  weight: number;
  distribution: number[] | null;
  items: ItemScoreResult[];
}

export interface DashboardComputation {
  overallScore: number | null;
  selfRatedOverall: number | null;
  sections: SectionScoreResult[];
  comments: string[];
}

/** The min-N gate: below threshold, every score/comment is withheld so a handful of
 *  respondents in a small cohort can't be de-anonymized by elimination. */
export function isSuppressed(responseCount: number, minResponses: number): boolean {
  return responseCount < minResponses;
}

export interface CohortEntry {
  score: number | null;
  responseCount: number;
}

/**
 * Mean composite across a cohort, used as the anchor that turns a bare score into a
 * position.
 *
 * SECURITY: teachers who have NOT individually cleared min-N are excluded from the
 * mean — including them would reintroduce exactly the leak min-N exists to prevent.
 */
export function cohortAverage(entries: CohortEntry[], minResponses: number): number | null {
  const eligible = entries.filter((e) => e.score != null && !isSuppressed(e.responseCount, minResponses));
  if (eligible.length === 0) return null;
  return eligible.reduce((sum, e) => sum + (e.score as number), 0) / eligible.length;
}

export interface PercentileBand {
  p25: number;
  p75: number;
  mine: number;
  sampleSize: number;
}

const MIN_COLLEAGUES_FOR_BAND = 3;

/**
 * The "middle half of your colleagues" band for the teacher self-view, plus where the
 * caller's own score sits within it.
 *
 * SECURITY: returns null below MIN_COLLEAGUES_FOR_BAND — with one or two colleagues, a
 * teacher who reloads across rounds could infer a specific colleague's score by
 * subtraction, the same small-cohort inference min-N exists to block elsewhere.
 */
export function percentileBand(mine: number, colleagueScores: number[]): PercentileBand | null {
  if (colleagueScores.length < MIN_COLLEAGUES_FOR_BAND) return null;

  const sorted = [...colleagueScores, mine].sort((a, b) => a - b);
  const at = (p: number): number => {
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };

  return { p25: at(25), p75: at(75), mine, sampleSize: colleagueScores.length };
}

export interface OfficialWeights {
  student: number;
  peer: number;
  manager: number;
}

/** The weighting the university's own evaluation legislation specifies: student 50%,
 *  peer 15%, department head 35%. */
export const OFFICIAL_WEIGHTS: OfficialWeights = { student: 0.5, peer: 0.15, manager: 0.35 };

/**
 * The blended composite an official evaluation letter reports — the one place student/
 * peer/head results are deliberately allowed to blend into one score, because the
 * legislation this letter cites explicitly defines a single weighted figure.
 *
 * Returns null if ANY of the three is missing.
 */
export function officialOverall(
  scores: { student: number | null; peer: number | null; manager: number | null },
  weights: OfficialWeights = OFFICIAL_WEIGHTS,
): number | null {
  if (scores.student == null || scores.peer == null || scores.manager == null) return null;
  return scores.student * weights.student + scores.peer * weights.peer + scores.manager * weights.manager;
}

/** (value - min) / (max - min) * 100, guarding a degenerate single-point scale. */
export function normalizeValue(value: number, min: number, max: number): number {
  if (max === min) return 100;
  return ((value - min) / (max - min)) * 100;
}

/**
 * Item score = mean of that item's normalized answers, pooled across every respondent.
 * Section score = item-weighted mean of its items' scores.
 * Overall = section-weighted mean across non-overall LIKERT_GRID sections.
 */
export function computeDashboard(sections: ScoringSection[], answers: ScoringAnswer[]): DashboardComputation {
  const answersByItem = new Map<string, number[]>();
  const textAnswers: string[] = [];
  for (const answer of answers) {
    if (answer.pointValue != null) {
      const list = answersByItem.get(answer.itemId) ?? [];
      list.push(answer.pointValue);
      answersByItem.set(answer.itemId, list);
    }
    if (answer.text != null && answer.text.trim().length > 0) {
      textAnswers.push(answer.text.trim());
    }
  }

  const sectionResults: SectionScoreResult[] = [];
  let compositeNumerator = 0;
  let compositeWeight = 0;
  let selfRatedOverall: number | null = null;

  for (const section of sections) {
    if (section.type === "FREE_TEXT") {
      sectionResults.push({
        sectionId: section.id,
        title: section.title,
        isOverall: section.isOverall,
        score: null,
        weight: section.weight,
        distribution: null,
        items: section.items.map((i) => ({ itemId: i.id, text: i.text, weight: i.weight, score: null })),
      });
      continue;
    }

    const { scaleMin, scaleMax } = section;
    if (scaleMin == null || scaleMax == null) {
      throw new Error(`Section ${section.id} is LIKERT_GRID but has no scale range`);
    }

    const points = section.scalePoints ?? [];
    const distribution = points.length > 0 ? points.map(() => 0) : null;
    const pointIndex = new Map(points.map((v, i) => [v, i]));

    let itemNumerator = 0;
    let itemWeight = 0;
    const itemResults: ItemScoreResult[] = [];

    for (const item of section.items) {
      const raw = answersByItem.get(item.id);

      if (distribution) {
        for (const v of raw ?? []) {
          const idx = pointIndex.get(v);
          if (idx != null) distribution[idx] += 1;
        }
      }

      if (!raw || raw.length === 0) {
        itemResults.push({ itemId: item.id, text: item.text, weight: item.weight, score: null });
        continue;
      }
      const normalized = raw.map((v) => normalizeValue(v, scaleMin, scaleMax));
      const itemMean = normalized.reduce((a, b) => a + b, 0) / normalized.length;
      itemResults.push({ itemId: item.id, text: item.text, weight: item.weight, score: itemMean });
      itemNumerator += itemMean * item.weight;
      itemWeight += item.weight;
    }

    const sectionScore = itemWeight > 0 ? itemNumerator / itemWeight : null;
    sectionResults.push({
      sectionId: section.id,
      title: section.title,
      isOverall: section.isOverall,
      score: sectionScore,
      weight: section.weight,
      distribution,
      items: itemResults,
    });

    if (section.isOverall) {
      selfRatedOverall = sectionScore;
    } else if (sectionScore != null) {
      compositeNumerator += sectionScore * section.weight;
      compositeWeight += section.weight;
    }
  }

  return {
    overallScore: compositeWeight > 0 ? compositeNumerator / compositeWeight : null,
    selfRatedOverall,
    sections: sectionResults,
    comments: textAnswers,
  };
}
