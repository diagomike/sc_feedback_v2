import "server-only";
import { prisma } from "@/server/db";
import { ownDepartmentNode } from "@/server/scope";
import { getDashboard } from "@/server/analytics/analytics";
import { officialOverall } from "@/server/analytics/scoring";
import { buildLettersDocx } from "./docx-letter";
import { buildLettersPdf } from "./pdf-letter";
import type { LetterContent } from "./letter-content";
import { semesterLabel } from "@/lib/semester";
import type { TargetGroup } from "@prisma/client";

/** Ported from v1's LettersService. */

export interface LetterRequestInput {
  studentCampaignId: string;
  peerCampaignId: string;
  managerCampaignId: string;
  roundLabel: string;
}

export interface LetterPreviewRow {
  teacherId: string;
  name: string;
  ready: boolean;
  reason: string | null;
  studentScore: number | null;
  peerScore: number | null;
  managerScore: number | null;
  overallScore: number | null;
}

export async function listLetterCampaignOptions(requestingUserId: string) {
  const node = await ownDepartmentNode(requestingUserId);
  const [student, peer, manager] = await Promise.all([
    closedCampaigns(node.id, "STUDENT"),
    closedCampaigns(node.id, "PEER"),
    closedCampaigns(node.id, "MANAGER"),
  ]);
  return { student, peer, manager };
}

async function closedCampaigns(nodeId: string, targetGroup: TargetGroup) {
  const campaigns = await prisma.campaign.findMany({
    where: { nodeId, status: "CLOSED", campaignTemplates: { some: { targetGroup } } },
    include: { semester: true },
    orderBy: [{ closesAt: "desc" }, { createdAt: "desc" }],
  });
  return campaigns.map((c) => ({ id: c.id, name: c.name, closesAt: c.closesAt, semesterLabel: semesterLabel(c.semester) }));
}

function to5(score100: number | null): number | null {
  if (score100 == null) return null;
  return Math.round((score100 / 100) * 5 * 100) / 100;
}

function missingReason(student: number | null, peer: number | null, manager: number | null): string {
  const missing: string[] = [];
  if (student == null) missing.push("student");
  if (peer == null) missing.push("peer");
  if (manager == null) missing.push("head");
  return `Missing or not yet available: ${missing.join(", ")}`;
}

async function safeComposite(campaignId: string, teacherId: string, targetGroup: TargetGroup, requestingUserId: string): Promise<number | null> {
  try {
    const dashboard = await getDashboard({ campaignId, teacherId, targetGroup, requestingUserId });
    return dashboard.suppressed ? null : dashboard.overallScore;
  } catch {
    return null;
  }
}

async function computeRows(requestingUserId: string, nodeId: string, input: LetterRequestInput): Promise<LetterPreviewRow[]> {
  const teachers = await prisma.membership.findMany({ where: { nodeId, kind: "TEACHER" }, include: { user: true }, orderBy: { user: { name: "asc" } } });

  const rows: LetterPreviewRow[] = [];
  for (const t of teachers) {
    const [student, peer, manager] = await Promise.all([
      safeComposite(input.studentCampaignId, t.userId, "STUDENT", requestingUserId),
      safeComposite(input.peerCampaignId, t.userId, "PEER", requestingUserId),
      safeComposite(input.managerCampaignId, t.userId, "MANAGER", requestingUserId),
    ]);

    const overall100 = officialOverall({ student, peer, manager });
    const s5 = to5(student);
    const p5 = to5(peer);
    const m5 = to5(manager);
    const ready = s5 != null && p5 != null && m5 != null;

    rows.push({
      teacherId: t.userId,
      name: t.user.name,
      ready,
      reason: ready ? null : missingReason(student, peer, manager),
      studentScore: s5,
      peerScore: p5,
      managerScore: m5,
      overallScore: overall100 == null ? null : to5(overall100),
    });
  }
  return rows;
}

export async function previewLetters(requestingUserId: string, input: LetterRequestInput) {
  const node = await ownDepartmentNode(requestingUserId);
  const rows = await computeRows(requestingUserId, node.id, input);
  return { roundLabel: input.roundLabel, rows, readyCount: rows.filter((r) => r.ready).length, excludedCount: rows.filter((r) => !r.ready).length };
}

async function readyLetters(requestingUserId: string, input: LetterRequestInput): Promise<LetterContent[]> {
  const node = await ownDepartmentNode(requestingUserId);
  const [head, rows] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: requestingUserId } }),
    computeRows(requestingUserId, node.id, input),
  ]);

  return rows
    .filter((r) => r.ready)
    .map((r) => ({
      teacherName: r.name,
      departmentName: node.name,
      headName: head.name,
      roundLabel: input.roundLabel,
      studentScore: r.studentScore!,
      peerScore: r.peerScore!,
      managerScore: r.managerScore!,
      overallScore: r.overallScore!,
    }));
}

export async function generateLettersDocx(requestingUserId: string, input: LetterRequestInput): Promise<Buffer> {
  return buildLettersDocx(await readyLetters(requestingUserId, input));
}

export async function generateLettersPdf(requestingUserId: string, input: LetterRequestInput): Promise<Buffer> {
  return buildLettersPdf(await readyLetters(requestingUserId, input));
}
