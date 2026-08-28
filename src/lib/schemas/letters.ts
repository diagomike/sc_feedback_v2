import { z } from "zod";

export const letterRequestSchema = z.object({
  studentCampaignId: z.string(),
  peerCampaignId: z.string(),
  managerCampaignId: z.string(),
  roundLabel: z.string().min(1).max(200),
});
export type LetterRequestInput = z.infer<typeof letterRequestSchema>;
