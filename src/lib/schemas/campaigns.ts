import { z } from "zod";

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(["EMAIL", "INSTANT"]).default("EMAIL"),
  semesterId: z.string().min(1),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const assignmentInputSchema = z.object({
  teacherId: z.string(),
  studentGroupIds: z.array(z.string()),
  /** Course offerings this teacher gave in the campaign's semester. Defaulted rather than
   *  required so an older client (or a guest/INSTANT campaign, which has no courses) still
   *  submits a valid payload. */
  offeringIds: z.array(z.string()).default([]),
  peerIds: z.array(z.string()),
  headIncluded: z.boolean(),
});

export const updateCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  audienceMode: z.enum(["REGISTERED_ONLY", "GUEST_ALLOWED"]),
  opensAt: z.string().nullable(),
  closesAt: z.string().nullable(),
  maxResponses: z.number().int().positive().nullable(),
  minResponses: z.number().int().min(1).max(50),
  minTeachers: z.number().int().min(1).max(200),
  minStudents: z.number().int().min(1).max(2000),
  templates: z.object({
    STUDENT: z.string().nullable(),
    PEER: z.string().nullable(),
    MANAGER: z.string().nullable(),
  }),
  assignments: z.array(assignmentInputSchema),
});
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
