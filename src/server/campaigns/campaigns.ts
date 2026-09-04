import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/server/db";
import { ownDepartmentNode } from "@/server/scope";
import { sendMail } from "@/server/mail/mail";
import { campaignInviteEmail } from "@/server/mail/templates";
import { getWebOrigin } from "@/lib/config";
import { generateRawToken, hashToken } from "@/server/auth/token";
import { semesterLabel } from "@/lib/semester";
import {
  authorizeBareStudentGroups,
  authorizeOfferings,
  campaignMinNGate,
  teacherMinNGate,
  templateSlotsForAssignedGroups,
  validateWindow,
  validateAudienceMinimums,
} from "./campaign-logic";
import { listOfferingsForTeachers, type OfferingRow } from "@/server/courses/courses";
import { offeringKeyOf } from "@/server/courses/course-logic";
import { validateSemesterUniqueness } from "./semester-logic";
import type { TargetGroup } from "@prisma/client";

const TARGET_GROUPS: TargetGroup[] = ["STUDENT", "PEER", "MANAGER"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatWindow(opensAt: Date | null, closesAt: Date | null): string {
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (opensAt && closesAt) return `${fmt(opensAt)} → ${fmt(closesAt)}`;
  if (closesAt) return `until ${fmt(closesAt)}`;
  if (opensAt) return `from ${fmt(opensAt)}`;
  return "not scheduled";
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Campaigns are scoped to the caller's own department — see people.ts's note on why a
 * dean's multi-department story is out of scope. Ported from v1's CampaignsService,
 * with every campaign now belonging to a real Semester (see schema.prisma's Semester
 * comment) instead of a bare date window with no round identity.
 */

export async function listCampaigns(requestingUserId: string) {
  const node = await ownDepartmentNode(requestingUserId);
  const campaigns = await prisma.campaign.findMany({
    where: { nodeId: node.id },
    include: {
      campaignTemplates: true,
      assignments: true,
      tasks: { select: { teacherId: true, completedAt: true } },
      semester: true,
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  const instantIds = campaigns.filter((c) => c.type === "INSTANT").map((c) => c.id);
  const instantCounts = instantIds.length
    ? await prisma.response.groupBy({ by: ["campaignId", "teacherId"], where: { campaignId: { in: instantIds } }, _count: { _all: true } })
    : [];
  const instantCountsByCampaign = new Map<string, Map<string, number>>();
  for (const row of instantCounts) {
    const m = instantCountsByCampaign.get(row.campaignId) ?? new Map<string, number>();
    m.set(row.teacherId, row._count._all);
    instantCountsByCampaign.set(row.campaignId, m);
  }

  const rows = campaigns.map((c) => {
    const studentAssignments = c.assignments.filter((a) => a.targetGroup === "STUDENT");
    const offeringCount = new Set(studentAssignments.map((a) => a.courseOfferingId).filter(Boolean)).size;
    const studentGroups = new Set(
      studentAssignments.filter((a) => !a.courseOfferingId).map((a) => a.studentGroupId).filter(Boolean),
    );
    const hasPeers = c.assignments.some((a) => a.targetGroup === "PEER");
    const hasManager = c.assignments.some((a) => a.targetGroup === "MANAGER");
    const parts: string[] = [];
    if (offeringCount > 0) parts.push(`${offeringCount} course${offeringCount === 1 ? "" : "s"}`);
    if (studentGroups.size > 0) parts.push(`${studentGroups.size} student group${studentGroups.size === 1 ? "" : "s"}`);
    if (hasPeers) parts.push("peers");
    if (hasManager) parts.push("head");
    const audiencesSummary =
      c.type === "INSTANT"
        ? c.audienceMode === "GUEST_ALLOWED"
          ? "Public link · guests allowed"
          : "Public link"
        : parts.length > 0
          ? parts.join(" · ")
          : "not yet configured";

    let asked: number;
    let responded: number;
    let minNLabel: string;
    let minNOk: boolean;
    if (c.type === "INSTANT") {
      const teacherIds = [...new Set(c.assignments.map((a) => a.teacherId))];
      const counts = instantCountsByCampaign.get(c.id) ?? new Map<string, number>();
      const totalResponses = [...counts.values()].reduce((sum, n) => sum + n, 0);
      responded = totalResponses;
      asked = c.maxResponses ?? totalResponses;
      if (teacherIds.length === 0 || totalResponses === 0) {
        minNLabel = "not started";
        minNOk = teacherIds.length === 0;
      } else {
        const passCount = teacherIds.filter(
          (id) => teacherMinNGate(new Map([["STUDENT" as TargetGroup, counts.get(id) ?? 0]]), ["STUDENT"], c.minResponses).ok,
        ).length;
        minNLabel = `${passCount} of ${teacherIds.length} teachers`;
        minNOk = passCount === teacherIds.length;
      }
    } else {
      asked = c.tasks.length;
      responded = c.tasks.filter((t) => t.completedAt != null).length;
      const gate = campaignMinNGate(c.tasks, c.campaignTemplates.map((ct) => ct.targetGroup), c.minResponses);
      minNLabel = gate.label;
      minNOk = gate.ok;
    }

    return {
      id: c.id,
      name: c.name,
      type: c.type,
      status: c.status,
      semesterLabel: semesterLabel(c.semester),
      audiencesSummary,
      window: formatWindow(c.opensAt, c.closesAt),
      responded,
      asked,
      minNLabel,
      minNOk,
      canEdit: c.status === "DRAFT",
      canLaunch: c.status === "DRAFT",
      canCloseEarly: c.status === "OPEN",
    };
  });

  return {
    campaigns: rows,
    counts: {
      draft: rows.filter((r) => r.status === "DRAFT").length,
      open: rows.filter((r) => r.status === "OPEN").length,
      closed: rows.filter((r) => r.status === "CLOSED").length,
    },
  };
}

export async function getCampaignDetail(requestingUserId: string, campaignId: string) {
  const node = await ownDepartmentNode(requestingUserId);
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, nodeId: node.id },
    include: {
      campaignTemplates: { include: { template: { select: { title: true } } } },
      assignments: { include: { studentGroup: true, respondent: { select: { name: true } } } },
      semester: true,
    },
  });
  if (!campaign) throw new Error("Campaign not found");
  const headUser = node.userId ? await prisma.user.findUnique({ where: { id: node.userId }, select: { name: true } }) : null;

  const teacherIds = [...new Set(campaign.assignments.map((a) => a.teacherId))];
  const teachers = teacherIds.length
    ? await prisma.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true } })
    : [];
  const teacherNameById = new Map(teachers.map((t) => [t.id, t.name]));

  const assignments = teacherIds.map((teacherId) => {
    const own = campaign.assignments.filter((a) => a.teacherId === teacherId);
    return {
      teacherId,
      teacherName: teacherNameById.get(teacherId) ?? "?",
      // A group assigned WITHOUT an offering — the hand-built cohort path. Offering-backed
      // student reach is reported separately as offeringIds so the builder can show the
      // course, which is what the respondent actually sees on their form.
      studentGroups: own
        .filter((a) => a.targetGroup === "STUDENT" && a.studentGroup && !a.courseOfferingId)
        .map((a) => ({ id: a.studentGroup!.id, name: a.studentGroup!.name, program: a.studentGroup!.program, memberCount: 0 })),
      offeringIds: own
        .filter((a) => a.targetGroup === "STUDENT" && a.courseOfferingId)
        .map((a) => a.courseOfferingId!),
      peers: own.filter((a) => a.targetGroup === "PEER" && a.respondent).map((a) => ({ id: a.respondentUserId!, name: a.respondent!.name })),
      headIncluded: own.some((a) => a.targetGroup === "MANAGER"),
    };
  });

  const groupIds = assignments.flatMap((a) => a.studentGroups.map((g) => g.id));
  if (groupIds.length > 0) {
    const counts = await prisma.studentGroupMember.groupBy({ by: ["groupId"], where: { groupId: { in: groupIds } }, _count: { _all: true } });
    const countByGroup = new Map(counts.map((c) => [c.groupId, c._count._all]));
    for (const a of assignments) for (const g of a.studentGroups) g.memberCount = countByGroup.get(g.id) ?? 0;
  }

  // Everything this department's teachers actually taught in this campaign's semester —
  // the builder's checkbox list, and the only student reach that needs no further
  // authorisation (see authorizeOfferings in campaign-logic.ts).
  const defaultTemplateIds = await defaultTemplateIdsFor(node.id);
  const defaultTitles = defaultTemplateIds.size
    ? await prisma.template.findMany({
        where: { id: { in: [...defaultTemplateIds.values()] } },
        select: { id: true, title: true },
      })
    : [];
  const defaultTitleById = new Map(defaultTitles.map((t) => [t.id, t.title]));

  const departmentTeachers = await prisma.membership.findMany({
    where: { nodeId: node.id, kind: "TEACHER" },
    select: { userId: true, user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  const availableOfferings = await listOfferingsForTeachers(
    campaign.semesterId,
    departmentTeachers.map((t) => t.userId),
  );

  return {
    id: campaign.id,
    name: campaign.name,
    type: campaign.type,
    status: campaign.status,
    audienceMode: campaign.audienceMode,
    publicSlug: campaign.publicSlug,
    semesterId: campaign.semesterId,
    semesterLabel: semesterLabel(campaign.semester),
    semesterTerm: campaign.semester.term,
    opensAt: campaign.opensAt,
    closesAt: campaign.closesAt,
    maxResponses: campaign.maxResponses,
    minResponses: campaign.minResponses,
    minTeachers: campaign.minTeachers,
    minStudents: campaign.minStudents,
    headName: headUser?.name ?? null,
    departmentNodeId: node.id,
    departmentTeachers: departmentTeachers.map((t) => ({ id: t.userId, name: t.user.name })),
    availableOfferings,
    templates: TARGET_GROUPS.map((targetGroup) => {
      const ct = campaign.campaignTemplates.find((c) => c.targetGroup === targetGroup);
      if (ct) return { targetGroup, templateId: ct.templateId, templateTitle: ct.template.title, isDefault: false };
      // Nothing chosen yet: offer the official form so the builder opens ready to save.
      const suggested = defaultTemplateIds.get(targetGroup) ?? null;
      return {
        targetGroup,
        templateId: suggested,
        templateTitle: suggested ? (defaultTitleById.get(suggested) ?? null) : null,
        isDefault: suggested != null,
      };
    }),
    assignments,
    editable: campaign.status === "DRAFT",
  };
}

export async function createCampaign(requestingUserId: string, input: { name: string; type: "EMAIL" | "INSTANT"; semesterId: string }) {
  const node = await ownDepartmentNode(requestingUserId);
  const semester = await prisma.semester.findUniqueOrThrow({ where: { id: input.semesterId } });

  const campaign = await prisma.campaign.create({
    data: {
      nodeId: node.id,
      semesterId: semester.id,
      name: input.name,
      type: input.type,
      status: "DRAFT",
      opensAt: semester.startsAt,
      closesAt: semester.endsAt,
      ...(input.type === "INSTANT" ? { audienceMode: "GUEST_ALLOWED" as const, publicSlug: randomBytes(9).toString("hex") } : {}),
    },
  });
  return getCampaignDetail(requestingUserId, campaign.id);
}

/**
 * The university's official questionnaire per audience, as visible from `nodeId` — its own
 * or any ancestor's, published, flagged isDefault (see Template.isDefault). This is what a
 * new campaign's builder opens pre-filled with, so a manager does not re-find the same
 * three forms every round.
 *
 * Deliberately a SUGGESTION rather than a persisted CampaignTemplate row. Those rows are
 * read by three separate consumers as "which audiences this campaign covers":
 * validateSemesterUniqueness (one round per node+semester+audience),
 * campaignMinNGate/teacherMinNGate (a head-only campaign is exempt from min-N, since a
 * teacher has exactly one manager) and resolveNodeCampaign in analytics.ts (which campaign
 * IS this node's peer round). Writing a slot for an audience nobody is asked would make a
 * head's-assessment campaign permanently "below min-N", and would block launching a
 * genuine peer round later in the same semester.
 */
async function defaultTemplateIdsFor(nodeId: string): Promise<Map<TargetGroup, string>> {
  const ancestorIds = (
    await prisma.hierarchyClosure.findMany({ where: { descendantId: nodeId }, select: { ancestorId: true } })
  ).map((row) => row.ancestorId);

  const defaults = await prisma.template.findMany({
    where: { isDefault: true, status: "PUBLISHED", ownerNodeId: { in: ancestorIds } },
    select: { id: true, targetGroup: true },
    orderBy: { publishedAt: "desc" },
  });

  const byTarget = new Map<TargetGroup, string>();
  for (const template of defaults) {
    if (!byTarget.has(template.targetGroup)) byTarget.set(template.targetGroup, template.id);
  }
  return byTarget;
}

export interface AssignmentInput {
  teacherId: string;
  /** Groups assigned directly, with no course behind them — the hand-built cohort case. */
  studentGroupIds: string[];
  /** Course offerings this teacher gave; each becomes one form per enrolled student. */
  offeringIds: string[];
  peerIds: string[];
  headIncluded: boolean;
}
export interface UpdateCampaignInput {
  name: string;
  audienceMode: "REGISTERED_ONLY" | "GUEST_ALLOWED";
  opensAt: string | null;
  closesAt: string | null;
  maxResponses: number | null;
  minResponses: number;
  minTeachers: number;
  minStudents: number;
  templates: { STUDENT: string | null; PEER: string | null; MANAGER: string | null };
  assignments: AssignmentInput[];
}

async function assertEditable(nodeId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, nodeId } });
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status !== "DRAFT") throw new Error("Only a draft campaign can be edited");
  return campaign;
}

export async function updateCampaign(requestingUserId: string, campaignId: string, input: UpdateCampaignInput) {
  const node = await ownDepartmentNode(requestingUserId);
  const campaign = await assertEditable(node.id, campaignId);

  if (campaign.type === "INSTANT") {
    return updateInstantCampaign(requestingUserId, node.id, campaignId, input);
  }

  const templateIds = Object.values(input.templates).filter((id): id is string => !!id);
  if (templateIds.length > 0) {
    const templates = await prisma.template.findMany({ where: { id: { in: templateIds } } });
    for (const [group, id] of Object.entries(input.templates)) {
      if (!id) continue;
      const t = templates.find((x) => x.id === id);
      if (!t) throw new Error(`Unknown template for ${group}`);
      if (t.status !== "PUBLISHED") throw new Error(`${t.title} is not published`);
      if (t.targetGroup !== group) throw new Error(`${t.title} is not a ${group} template`);
    }
  }

  const groupIds = [...new Set(input.assignments.flatMap((a) => a.studentGroupIds))];
  const peerIds = [...new Set(input.assignments.flatMap((a) => a.peerIds))];
  const offeringIds = [...new Set(input.assignments.flatMap((a) => a.offeringIds ?? []))];

  // Teachers first: everything else is authorised RELATIVE to who this department employs.
  const teacherIds = [...new Set(input.assignments.map((a) => a.teacherId))];
  if (teacherIds.length > 0) {
    const validTeachers = await prisma.membership.findMany({ where: { userId: { in: teacherIds }, nodeId: node.id, kind: "TEACHER" } });
    if (validTeachers.length !== teacherIds.length) throw new Error("One or more teachers are not in your department");
  }
  const ownTeacherIds = (
    await prisma.membership.findMany({ where: { nodeId: node.id, kind: "TEACHER" }, select: { userId: true } })
  ).map((m) => m.userId);

  // A bare group (no offering) still has to be ours. An offering-backed one does not, and
  // that asymmetry is the point — see authorizeOfferings.
  if (groupIds.length > 0) {
    const groups = await prisma.studentGroup.findMany({ where: { id: { in: groupIds } }, select: { id: true, nodeId: true } });
    const missing = groupIds.filter((id) => !groups.some((g) => g.id === id));
    if (missing.length > 0) throw new Error("One or more student groups no longer exist");
    const { errors } = authorizeBareStudentGroups(node.id, groups);
    if (errors.length > 0) throw new Error(errors[0]);
  }

  const offeringById = new Map<string, { teacherId: string; studentGroupId: string }>();
  if (offeringIds.length > 0) {
    const offerings = await prisma.courseOffering.findMany({
      where: { id: { in: offeringIds } },
      select: { id: true, teacherId: true, semesterId: true, studentGroupId: true, studentGroup: { select: { nodeId: true } } },
    });
    const { errors } = authorizeOfferings({
      campaignNodeId: node.id,
      campaignSemesterId: campaign.semesterId,
      ownTeacherIds,
      requestedOfferingIds: offeringIds,
      knownOfferings: offerings.map((o) => ({
        id: o.id,
        teacherId: o.teacherId,
        semesterId: o.semesterId,
        sectionNodeId: o.studentGroup.nodeId,
      })),
    });
    if (errors.length > 0) throw new Error(errors[0]);
    for (const o of offerings) offeringById.set(o.id, { teacherId: o.teacherId, studentGroupId: o.studentGroupId });
  }

  if (peerIds.length > 0) {
    const peers = await prisma.membership.findMany({ where: { userId: { in: peerIds }, nodeId: node.id, kind: "TEACHER" } });
    if (peers.length !== peerIds.length) throw new Error("One or more peers are not teachers in your department");
  }

  for (const a of input.assignments) {
    for (const offeringId of a.offeringIds ?? []) {
      const offering = offeringById.get(offeringId);
      if (offering && offering.teacherId !== a.teacherId) {
        throw new Error("A course offering was assigned under the wrong teacher");
      }
    }
  }

  // The builder always shows all three selects, pre-filled with the official defaults, so
  // it sends three template ids whatever the audience is. Persist only the ones this
  // campaign actually asks — campaignTemplates is read elsewhere as the campaign's
  // audience set, so an unused slot is not inert (see defaultTemplateIdsFor above).
  const assignmentRows = input.assignments.flatMap((a) => [
    ...a.studentGroupIds.map((studentGroupId) => ({ campaignId, teacherId: a.teacherId, targetGroup: "STUDENT" as const, studentGroupId })),
    ...(a.offeringIds ?? []).map((courseOfferingId) => ({
      campaignId,
      teacherId: a.teacherId,
      targetGroup: "STUDENT" as const,
      courseOfferingId,
      studentGroupId: offeringById.get(courseOfferingId)?.studentGroupId ?? null,
    })),
    ...a.peerIds.map((respondentUserId) => ({ campaignId, teacherId: a.teacherId, targetGroup: "PEER" as const, respondentUserId })),
    ...(a.headIncluded && node.userId ? [{ campaignId, teacherId: a.teacherId, targetGroup: "MANAGER" as const, respondentUserId: node.userId }] : []),
  ]);

  const templateRows = templateSlotsForAssignedGroups(
    Object.entries(input.templates)
      .filter((e): e is [string, string] => !!e[1])
      .map(([targetGroup, templateId]) => ({ campaignId, targetGroup: targetGroup as TargetGroup, templateId })),
    assignmentRows.map((r) => r.targetGroup),
  );

  await prisma.$transaction([
    prisma.campaign.update({
      where: { id: campaignId },
      data: {
        name: input.name,
        audienceMode: input.audienceMode,
        opensAt: input.opensAt ? new Date(input.opensAt) : null,
        closesAt: input.closesAt ? new Date(input.closesAt) : null,
        maxResponses: input.maxResponses,
        minResponses: input.minResponses,
        minTeachers: input.minTeachers,
        minStudents: input.minStudents,
      },
    }),
    prisma.campaignTemplate.deleteMany({ where: { campaignId } }),
    ...(templateRows.length > 0 ? [prisma.campaignTemplate.createMany({ data: templateRows })] : []),
    prisma.campaignAssignment.deleteMany({ where: { campaignId } }),
    ...(assignmentRows.length > 0 ? [prisma.campaignAssignment.createMany({ data: assignmentRows })] : []),
  ]);

  return getCampaignDetail(requestingUserId, campaignId);
}

async function updateInstantCampaign(requestingUserId: string, nodeId: string, campaignId: string, input: UpdateCampaignInput) {
  const templateId = input.templates.STUDENT;
  if (templateId) {
    const t = await prisma.template.findUnique({ where: { id: templateId } });
    if (!t) throw new Error("Unknown template");
    if (t.status !== "PUBLISHED") throw new Error(`${t.title} is not published`);
    if (t.targetGroup !== "STUDENT") throw new Error(`${t.title} is not a guest-eligible template`);
  }

  const teacherIds = [...new Set(input.assignments.map((a) => a.teacherId))];
  if (teacherIds.length > 0) {
    const validTeachers = await prisma.membership.findMany({ where: { userId: { in: teacherIds }, nodeId, kind: "TEACHER" } });
    if (validTeachers.length !== teacherIds.length) throw new Error("One or more teachers are not in your department");
  }

  await prisma.$transaction([
    prisma.campaign.update({
      where: { id: campaignId },
      data: {
        name: input.name,
        audienceMode: "GUEST_ALLOWED",
        opensAt: input.opensAt ? new Date(input.opensAt) : null,
        closesAt: input.closesAt ? new Date(input.closesAt) : null,
        maxResponses: input.maxResponses,
        minResponses: input.minResponses,
        minTeachers: input.minTeachers,
        minStudents: input.minStudents,
      },
    }),
    prisma.campaignTemplate.deleteMany({ where: { campaignId } }),
    ...(templateId ? [prisma.campaignTemplate.create({ data: { campaignId, targetGroup: "STUDENT", templateId } })] : []),
    prisma.campaignAssignment.deleteMany({ where: { campaignId } }),
    ...(teacherIds.length > 0
      ? [prisma.campaignAssignment.createMany({ data: teacherIds.map((teacherId) => ({ campaignId, teacherId, targetGroup: "STUDENT" as const })) })]
      : []),
  ]);

  return getCampaignDetail(requestingUserId, campaignId);
}

async function assertTemplatePublished(templateId: string): Promise<void> {
  const template = await prisma.template.findUnique({ where: { id: templateId }, select: { title: true, status: true } });
  if (!template || template.status !== "PUBLISHED") {
    throw new Error(`${template?.title ?? "A template"} is no longer published — assign a current one`);
  }
}

/**
 * Turns the saved assignment matrix into real ResponseTask rows and emails every one of
 * them. One new guard beyond v1: validateSemesterUniqueness (one campaign per node +
 * semester + target group, so "this department's Fall 2026/27 round" stays unambiguous).
 * There's deliberately no restriction on which student groups a Summer campaign may
 * assign — Weekend/Extension groups behave exactly like Regular ones everywhere in this
 * app; Summer exists only because those two programs are still in session that term.
 */
export async function launchCampaign(requestingUserId: string, campaignId: string) {
  const node = await ownDepartmentNode(requestingUserId);
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, nodeId: node.id },
    include: {
      campaignTemplates: true,
      assignments: {
        include: {
          studentGroup: { include: { members: true } },
          offering: { include: { enrollments: { select: { userId: true } }, course: { select: { code: true, title: true } } } },
        },
      },
      semester: true,
    },
  });
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status !== "DRAFT") throw new Error("Only a draft campaign can be launched");

  const windowError = validateWindow(campaign.opensAt, campaign.closesAt, startOfToday());
  if (windowError) throw new Error(windowError);

  const ownTargetGroups = [...new Set(campaign.assignments.map((a) => a.targetGroup))];
  const siblings = await prisma.campaign.findMany({
    where: { nodeId: node.id, semesterId: campaign.semesterId, id: { not: campaignId }, status: { not: "DRAFT" } },
    include: { campaignTemplates: true },
  });
  const existingTargetGroups = siblings.flatMap((s) => s.campaignTemplates.map((ct) => ct.targetGroup));
  const uniquenessError = validateSemesterUniqueness(ownTargetGroups, existingTargetGroups, semesterLabel(campaign.semester));
  if (uniquenessError) throw new Error(uniquenessError);

  if (campaign.type === "INSTANT") {
    const teacherIds = [...new Set(campaign.assignments.map((a) => a.teacherId))];
    const audienceError = validateAudienceMinimums(teacherIds.length, 0, false, campaign.minTeachers, campaign.minStudents);
    if (audienceError) throw new Error(audienceError);
    const studentCt = campaign.campaignTemplates.find((ct) => ct.targetGroup === "STUDENT");
    if (!studentCt) throw new Error("Assign the guest feedback template before launching");
    await assertTemplatePublished(studentCt.templateId);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "OPEN", opensAt: campaign.opensAt ?? new Date(), publicSlug: campaign.publicSlug ?? randomBytes(9).toString("hex") },
    });
    return getCampaignDetail(requestingUserId, campaignId);
  }

  if (!campaign.closesAt) throw new Error("Set a closing date before launching");

  const teacherIds = [...new Set(campaign.assignments.map((a) => a.teacherId))];
  const studentIds = new Set(
    campaign.assignments
      .filter((a) => a.targetGroup === "STUDENT")
      .flatMap((a) =>
        a.offering
          ? a.offering.enrollments.map((e) => e.userId)
          : (a.studentGroup?.members.map((m) => m.userId) ?? []),
      ),
  );
  const usesStudentGroup = campaign.assignments.some((a) => a.targetGroup === "STUDENT");
  const audienceError = validateAudienceMinimums(teacherIds.length, studentIds.size, usesStudentGroup, campaign.minTeachers, campaign.minStudents);
  if (audienceError) throw new Error(audienceError);

  const templateByGroup = new Map(campaign.campaignTemplates.map((ct) => [ct.targetGroup, ct.templateId]));
  for (const group of new Set(campaign.assignments.map((a) => a.targetGroup))) {
    const templateId = templateByGroup.get(group);
    if (!templateId) throw new Error(`Assign a ${group.toLowerCase()} template before launching`);
    await assertTemplatePublished(templateId);
  }

  type NewTask = {
    campaignId: string;
    teacherId: string;
    targetGroup: TargetGroup;
    respondentId: string;
    templateId: string;
    courseOfferingId: string | null;
    offeringKey: string;
    courseLabel: string | null;
  };
  const byTeacher = new Map<string, Map<string, NewTask>>();

  for (const a of campaign.assignments) {
    const templateId = templateByGroup.get(a.targetGroup)!;
    const respondentIds =
      a.targetGroup === "STUDENT"
        ? a.offering
          ? a.offering.enrollments.map((e) => e.userId)
          : (a.studentGroup?.members.map((m) => m.userId) ?? [])
        : a.respondentUserId
          ? [a.respondentUserId]
          : [];
    const offeringKey = offeringKeyOf(a.courseOfferingId);
    const courseLabel = a.offering ? `${a.offering.course.title} (${a.offering.course.code})` : null;
    const forTeacher = byTeacher.get(a.teacherId) ?? new Map<string, NewTask>();
    for (const respondentId of respondentIds) {
      // Keyed by respondent AND offering: a student taking two of this teacher's courses
      // gets two forms (the ASTU form is per course), while a student reachable twice
      // through the same offering still gets one.
      forTeacher.set(`${respondentId}::${offeringKey}`, {
        campaignId,
        teacherId: a.teacherId,
        targetGroup: a.targetGroup,
        respondentId,
        templateId,
        courseOfferingId: a.courseOfferingId,
        offeringKey,
        courseLabel,
      });
    }
    byTeacher.set(a.teacherId, forTeacher);
  }

  const tasks = [...byTeacher.values()].flatMap((m) => [...m.values()]);
  const rawTokenByIndex = tasks.map(() => generateRawToken());

  await prisma.responseTask.createMany({
    data: tasks.map((t, i) => {
      const { courseLabel: _courseLabel, ...row } = t;
      return { ...row, tokenHash: hashToken(rawTokenByIndex[i]) };
    }),
  });
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "OPEN", opensAt: campaign.opensAt ?? new Date() } });

  const respondentIds = [...new Set(tasks.map((t) => t.respondentId))];
  const taskTeacherIds = [...new Set(tasks.map((t) => t.teacherId))];
  const [respondents, teachers] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: respondentIds } }, select: { id: true, name: true, email: true } }),
    prisma.user.findMany({ where: { id: { in: taskTeacherIds } }, select: { id: true, name: true } }),
  ]);
  const respondentById = new Map(respondents.map((r) => [r.id, r]));
  const teacherNameById = new Map(teachers.map((t) => [t.id, t.name]));
  const webOrigin = await getWebOrigin();

  // Sequential, not Promise.all — see v1's note (campaigns.service.ts): firing hundreds
  // of sends at once opens that many concurrent SMTP connections and times a chunk out.
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const respondent = respondentById.get(t.respondentId);
    if (!respondent) continue;
    const { subject, html } = campaignInviteEmail({
      name: respondent.name,
      teacherName: teacherNameById.get(t.teacherId) ?? "a teacher",
      courseLabel: t.courseLabel,
      link: `${webOrigin}/respond/${rawTokenByIndex[i]}`,
    });
    await sendMail({ to: respondent.email, subject, html });
  }

  return getCampaignDetail(requestingUserId, campaignId);
}

async function loadOwn(nodeId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, nodeId } });
  if (!campaign) throw new Error("Campaign not found");
  return campaign;
}

export async function closeCampaign(requestingUserId: string, campaignId: string): Promise<void> {
  const node = await ownDepartmentNode(requestingUserId);
  const campaign = await loadOwn(node.id, campaignId);
  if (campaign.status !== "OPEN") throw new Error("Only an open campaign can be closed early");
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "CLOSED" } });
}

function closesInLabel(closesAt: Date | null): string | null {
  if (!closesAt) return null;
  const days = Math.ceil((closesAt.getTime() - Date.now()) / 86_400_000);
  return days > 0 ? `${days}d` : days === 0 ? "today" : "closed";
}

export async function getCampaignMonitor(requestingUserId: string, campaignId: string) {
  const node = await ownDepartmentNode(requestingUserId);
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, nodeId: node.id },
    include: { campaignTemplates: true, tasks: { include: { teacher: { select: { name: true } } } }, assignments: true },
  });
  if (!campaign) throw new Error("Campaign not found");

  if (campaign.type === "INSTANT") {
    return monitorInstant(campaign);
  }

  const byTeacher = new Map<string, { name: string; byGroup: Map<TargetGroup, { done: number; asked: number }> }>();
  for (const t of campaign.tasks) {
    const entry = byTeacher.get(t.teacherId) ?? { name: t.teacher.name, byGroup: new Map() };
    const g = entry.byGroup.get(t.targetGroup) ?? { done: 0, asked: 0 };
    g.asked += 1;
    if (t.completedAt) g.done += 1;
    entry.byGroup.set(t.targetGroup, g);
    byTeacher.set(t.teacherId, entry);
  }

  const targetGroupsUsed = campaign.campaignTemplates.map((ct) => ct.targetGroup);
  const rows = [...byTeacher.entries()]
    .map(([teacherId, entry]) => {
      const students = entry.byGroup.get("STUDENT") ?? null;
      const peers = entry.byGroup.get("PEER") ?? null;
      const manager = entry.byGroup.get("MANAGER");
      const doneByGroup = new Map([...entry.byGroup.entries()].map(([g, v]) => [g, v.done]));
      const gate = teacherMinNGate(doneByGroup, targetGroupsUsed, campaign.minResponses);
      return {
        teacherId,
        teacherName: entry.name,
        students,
        peers,
        headDone: manager ? manager.done > 0 : null,
        gateOk: gate.ok,
        gateLabel: gate.label,
      };
    })
    .sort((a, b) => a.teacherName.localeCompare(b.teacherName));

  const responded = campaign.tasks.filter((t) => t.completedAt != null).length;
  const asked = campaign.tasks.length;
  const teachersTotal = byTeacher.size;
  const teachersPastMinN = rows.filter((r) => r.gateOk).length;

  return {
    responded,
    asked,
    teachersPastMinN,
    teachersTotal,
    closesInLabel: closesInLabel(campaign.closesAt),
    closesAt: campaign.closesAt,
    rows,
    instant: null as InstantMonitor | null,
  };
}

interface InstantMonitor {
  publicLink: string;
  totalResponses: number;
  cap: number | null;
  perTeacher: { teacherId: string; teacherName: string; responses: number; gateOk: boolean; gateLabel: string }[];
}

async function monitorInstant(campaign: {
  id: string;
  publicSlug: string | null;
  maxResponses: number | null;
  minResponses: number;
  closesAt: Date | null;
  assignments: { teacherId: string }[];
}) {
  const teacherIds = [...new Set(campaign.assignments.map((a) => a.teacherId))];
  const teachers = teacherIds.length
    ? await prisma.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true } })
    : [];
  const teacherNameById = new Map(teachers.map((t) => [t.id, t.name]));

  const counts = teacherIds.length
    ? await prisma.response.groupBy({ by: ["teacherId"], where: { campaignId: campaign.id }, _count: { _all: true } })
    : [];
  const countByTeacher = new Map(counts.map((c) => [c.teacherId, c._count._all]));
  const totalResponses = await prisma.response.count({ where: { campaignId: campaign.id } });

  const webOrigin = await getWebOrigin();
  const perTeacher = teacherIds
    .map((teacherId) => {
      const responses = countByTeacher.get(teacherId) ?? 0;
      const gate = teacherMinNGate(new Map([["STUDENT" as TargetGroup, responses]]), ["STUDENT"], campaign.minResponses);
      return { teacherId, teacherName: teacherNameById.get(teacherId) ?? "?", responses, gateOk: gate.ok, gateLabel: gate.label };
    })
    .sort((a, b) => a.teacherName.localeCompare(b.teacherName));

  return {
    responded: totalResponses,
    asked: campaign.maxResponses ?? totalResponses,
    teachersPastMinN: perTeacher.filter((r) => r.gateOk).length,
    teachersTotal: teacherIds.length,
    closesInLabel: closesInLabel(campaign.closesAt),
    closesAt: campaign.closesAt,
    rows: [] as never[],
    instant: {
      publicLink: `${webOrigin}/guest/${campaign.publicSlug ?? ""}`,
      totalResponses,
      cap: campaign.maxResponses,
      perTeacher,
    } as InstantMonitor,
  };
}

/** Regenerates every incomplete task's token rather than resending the original —
 *  tokenHash is one-way SHA-256, so the raw original link can never be recovered. */
export async function remindCampaign(requestingUserId: string, campaignId: string, teacherId?: string): Promise<{ count: number }> {
  const node = await ownDepartmentNode(requestingUserId);
  const campaign = await loadOwn(node.id, campaignId);
  if (campaign.status !== "OPEN") throw new Error("Only an open campaign can send reminders");

  const tasks = await prisma.responseTask.findMany({
    where: { campaignId, completedAt: null, ...(teacherId ? { teacherId } : {}) },
    include: {
      respondent: { select: { id: true, name: true, email: true } },
      teacher: { select: { name: true } },
      offering: { select: { course: { select: { code: true, title: true } } } },
    },
  });
  if (tasks.length === 0) return { count: 0 };

  const webOrigin = await getWebOrigin();
  for (const t of tasks) {
    const raw = generateRawToken();
    await prisma.responseTask.update({ where: { id: t.id }, data: { tokenHash: hashToken(raw), lastEmailedAt: new Date() } });
    const { subject, html } = campaignInviteEmail({
      name: t.respondent.name,
      teacherName: t.teacher.name,
      courseLabel: t.offering ? `${t.offering.course.title} (${t.offering.course.code})` : null,
      link: `${webOrigin}/respond/${raw}`,
    });
    await sendMail({ to: t.respondent.email, subject, html });
  }
  return { count: tasks.length };
}
