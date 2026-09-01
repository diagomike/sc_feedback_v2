import "server-only";
import { prisma } from "@/server/db";
import { ownNode } from "@/server/scope";
import { isTemplateVisible, compositeShares } from "./template-logic";
import type { Prisma, TargetGroup, SectionType } from "@prisma/client";

const DETAIL_INCLUDE = {
  ownerNode: { select: { id: true, name: true } },
  clonedFrom: { select: { id: true, title: true } },
  sections: {
    orderBy: { order: "asc" as const },
    include: {
      scale: { select: { id: true, name: true } },
      items: { orderBy: { order: "asc" as const } },
    },
  },
} satisfies Prisma.TemplateInclude;

type LoadedTemplate = Prisma.TemplateGetPayload<{ include: typeof DETAIL_INCLUDE }>;

/**
 * Templates inherit DOWN the hierarchy: a template owned by an ancestor node is visible
 * (once published) to every descendant — the opposite direction from
 * visibleNodeIds()/ScopeService, which resolves what a manager can see below them.
 * Ported from v1's TemplatesService.
 */

async function ancestorIdsOf(nodeId: string): Promise<string[]> {
  const rows = await prisma.hierarchyClosure.findMany({ where: { descendantId: nodeId }, select: { ancestorId: true } });
  return rows.map((r) => r.ancestorId);
}

export interface TemplateRow {
  id: string;
  title: string;
  targetGroup: TargetGroup;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  sectionCount: number;
  itemCount: number;
  ownerNodeId: string;
  ownerNodeName: string;
  isOwn: boolean;
  clonedFromTitle: string | null;
  usedByCampaigns: number;
  publishedAt: Date | null;
  canEdit: boolean;
  canPublish: boolean;
  canArchive: boolean;
}

export async function listTemplates(requestingUserId: string) {
  const node = await ownNode(requestingUserId);
  const ancestorIds = await ancestorIdsOf(node.id);

  const templates = await prisma.template.findMany({
    where: { ownerNodeId: { in: ancestorIds }, OR: [{ ownerNodeId: node.id }, { status: "PUBLISHED" }] },
    include: {
      ownerNode: { select: { id: true, name: true } },
      clonedFrom: { select: { title: true } },
      sections: { include: { items: { select: { id: true } } } },
      campaignTemplates: { select: { campaignId: true } },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  const rows: TemplateRow[] = templates.map((t) => {
    const isOwn = t.ownerNodeId === node.id;
    return {
      id: t.id,
      title: t.title,
      targetGroup: t.targetGroup,
      status: t.status,
      sectionCount: t.sections.length,
      itemCount: t.sections.reduce((n, s) => n + s.items.length, 0),
      ownerNodeId: t.ownerNodeId,
      ownerNodeName: t.ownerNode.name,
      isOwn,
      clonedFromTitle: t.clonedFrom?.title ?? null,
      usedByCampaigns: new Set(t.campaignTemplates.map((c) => c.campaignId)).size,
      publishedAt: t.publishedAt,
      canEdit: isOwn && t.status === "DRAFT",
      canPublish: isOwn && t.status === "DRAFT",
      canArchive: isOwn && t.status !== "ARCHIVED",
    };
  });

  return {
    templates: rows,
    counts: {
      draft: rows.filter((r) => r.status === "DRAFT").length,
      published: rows.filter((r) => r.status === "PUBLISHED").length,
      archived: rows.filter((r) => r.status === "ARCHIVED").length,
    },
  };
}

function toDetailDto(template: LoadedTemplate, ownNodeId: string) {
  const shares = compositeShares(template.sections);

  const sections = template.sections.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    type: s.type,
    scaleId: s.scaleId,
    scaleName: s.scale?.name ?? null,
    weight: s.weight,
    isOverall: s.isOverall,
    allowNotApplicable: s.allowNotApplicable,
    order: s.order,
    compositeShare: shares.get(s.id) ?? 0,
    items: s.items.map((it) => ({ id: it.id, text: it.text, weight: it.weight, required: it.required, order: it.order })),
  }));

  return {
    id: template.id,
    title: template.title,
    targetGroup: template.targetGroup,
    status: template.status,
    ownerNodeId: template.ownerNodeId,
    ownerNodeName: template.ownerNode.name,
    isOwn: template.ownerNodeId === ownNodeId,
    clonedFromId: template.clonedFromId,
    clonedFromTitle: template.clonedFrom?.title ?? null,
    publishedAt: template.publishedAt,
    editable: template.ownerNodeId === ownNodeId && template.status === "DRAFT",
    sections,
  };
}

async function loadVisible(ownNodeId: string, templateId: string) {
  const template = await prisma.template.findUnique({ where: { id: templateId }, include: DETAIL_INCLUDE });
  if (!template) throw new Error("Template not found");
  if (!isTemplateVisible(template, ownNodeId, await ancestorIdsOf(ownNodeId))) {
    throw new Error("Template not found");
  }
  return template;
}

export async function getTemplateDetail(requestingUserId: string, templateId: string) {
  const node = await ownNode(requestingUserId);
  const template = await loadVisible(node.id, templateId);
  return toDetailDto(template, node.id);
}

export async function createTemplate(requestingUserId: string, input: { title: string; targetGroup: TargetGroup }) {
  const node = await ownNode(requestingUserId);
  const defaultScale = await prisma.likertScale.findFirst({ orderBy: { name: "asc" } });
  const template = await prisma.template.create({
    data: {
      title: input.title,
      targetGroup: input.targetGroup,
      ownerNodeId: node.id,
      status: "DRAFT",
      sections: {
        create: [
          {
            title: "Untitled section",
            type: "LIKERT_GRID",
            scaleId: defaultScale?.id,
            weight: 1,
            order: 1,
            items: { create: [{ text: "Untitled statement", weight: 1, required: true, order: 1 }] },
          },
        ],
      },
    },
    include: DETAIL_INCLUDE,
  });
  return toDetailDto(template, node.id);
}

export interface UpdateSectionInput {
  title: string;
  description: string | null;
  type: SectionType;
  scaleId: string | null;
  weight: number;
  isOverall: boolean;
  allowNotApplicable: boolean;
  items: { text: string; weight: number; required: boolean }[];
}

/** Full replace of sections/items — a draft has nothing to diff against until it's
 *  published/launched. Runs in a transaction so a half-written structure can never be
 *  observed. */
export async function updateTemplate(
  requestingUserId: string,
  templateId: string,
  input: { title: string; sections: UpdateSectionInput[] },
) {
  const node = await ownNode(requestingUserId);
  const existing = await prisma.template.findFirst({ where: { id: templateId, ownerNodeId: node.id } });
  if (!existing) throw new Error("Template not found");
  if (existing.status !== "DRAFT") throw new Error("Only a draft template can be edited");

  for (const section of input.sections) {
    if (section.type !== "LIKERT_GRID") continue;
    const scale = await prisma.likertScale.findUnique({ where: { id: section.scaleId! } });
    if (!scale) throw new Error(`Unknown scale for section "${section.title}"`);
  }

  await prisma.$transaction([
    prisma.templateSection.deleteMany({ where: { templateId } }),
    prisma.template.update({
      where: { id: templateId },
      data: {
        title: input.title,
        sections: {
          create: input.sections.map((s, i) => ({
            title: s.title,
            description: s.description,
            type: s.type,
            scaleId: s.type === "LIKERT_GRID" ? s.scaleId : null,
            weight: s.weight,
            isOverall: s.isOverall,
            allowNotApplicable: s.type === "LIKERT_GRID" ? s.allowNotApplicable : false,
            order: i + 1,
            items: { create: s.items.map((it, j) => ({ text: it.text, weight: it.weight, required: it.required, order: j + 1 })) },
          })),
        },
      },
    }),
  ]);

  return getTemplateDetail(requestingUserId, templateId);
}

export async function cloneTemplate(requestingUserId: string, templateId: string) {
  const node = await ownNode(requestingUserId);
  const source = await loadVisible(node.id, templateId);

  const clone = await prisma.template.create({
    data: {
      title: `${source.title} — copy`,
      targetGroup: source.targetGroup,
      ownerNodeId: node.id,
      status: "DRAFT",
      clonedFromId: source.id,
      sections: {
        create: source.sections.map((s, i) => ({
          title: s.title,
          description: s.description,
          type: s.type,
          scaleId: s.scaleId,
          weight: s.weight,
          isOverall: s.isOverall,
          allowNotApplicable: s.allowNotApplicable,
          order: i + 1,
          items: { create: s.items.map((it, j) => ({ text: it.text, weight: it.weight, required: it.required, order: j + 1 })) },
        })),
      },
    },
    include: DETAIL_INCLUDE,
  });
  return toDetailDto(clone, node.id);
}

/** A published template can never be edited — the responses already collected against
 *  it must keep meaning the same thing. Clone it into a new draft instead. */
export async function publishTemplate(requestingUserId: string, templateId: string) {
  const node = await ownNode(requestingUserId);
  const existing = await prisma.template.findFirst({ where: { id: templateId, ownerNodeId: node.id } });
  if (!existing) throw new Error("Template not found");
  if (existing.status !== "DRAFT") throw new Error("Only a draft template can be edited");

  const sections = await prisma.templateSection.findMany({ where: { templateId }, include: { items: { select: { id: true } } } });
  if (sections.length === 0) throw new Error("Add at least one section before publishing");
  for (const s of sections) {
    if (s.items.length === 0) throw new Error(`Section "${s.title}" has no items`);
    if (s.type === "LIKERT_GRID" && !s.scaleId) throw new Error(`Section "${s.title}" needs a scale`);
  }

  await prisma.template.update({ where: { id: templateId }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  return getTemplateDetail(requestingUserId, templateId);
}

export async function archiveTemplate(requestingUserId: string, templateId: string) {
  const node = await ownNode(requestingUserId);
  const template = await prisma.template.findFirst({ where: { id: templateId, ownerNodeId: node.id } });
  if (!template) throw new Error("Template not found");
  if (template.status === "ARCHIVED") throw new Error("Already archived");

  await prisma.template.update({ where: { id: templateId }, data: { status: "ARCHIVED" } });
  return getTemplateDetail(requestingUserId, templateId);
}
