import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { generateRawToken, hashToken } from "@/server/auth/token";
import { effectiveCampaignStatus, validateAnswers } from "@/server/responses/response-validation";
import { NotFoundError, ConflictError } from "@/server/responses/responses";
import type { AnswerInput } from "@/lib/schemas/responses";

export class GoneError extends Error {}
export class CapReachedError extends Error {}

/**
 * The unauthenticated counterpart to responses.ts, for the /guest/[slug] public link.
 * No session check anywhere in this module — same as the private-token routes, the
 * slug/ballot token IN the request IS the credential. Ported from v1's
 * public/public-campaigns.service.ts.
 *
 * Two-step (start -> submit) rather than one shot: a Ballot is minted transparently the
 * moment a guest picks a teacher (capturing ipHash even if they abandon the form) and
 * consumed on submit. The guest never sees or copies the ballot token — only the one
 * /guest/[slug] link they were given.
 */

async function loadCampaign(slug: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { publicSlug: slug },
    include: { node: { select: { name: true } }, assignments: true, campaignTemplates: true },
  });
  if (!campaign || campaign.type !== "INSTANT" || campaign.audienceMode !== "GUEST_ALLOWED") {
    throw new NotFoundError("This link is invalid or has expired");
  }
  return campaign;
}

async function responseCount(campaignId: string): Promise<number> {
  return prisma.response.count({ where: { campaignId } });
}

/** Every guest response answers the STUDENT-slot template — see updateInstantCampaign
 *  in campaigns.ts for why guest forms reuse that slot instead of a dedicated TargetGroup. */
async function loadGuestTemplate(campaign: { campaignTemplates: { targetGroup: string; templateId: string }[] }) {
  const ct = campaign.campaignTemplates.find((c) => c.targetGroup === "STUDENT");
  if (!ct) throw new NotFoundError("This campaign has no feedback form configured");
  return prisma.template.findUniqueOrThrow({
    where: { id: ct.templateId },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: { items: { orderBy: { order: "asc" } }, scale: { include: { points: { orderBy: { order: "asc" } } } } },
      },
    },
  });
}

export async function getPublicCampaignInfo(slug: string) {
  const campaign = await loadCampaign(slug);

  const status = campaign.status === "OPEN" ? "open" : campaign.status === "CLOSED" ? "closed" : "not_open";
  const capReached = campaign.maxResponses != null && (await responseCount(campaign.id)) >= campaign.maxResponses;

  const teacherIds = [...new Set(campaign.assignments.map((a) => a.teacherId))];
  const teachers = teacherIds.length
    ? await prisma.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true } })
    : [];

  return {
    campaignName: campaign.name,
    departmentName: campaign.node.name,
    status: status as "open" | "closed" | "not_open",
    capReached,
    teachers,
  };
}

export async function startBallot(slug: string, teacherId: string, ipHash: string | null) {
  const campaign = await loadCampaign(slug);
  const status = await effectiveCampaignStatus(campaign.id);
  if (status !== "OPEN") throw new GoneError("This campaign is not currently open");

  if (!campaign.assignments.some((a) => a.teacherId === teacherId)) {
    throw new NotFoundError("This teacher is not part of this campaign");
  }
  const teacher = await prisma.user.findUnique({ where: { id: teacherId }, select: { name: true } });
  if (!teacher) throw new NotFoundError("This teacher is not part of this campaign");

  if (campaign.maxResponses != null && (await responseCount(campaign.id)) >= campaign.maxResponses) {
    throw new CapReachedError("cap");
  }

  const template = await loadGuestTemplate(campaign);

  const raw = generateRawToken();
  await prisma.ballot.create({ data: { campaignId: campaign.id, teacherId, tokenHash: hashToken(raw), ipHash } });

  return {
    ballotToken: raw,
    form: {
      teacherName: teacher.name,
      campaignName: campaign.name,
      targetGroup: "STUDENT" as const,
      closesAt: campaign.closesAt,
      minResponses: campaign.minResponses,
      sections: template.sections.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        type: s.type,
        isOverall: s.isOverall,
        order: s.order,
        scale: s.scale ? s.scale.points.map((p) => ({ id: p.id, label: p.label, value: p.value, order: p.order })) : null,
        items: s.items.map((i) => ({ id: i.id, text: i.text, required: i.required, order: i.order })),
      })),
    },
  };
}

export async function submitBallot(rawToken: string, answers: AnswerInput[]): Promise<{ ok: true }> {
  const ballot = await prisma.ballot.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { campaign: { include: { campaignTemplates: true } } },
  });
  if (!ballot) throw new NotFoundError("This link is invalid or has expired");
  if (ballot.consumedAt) throw new ConflictError("This form has already been submitted");

  const status = await effectiveCampaignStatus(ballot.campaignId);
  if (status === "CLOSED") throw new GoneError("This campaign is closed");

  const template = await loadGuestTemplate(ballot.campaign);
  validateAnswers(template.sections, answers);

  try {
    await prisma.$transaction(async (tx) => {
      if (ballot.campaign.maxResponses != null) {
        const count = await tx.response.count({ where: { campaignId: ballot.campaignId } });
        if (count >= ballot.campaign.maxResponses) throw new CapReachedError("cap");
      }
      const response = await tx.response.create({
        data: {
          campaignId: ballot.campaignId,
          teacherId: ballot.teacherId,
          templateId: template.id,
          respondentKind: "GUEST",
          respondentUserId: null,
          ballotId: ballot.id,
        },
      });
      await tx.answer.createMany({
        data: answers.map((a) => ({ responseId: response.id, itemId: a.itemId, pointValue: a.pointValue ?? null, text: a.text ?? null })),
      });
      await tx.ballot.update({ where: { id: ballot.id }, data: { consumedAt: new Date() } });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConflictError("This form has already been submitted");
    }
    throw err;
  }

  return { ok: true };
}
