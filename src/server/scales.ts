import "server-only";
import { prisma } from "@/server/db";
import { normalizeValue } from "@/server/analytics/scoring";

/**
 * Scales are reusable across the whole university, not scoped to a department. Any
 * manager may create or edit one; ownerNodeId (nullable on the model) is provenance
 * only and never filters visibility. Ported from v1's ScalesService.
 */

export async function listScales() {
  const scales = await prisma.likertScale.findMany({
    include: { points: true, sections: { select: { templateId: true } } },
    orderBy: { name: "asc" },
  });
  return scales.map((s) => ({
    id: s.id,
    name: s.name,
    pointCount: s.points.length,
    sectionCount: s.sections.length,
    templateCount: new Set(s.sections.map((sec) => sec.templateId)).size,
  }));
}

async function load(id: string) {
  const scale = await prisma.likertScale.findUnique({
    where: { id },
    include: { points: true, sections: { select: { templateId: true } } },
  });
  if (!scale) throw new Error("Scale not found");
  return scale;
}

function toDetailDto(scale: {
  id: string;
  name: string;
  points: { id: string; label: string; value: number; order: number }[];
  sections: { templateId: string }[];
}) {
  const ordered = [...scale.points].sort((a, b) => a.order - b.order);
  const values = ordered.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    id: scale.id,
    name: scale.name,
    sectionCount: scale.sections.length,
    templateCount: new Set(scale.sections.map((s) => s.templateId)).size,
    points: ordered.map((p) => ({
      id: p.id,
      label: p.label,
      value: p.value,
      order: p.order,
      normalized: Math.round(normalizeValue(p.value, min, max) * 10) / 10,
    })),
  };
}

export async function getScaleDetail(id: string) {
  return toDetailDto(await load(id));
}

export async function createScale(input: { name: string; points: { label: string; value: number }[] }) {
  const scale = await prisma.likertScale.create({
    data: { name: input.name, points: { create: input.points.map((p, i) => ({ label: p.label, value: p.value, order: i + 1 })) } },
    include: { points: true, sections: { select: { templateId: true } } },
  });
  return toDetailDto(scale);
}

/** Points are replaced wholesale — no point-level identity worth preserving, only the
 *  ordered label/value list. */
export async function updateScale(id: string, input: { name: string; points: { label: string; value: number }[] }) {
  await load(id);
  await prisma.$transaction([
    prisma.likertPoint.deleteMany({ where: { scaleId: id } }),
    prisma.likertScale.update({
      where: { id },
      data: { name: input.name, points: { create: input.points.map((p, i) => ({ label: p.label, value: p.value, order: i + 1 })) } },
    }),
  ]);
  return getScaleDetail(id);
}
