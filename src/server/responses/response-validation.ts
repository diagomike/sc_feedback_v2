import "server-only";
import { prisma } from "@/server/db";
import type { AnswerInput } from "@/lib/schemas/responses";

/**
 * Shared between the authenticated ResponseTask flow and the unauthenticated public/
 * guest ballot flow — both submit the same shape of answers against the same kind of
 * template sections, and both need the same lazy-close transition. Ported from v1's
 * responses/response-validation.ts.
 */

export class ValidationError extends Error {}
export class ClosedError extends Error {}

export function validateAnswers(
  sections: {
    id: string;
    type: string;
    items: { id: string; required: boolean }[];
    scale: { points: { value: number }[] } | null;
  }[],
  answers: AnswerInput[],
): void {
  const byItemId = new Map(answers.map((a) => [a.itemId, a]));

  for (const section of sections) {
    const validValues = section.scale ? new Set(section.scale.points.map((p) => p.value)) : null;
    for (const item of section.items) {
      const answer = byItemId.get(item.id);
      if (!answer) {
        if (item.required) throw new ValidationError(`Missing required answer for item ${item.id}`);
        continue;
      }
      if (section.type === "LIKERT_GRID") {
        if (answer.pointValue == null || !validValues?.has(answer.pointValue)) {
          throw new ValidationError(`Invalid scale value for item ${item.id}`);
        }
      } else if (section.type === "FREE_TEXT") {
        if (item.required && (!answer.text || answer.text.trim().length === 0)) {
          throw new ValidationError(`Missing required text for item ${item.id}`);
        }
      }
    }
  }
}

/** Lazy close: a campaign past its closesAt is treated as CLOSED the moment anyone
 *  touches it, with no scheduler needed. Persists the transition. */
export async function effectiveCampaignStatus(campaignId: string): Promise<string> {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.status === "CLOSED") return "CLOSED";
  if (campaign.closesAt && campaign.closesAt < new Date()) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "CLOSED" } });
    return "CLOSED";
  }
  return campaign.status;
}
