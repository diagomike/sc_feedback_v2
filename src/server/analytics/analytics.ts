import "server-only";
import { prisma } from "@/server/db";
import { visibleNodeIds } from "@/server/scope";
import { semesterLabel } from "@/lib/semester";
import {
  computeDashboard,
  isSuppressed,
  cohortAverage,
  percentileBand,
  officialOverall,
  type ScoringSection,
  type SectionScoreResult,
} from "./scoring";
import {
  rollupBranch,
  pickOutliers,
  weakestCompetency as pickWeakestCompetency,
  countDivergentGaps,
  type BranchRollup,
  type OwnMeasurement,
  type OutlierCandidate,
  type RollupContributor,
} from "./rollup-logic";
import type { TargetGroup } from "@prisma/client";

export class NotFoundError extends Error {}
export class ForbiddenError extends Error {}

type LoadedTemplate = Awaited<ReturnType<typeof loadTemplateById>>;

/**
 * Ported from v1's AnalyticsService. The one structural change throughout: every
 * "which round" question is answered by a real `semesterId` instead of v1's `offset`
 * (skip/take over closesAt-ordered campaigns) — see schema.prisma's Semester comment
 * for the three v1 bugs that mechanism produced. `resolveNodeCampaign` now does a
 * direct semesterId lookup, and `listScopeSemesters` replaces `listScopeRounds`'
 * anchor-node hack with a plain "which semesters actually have a campaign in this
 * scope" query — the bug class it worked around cannot recur once every campaign
 * belongs to a real, shared Semester row.
 */

async function loadTemplateById(templateId: string) {
  return prisma.template.findUniqueOrThrow({
    where: { id: templateId },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: { items: { orderBy: { order: "asc" } }, scale: { include: { points: { orderBy: { order: "asc" } } } } },
      },
    },
  });
}

function toScoringSections(template: LoadedTemplate): ScoringSection[] {
  return template.sections.map((s) => {
    const values = s.scale?.points.map((p) => p.value) ?? [];
    return {
      id: s.id,
      title: s.title,
      type: s.type,
      isOverall: s.isOverall,
      weight: s.weight,
      scaleMin: values.length ? Math.min(...values) : undefined,
      scaleMax: values.length ? Math.max(...values) : undefined,
      scalePoints: values.length ? values : undefined,
      items: s.items.map((i) => ({ id: i.id, text: i.text, weight: i.weight })),
    };
  });
}

async function loadTemplate(campaignId: string, targetGroup: TargetGroup) {
  const ct = await prisma.campaignTemplate.findUnique({ where: { campaignId_targetGroup: { campaignId, targetGroup } } });
  if (!ct) throw new NotFoundError(`No ${targetGroup} template configured for this campaign`);
  return loadTemplateById(ct.templateId);
}

function countResponses(campaignId: string, teacherId: string, templateId: string) {
  return prisma.response.count({ where: { campaignId, teacherId, templateId, revokedAt: null } });
}

async function loadAnswers(campaignId: string, teacherId: string, templateId: string) {
  return prisma.answer.findMany({ where: { response: { campaignId, teacherId, templateId, revokedAt: null } }, select: { itemId: true, pointValue: true, text: true } });
}

/**
 * One node's own most recent EMAIL campaign for `targetGroup` in a given semester (or,
 * with semesterId omitted, its most recently closed/open one overall) — direct lookup,
 * no skip/take. INSTANT/guest campaigns are excluded — see v1's doc comment (ported
 * below) for why an open-ended guest link was never meant to represent a term round.
 */
async function resolveNodeCampaign(nodeId: string, targetGroup: TargetGroup, semesterId?: string) {
  const [campaign] = await prisma.campaign.findMany({
    where: {
      nodeId,
      type: "EMAIL",
      status: { in: ["OPEN", "CLOSED"] },
      campaignTemplates: { some: { targetGroup } },
      ...(semesterId ? { semesterId } : {}),
    },
    orderBy: [{ closesAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 1,
  });
  return campaign ?? null;
}

async function assertCanView(params: { campaign: { nodeId: string; status: string }; teacherId: string; requestingUserId: string }): Promise<void> {
  const { campaign, teacherId, requestingUserId } = params;
  if (requestingUserId === teacherId) {
    if (campaign.status !== "CLOSED") throw new ForbiddenError("Results are available once the campaign has closed");
    return;
  }
  const visible = await visibleNodeIds({ id: requestingUserId, roles: await rolesOf(requestingUserId) });
  if (!visible.includes(campaign.nodeId)) throw new ForbiddenError("You do not have access to this campaign's results");
}

async function rolesOf(userId: string): Promise<string[]> {
  const rows = await prisma.userRole.findMany({ where: { userId }, select: { kind: true } });
  return rows.map((r) => r.kind);
}

/**
 * Dashboard for one (campaign, teacher, targetGroup) triple. Each target group uses a
 * different template, so student/peer/head results are reported separately and never
 * blend into one score. Every result is gated by min-N.
 */
export async function getDashboard(params: { campaignId: string; teacherId: string; targetGroup: TargetGroup; requestingUserId: string }) {
  const { campaignId, teacherId, targetGroup, requestingUserId } = params;

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError("Campaign not found");
  const teacher = await prisma.user.findUnique({ where: { id: teacherId } });
  if (!teacher) throw new NotFoundError("Teacher not found");

  await assertCanView({ campaign, teacherId, requestingUserId });

  const template = await loadTemplate(campaignId, targetGroup);
  const responseCount = await countResponses(campaignId, teacherId, template.id);
  const asked = await prisma.responseTask.count({ where: { campaignId, teacherId, targetGroup } });
  const suppressed = isSuppressed(responseCount, campaign.minResponses);

  const base = {
    teacherId,
    teacherName: teacher.name,
    campaignId,
    campaignName: campaign.name,
    campaignStatus: campaign.status,
    responseCount,
    minResponses: campaign.minResponses,
    responseRate: { responded: responseCount, asked },
  };

  const ghostSections = template.sections.map((s) => ({
    sectionId: s.id,
    title: s.title,
    isOverall: s.isOverall,
    score: null as number | null,
    weight: s.weight,
    distribution: null as number[] | null,
    scalePoints: s.scale ? s.scale.points.map((p) => ({ label: p.label, value: p.value })) : null,
    items: s.items.map((i) => ({ itemId: i.id, text: i.text, weight: i.weight, score: null as number | null })),
    departmentAverage: null as number | null,
  }));

  if (suppressed) {
    return { ...base, suppressed: true as const, overallScore: null, selfRatedOverall: null, departmentAverage: null, facultyAverage: null, sections: ghostSections, comments: [] as string[] };
  }

  const computed = computeDashboard(toScoringSections(template), await loadAnswers(campaignId, teacherId, template.id));
  const anchors = await computeAnchors({ campaign, template, targetGroup });

  return {
    ...base,
    suppressed: false as const,
    overallScore: computed.overallScore,
    selfRatedOverall: computed.selfRatedOverall,
    departmentAverage: anchors.departmentAverage,
    facultyAverage: anchors.facultyAverage,
    sections: computed.sections.map((s) => {
      const src = template.sections.find((t) => t.id === s.sectionId);
      return { ...s, scalePoints: src?.scale ? src.scale.points.map((p) => ({ label: p.label, value: p.value })) : null, departmentAverage: anchors.perSection.get(s.sectionId) ?? null };
    }),
    comments: computed.comments,
  };
}

/** Campaigns whose results the caller may read, newest first. */
export async function listAnalyticsCampaigns(requestingUserId: string) {
  const visible = await visibleNodeIds({ id: requestingUserId, roles: await rolesOf(requestingUserId) });
  if (visible.length === 0) return [];

  const campaigns = await prisma.campaign.findMany({
    where: { nodeId: { in: visible }, status: { in: ["OPEN", "CLOSED"] } },
    include: { node: { select: { name: true } }, campaignTemplates: { select: { targetGroup: true } }, semester: true },
    orderBy: [{ closesAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  });
  campaigns.sort((a, b) => Number(b.status === "OPEN") - Number(a.status === "OPEN"));

  const rows = [];
  for (const c of campaigns) {
    const teacherCount = (await prisma.responseTask.findMany({ where: { campaignId: c.id }, select: { teacherId: true }, distinct: ["teacherId"] })).length;
    rows.push({
      id: c.id,
      name: c.name,
      status: c.status,
      nodeName: c.node.name,
      semesterLabel: semesterLabel(c.semester),
      opensAt: c.opensAt,
      closesAt: c.closesAt,
      minResponses: c.minResponses,
      targetGroups: c.campaignTemplates.map((t) => t.targetGroup),
      teacherCount,
    });
  }
  return rows;
}

/** Every teacher under evaluation in a campaign, with their standing per target group. */
export async function listTeachers(params: { campaignId: string; requestingUserId: string }) {
  const campaign = await prisma.campaign.findUnique({ where: { id: params.campaignId }, include: { campaignTemplates: true } });
  if (!campaign) throw new NotFoundError("Campaign not found");

  const visible = await visibleNodeIds({ id: params.requestingUserId, roles: await rolesOf(params.requestingUserId) });
  if (!visible.includes(campaign.nodeId)) throw new ForbiddenError("You do not have access to this campaign's results");

  const teacherIds = (await prisma.responseTask.findMany({ where: { campaignId: campaign.id }, select: { teacherId: true }, distinct: ["teacherId"] })).map((t) => t.teacherId);
  const teachers = await prisma.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true }, orderBy: { name: "asc" } });

  const rows = [];
  for (const teacher of teachers) {
    const groups = [];
    for (const ct of campaign.campaignTemplates) {
      const responded = await countResponses(campaign.id, teacher.id, ct.templateId);
      const asked = await prisma.responseTask.count({ where: { campaignId: campaign.id, teacherId: teacher.id, targetGroup: ct.targetGroup } });
      if (asked === 0 && responded === 0) continue;

      const suppressed = isSuppressed(responded, campaign.minResponses);
      let score: number | null = null;
      if (!suppressed) {
        const template = await loadTemplateById(ct.templateId);
        score = computeDashboard(toScoringSections(template), await loadAnswers(campaign.id, teacher.id, ct.templateId)).overallScore;
      }
      groups.push({ targetGroup: ct.targetGroup, responded, asked, minResponses: campaign.minResponses, suppressed, score });
    }
    rows.push({ teacherId: teacher.id, name: teacher.name, groups });
  }
  return rows;
}

/** Composite per closed campaign for one teacher, oldest first. */
export async function getHistory(params: { teacherId: string; targetGroup: TargetGroup; requestingUserId: string }) {
  const { teacherId, targetGroup, requestingUserId } = params;

  const isSelf = requestingUserId === teacherId;
  const visible = isSelf ? [] : await visibleNodeIds({ id: requestingUserId, roles: await rolesOf(requestingUserId) });
  if (!isSelf && visible.length === 0) throw new ForbiddenError("You do not have access to these results");

  const campaigns = await prisma.campaign.findMany({
    where: { status: "CLOSED", ...(isSelf ? {} : { nodeId: { in: visible } }), tasks: { some: { teacherId, targetGroup } } },
    include: { semester: true },
    orderBy: [{ closesAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });

  const points = [];
  for (const campaign of campaigns) {
    const ct = await prisma.campaignTemplate.findUnique({ where: { campaignId_targetGroup: { campaignId: campaign.id, targetGroup } } });
    if (!ct) continue;

    const responseCount = await countResponses(campaign.id, teacherId, ct.templateId);
    const suppressed = isSuppressed(responseCount, campaign.minResponses);

    let score: number | null = null;
    if (!suppressed) {
      const template = await loadTemplateById(ct.templateId);
      score = computeDashboard(toScoringSections(template), await loadAnswers(campaign.id, teacherId, ct.templateId)).overallScore;
    }

    points.push({
      campaignId: campaign.id,
      campaignName: campaign.name,
      label: semesterLabel(campaign.semester),
      closedAt: campaign.closesAt ?? null,
      score,
      responseCount,
      suppressed,
    });
  }

  return { teacherId, points };
}

/** "My feedback" — the teacher self-view. */
export async function getSelfSummary(params: { teacherId: string; targetGroup: TargetGroup }) {
  const { teacherId, targetGroup } = params;

  const emptyBase = {
    hasData: false as const,
    targetGroup,
    campaignName: null as string | null,
    closedAt: null as Date | null,
    responseCount: 0,
    askedCount: 0,
    minResponses: 0,
    suppressed: false,
    overallScore: null as number | null,
    strongest: [] as { sectionId: string; title: string; score: number; departmentAverage: number | null }[],
    weakest: [] as { sectionId: string; title: string; score: number; departmentAverage: number | null }[],
    comments: [] as string[],
    history: [] as Awaited<ReturnType<typeof getHistory>>["points"],
    percentile: null as ReturnType<typeof percentileBand>,
  };

  const campaign = await prisma.campaign.findFirst({
    where: { status: "CLOSED", tasks: { some: { teacherId, targetGroup } } },
    orderBy: [{ closesAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  });
  if (!campaign) return emptyBase;

  const [dashboard, history] = await Promise.all([
    getDashboard({ campaignId: campaign.id, teacherId, targetGroup, requestingUserId: teacherId }),
    getHistory({ teacherId, targetGroup, requestingUserId: teacherId }),
  ]);

  const shared = {
    ...emptyBase,
    hasData: true as const,
    campaignName: dashboard.campaignName,
    closedAt: campaign.closesAt ?? null,
    responseCount: dashboard.responseCount,
    askedCount: dashboard.responseRate.asked,
    minResponses: dashboard.minResponses,
    suppressed: dashboard.suppressed,
    history: history.points,
  };

  if (dashboard.suppressed || dashboard.overallScore == null) return shared;

  const scored = dashboard.sections.filter((s): s is (typeof dashboard.sections)[number] & { score: number } => !s.isOverall && s.score != null);
  const bySc = [...scored].sort((a, b) => b.score - a.score);
  const strongest = bySc.slice(0, 2);
  const weakest = bySc.slice(-2).reverse().filter((s) => !strongest.includes(s));
  const toSelfSection = (s: (typeof scored)[number]) => ({ sectionId: s.sectionId, title: s.title, score: s.score, departmentAverage: s.departmentAverage });

  const template = await loadTemplate(campaign.id, targetGroup);
  const colleagueScores = await colleagueComposites(campaign, template, targetGroup, teacherId);

  return {
    ...shared,
    overallScore: dashboard.overallScore,
    strongest: strongest.map(toSelfSection),
    weakest: weakest.map(toSelfSection),
    comments: dashboard.comments,
    percentile: percentileBand(dashboard.overallScore, colleagueScores),
  };
}

/** The Me page's "overall performance" summary strip. */
export async function getSelfOverall(teacherId: string) {
  const [student, peer, manager] = await Promise.all([
    getSelfSummary({ teacherId, targetGroup: "STUDENT" }),
    getSelfSummary({ teacherId, targetGroup: "PEER" }),
    getSelfSummary({ teacherId, targetGroup: "MANAGER" }),
  ]);
  const scores = {
    student: student.hasData && !student.suppressed ? student.overallScore : null,
    peer: peer.hasData && !peer.suppressed ? peer.overallScore : null,
    manager: manager.hasData && !manager.suppressed ? manager.overallScore : null,
  };
  return { ...scores, overall: officialOverall(scores) };
}

async function colleagueComposites(campaign: { id: string; minResponses: number }, template: LoadedTemplate, targetGroup: TargetGroup, excludeTeacherId: string): Promise<number[]> {
  const teacherIds = (await prisma.responseTask.findMany({ where: { campaignId: campaign.id, targetGroup, teacherId: { not: excludeTeacherId } }, select: { teacherId: true }, distinct: ["teacherId"] })).map((t) => t.teacherId);
  const scoringSections = toScoringSections(template);
  const scores: number[] = [];
  for (const tid of teacherIds) {
    const responseCount = await countResponses(campaign.id, tid, template.id);
    if (isSuppressed(responseCount, campaign.minResponses)) continue;
    const computed = computeDashboard(scoringSections, await loadAnswers(campaign.id, tid, template.id));
    if (computed.overallScore != null) scores.push(computed.overallScore);
  }
  return scores;
}

/**
 * Department and faculty means, plus a per-competency department mean. Faculty average
 * now uses the SAME semester as the campaign being viewed for every reachable node —
 * a real shared timeline, not v1's "offset=0" per node (which could silently compare
 * across different terms when a school's own history wasn't the same depth as the
 * department's).
 */
async function computeAnchors(params: { campaign: { id: string; nodeId: string; semesterId: string; minResponses: number }; template: LoadedTemplate; targetGroup: TargetGroup }) {
  const { campaign, template, targetGroup } = params;

  const peerTeacherIds = (await prisma.responseTask.findMany({ where: { campaignId: campaign.id, targetGroup }, select: { teacherId: true }, distinct: ["teacherId"] })).map((t) => t.teacherId);
  const scoringSections = toScoringSections(template);
  const perSectionScores = new Map<string, { score: number | null; responseCount: number }[]>();
  const composites: { score: number | null; responseCount: number }[] = [];

  for (const tid of peerTeacherIds) {
    const responseCount = await countResponses(campaign.id, tid, template.id);
    const computed = computeDashboard(scoringSections, await loadAnswers(campaign.id, tid, template.id));
    composites.push({ score: computed.overallScore, responseCount });
    for (const s of computed.sections) {
      const list = perSectionScores.get(s.sectionId) ?? [];
      list.push({ score: s.score, responseCount });
      perSectionScores.set(s.sectionId, list);
    }
  }

  const perSection = new Map<string, number | null>();
  for (const [sectionId, entries] of perSectionScores) perSection.set(sectionId, cohortAverage(entries, campaign.minResponses));

  const ancestorIds = (await prisma.hierarchyClosure.findMany({ where: { descendantId: campaign.nodeId, depth: { gt: 0 } }, select: { ancestorId: true } })).map((a) => a.ancestorId);

  let facultyAverage: { value: number; contributors: RollupContributor[] } | null = null;
  if (ancestorIds.length > 0) {
    const facultyNodes = await prisma.hierarchyClosure.findMany({ where: { ancestorId: { in: ancestorIds } }, select: { descendantId: true, descendant: { select: { name: true } } }, distinct: ["descendantId"] });
    const contributors: RollupContributor[] = [];
    for (const n of facultyNodes) {
      const contributor = await computeNodeSemesterComposite(n.descendantId, n.descendant.name, targetGroup, campaign.semesterId);
      if (contributor) contributors.push(contributor as unknown as RollupContributor);
    }
    if (contributors.length > 0) facultyAverage = { value: contributors.reduce((sum, c) => sum + c.score, 0) / contributors.length, contributors };
  }

  return { departmentAverage: cohortAverage(composites, campaign.minResponses), facultyAverage, perSection };
}

/**
 * One node's contribution to the scope rollup: its own campaign for `targetGroup` in
 * `semesterId`, scored exactly like `computeAnchors`' department average. Returns an
 * empty measurement — not an error — when the node has no such campaign, so
 * rollupBranch can fall back to its children.
 */
async function loadNodeStanding(params: { node: { id: string; name: string; level: number }; targetGroup: TargetGroup; semesterId: string }) {
  const { node, targetGroup, semesterId } = params;
  const empty = {
    own: { nodeId: node.id, name: node.name, level: node.level, n: 0, composite: null, cells: new Map<string, number | null>(), contributor: null } as OwnMeasurement,
    campaignName: null as string | null,
    coverage: { pastMinN: 0, total: 0 },
    candidates: [] as OutlierCandidate[],
    gaps: [] as (number | null)[],
  };

  const campaign = await resolveNodeCampaign(node.id, targetGroup, semesterId);
  if (!campaign) return empty;

  const ct = await prisma.campaignTemplate.findUnique({ where: { campaignId_targetGroup: { campaignId: campaign.id, targetGroup } } });
  if (!ct) return empty;

  const template = await loadTemplateById(ct.templateId);
  const sections = toScoringSections(template);

  const teacherIds = (await prisma.responseTask.findMany({ where: { campaignId: campaign.id, targetGroup }, select: { teacherId: true }, distinct: ["teacherId"] })).map((t) => t.teacherId);
  if (teacherIds.length === 0) return { ...empty, campaignName: campaign.name };

  const teachers = await prisma.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true } });
  const teacherNameById = new Map(teachers.map((t) => [t.id, t.name]));

  const perTeacher: { teacherId: string; responseCount: number; suppressed: boolean; computed: ReturnType<typeof computeDashboard> }[] = [];
  const composites: { score: number | null; responseCount: number }[] = [];
  const perSectionScores = new Map<string, { score: number | null; responseCount: number }[]>();

  for (const teacherId of teacherIds) {
    const responseCount = await countResponses(campaign.id, teacherId, template.id);
    const computed = computeDashboard(sections, await loadAnswers(campaign.id, teacherId, template.id));
    const suppressed = isSuppressed(responseCount, campaign.minResponses);
    perTeacher.push({ teacherId, responseCount, suppressed, computed });

    composites.push({ score: computed.overallScore, responseCount });
    for (const s of computed.sections) {
      if (s.isOverall || s.distribution === null) continue;
      const list = perSectionScores.get(s.title) ?? [];
      list.push({ score: s.score, responseCount });
      perSectionScores.set(s.title, list);
    }
  }

  const nodeComposite = cohortAverage(composites, campaign.minResponses);

  const candidates: OutlierCandidate[] = [];
  const gaps: (number | null)[] = [];
  let pastMinN = 0;

  for (const { teacherId, suppressed, computed } of perTeacher) {
    if (suppressed) continue;
    pastMinN += 1;

    if (computed.overallScore != null && computed.selfRatedOverall != null) gaps.push(computed.selfRatedOverall - computed.overallScore);

    const scored = computed.sections.filter((s): s is SectionScoreResult & { score: number } => !s.isOverall && s.score != null);
    if (computed.overallScore != null && scored.length > 0) {
      const composite = computed.overallScore;
      const anchor = nodeComposite ?? composite;
      const pick = composite >= anchor ? scored.reduce((a, b) => (b.score > a.score ? b : a)) : scored.reduce((a, b) => (b.score < a.score ? b : a));
      candidates.push({ kind: "teacher", name: teacherNameById.get(teacherId) ?? "Unknown", where: node.name, why: `${pick.title} ${pick.score.toFixed(1)}`, score: composite });
    }
  }

  const cells = new Map<string, number | null>();
  for (const [title, entries] of perSectionScores) cells.set(title, cohortAverage(entries, campaign.minResponses));
  const n = composites.reduce((sum, c) => sum + c.responseCount, 0);
  const composite = cohortAverage(composites, campaign.minResponses);

  return {
    own: {
      nodeId: node.id,
      name: node.name,
      level: node.level,
      n,
      composite,
      cells,
      contributor: composite != null ? { nodeId: node.id, name: node.name, templateTitle: template.title, campaignName: campaign.name, score: composite, n, cells } : null,
    },
    campaignName: campaign.name,
    coverage: { pastMinN, total: teacherIds.length },
    candidates,
    gaps,
  };
}

async function computeNodeSemesterComposite(nodeId: string, nodeName: string, targetGroup: TargetGroup, semesterId: string) {
  const campaign = await resolveNodeCampaign(nodeId, targetGroup, semesterId);
  if (!campaign) return null;

  const ct = await prisma.campaignTemplate.findUnique({ where: { campaignId_targetGroup: { campaignId: campaign.id, targetGroup } } });
  if (!ct) return null;

  const template = await loadTemplateById(ct.templateId);
  const sections = toScoringSections(template);

  const teacherIds = (await prisma.responseTask.findMany({ where: { campaignId: campaign.id, targetGroup }, select: { teacherId: true }, distinct: ["teacherId"] })).map((t) => t.teacherId);
  if (teacherIds.length === 0) return null;

  const composites: { score: number | null; responseCount: number }[] = [];
  for (const teacherId of teacherIds) {
    const responseCount = await countResponses(campaign.id, teacherId, template.id);
    const computed = computeDashboard(sections, await loadAnswers(campaign.id, teacherId, template.id));
    composites.push({ score: computed.overallScore, responseCount });
  }
  const score = cohortAverage(composites, campaign.minResponses);
  if (score == null) return null;

  return { nodeId, name: nodeName, templateTitle: template.title, campaignName: campaign.name, score };
}

/**
 * Departments × competencies for the caller's whole scope in one semester, plus the
 * outliers worth a manager's attention. Backs both the scope-overview heatmap and
 * Compare, which just calls this twice with different semesterIds and diffs client-side.
 */
export async function getScopeRollup(params: { targetGroup: TargetGroup; semesterId: string; requestingUserId: string }) {
  const { targetGroup, semesterId, requestingUserId } = params;
  const empty = {
    targetGroup,
    semesterId,
    competencies: [] as string[],
    rows: [] as ReturnType<typeof buildRow>[],
    scopeComposite: null as number | null,
    responseCount: 0,
    coverage: { pastMinN: 0, total: 0 },
    weakestCompetency: null as ReturnType<typeof pickWeakestCompetency>,
    gapCount: 0,
    outliersLow: [] as OutlierCandidate[],
    outliersHigh: [] as OutlierCandidate[],
  };

  const visible = await visibleNodeIds({ id: requestingUserId, roles: await rolesOf(requestingUserId) });
  if (visible.length === 0) return empty;

  const nodes = await prisma.hierarchyNode.findMany({ where: { id: { in: visible } }, select: { id: true, name: true, level: true, type: true }, orderBy: [{ level: "asc" }, { name: "asc" }] });
  if (nodes.length === 0) return empty;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const edges = await prisma.hierarchyEdge.findMany({ where: { parentId: { in: visible }, childId: { in: visible } }, select: { parentId: true, childId: true } });
  const childrenOf = new Map<string, string[]>();
  const parentsOf = new Map<string, string[]>();
  for (const e of edges) {
    childrenOf.set(e.parentId, [...(childrenOf.get(e.parentId) ?? []), e.childId]);
    parentsOf.set(e.childId, [...(parentsOf.get(e.childId) ?? []), e.parentId]);
  }

  const ownByNode = new Map<string, OwnMeasurement>();
  const campaignNameByNode = new Map<string, string | null>();
  const teacherCandidates: OutlierCandidate[] = [];
  const allGaps: (number | null)[] = [];
  let responseCount = 0;
  let coveragePastMinN = 0;
  let coverageTotal = 0;

  for (const node of nodes) {
    const standing = await loadNodeStanding({ node, targetGroup, semesterId });
    ownByNode.set(node.id, standing.own);
    campaignNameByNode.set(node.id, standing.campaignName);
    teacherCandidates.push(...standing.candidates);
    allGaps.push(...standing.gaps);
    responseCount += standing.own.n;
    coveragePastMinN += standing.coverage.pastMinN;
    coverageTotal += standing.coverage.total;
  }

  const byLevelDesc = [...nodes].sort((a, b) => b.level - a.level);
  const rollupByNode = new Map<string, BranchRollup>();
  for (const node of byLevelDesc) {
    const children = (childrenOf.get(node.id) ?? []).map((childId) => rollupByNode.get(childId)).filter((r): r is BranchRollup => r != null);
    rollupByNode.set(node.id, rollupBranch(ownByNode.get(node.id)!, children));
  }

  const competencies: string[] = [];
  const seen = new Set<string>();
  for (const node of nodes) for (const title of ownByNode.get(node.id)!.cells.keys()) if (!seen.has(title)) { seen.add(title); competencies.push(title); }

  function buildRow(node: (typeof nodes)[number]) {
    const rollup = rollupByNode.get(node.id)!;
    return {
      nodeId: node.id,
      name: node.name,
      level: node.level,
      n: rollup.n,
      composite: rollup.composite,
      cells: competencies.map((title) => ({ title, score: rollup.cells.get(title) ?? null })),
      campaignName: campaignNameByNode.get(node.id) ?? null,
      contributors: rollup.contributors.map((c) => ({ nodeId: c.nodeId, name: c.name, templateTitle: c.templateTitle, campaignName: c.campaignName, score: c.score })),
    };
  }

  // Offices (AVP, QA) never get a results row — an oversight function layered across
  // departments that already belong to their own College isn't a real "branch" the way
  // a College's average genuinely is. They're still walked internally for edge-traversal.
  const rows = nodes.filter((node) => node.type !== "OFFICE").map(buildRow);

  const ownComposites = nodes.map((n) => ownByNode.get(n.id)!.composite).filter((c): c is number => c != null);
  const scopeComposite = ownComposites.length > 0 ? ownComposites.reduce((a, b) => a + b, 0) / ownComposites.length : null;

  const branchCandidates: OutlierCandidate[] = [];
  if (scopeComposite != null) {
    for (const node of nodes) {
      const own = ownByNode.get(node.id)!;
      if (own.composite == null) continue;
      const delta = own.composite - scopeComposite;
      const parentNames = (parentsOf.get(node.id) ?? []).map((pid) => nodeById.get(pid)?.name).filter((n): n is string => n != null);
      branchCandidates.push({ kind: "branch", name: node.name, where: parentNames.length > 0 ? parentNames.join(" · ") : "top of your scope", why: `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)} vs scope composite`, score: own.composite });
    }
  }

  const { low, high } = pickOutliers([...teacherCandidates, ...branchCandidates], 4);
  const weakest = pickWeakestCompetency(nodes.map((n) => ownByNode.get(n.id)!.cells).filter((cells) => cells.size > 0));

  return {
    targetGroup,
    semesterId,
    competencies,
    rows,
    scopeComposite,
    responseCount,
    coverage: { pastMinN: coveragePastMinN, total: coverageTotal },
    weakestCompetency: weakest,
    gapCount: countDivergentGaps(allGaps),
    outliersLow: low,
    outliersHigh: high,
  };
}

/**
 * The semesters any node in the caller's visible scope actually has an EMAIL campaign
 * for, newest first — real Semester rows, not v1's anchor-node-history hack. Replaces
 * listScopeRounds(); the bug class it worked around (duplicate/misaligned labels across
 * departments with different-depth histories) cannot recur once every campaign belongs
 * to one shared Semester timeline.
 */
export async function listScopeSemesters(params: { targetGroup: TargetGroup; requestingUserId: string }) {
  const { targetGroup, requestingUserId } = params;
  const visible = await visibleNodeIds({ id: requestingUserId, roles: await rolesOf(requestingUserId) });
  if (visible.length === 0) return [];

  const campaigns = await prisma.campaign.findMany({
    where: { nodeId: { in: visible }, type: "EMAIL", status: { in: ["OPEN", "CLOSED"] }, campaignTemplates: { some: { targetGroup } } },
    select: { semesterId: true, semester: true },
    distinct: ["semesterId"],
  });

  return campaigns
    .map((c) => ({ semesterId: c.semesterId, label: semesterLabel(c.semester), startsAt: c.semester.startsAt }))
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
}
