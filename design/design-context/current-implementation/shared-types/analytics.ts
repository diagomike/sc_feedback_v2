import { z } from "zod";

export const dashboardQuerySchema = z.object({
  campaignId: z.string(),
  teacherId: z.string(),
  targetGroup: z.enum(["STUDENT", "PEER", "MANAGER"]),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export const sectionScoreDto = z.object({
  sectionId: z.string(),
  title: z.string(),
  isOverall: z.boolean(),
  score: z.number().nullable(), // 0-100, null if unanswered
  weight: z.number(),
});

export const dashboardDto = z.object({
  teacherId: z.string(),
  teacherName: z.string(),
  campaignId: z.string(),
  campaignName: z.string(),
  responseCount: z.number().int(),
  minResponses: z.number().int(),
  suppressed: z.boolean(), // true when responseCount < minResponses
  overallScore: z.number().nullable(), // weighted composite, excludes isOverall section
  selfRatedOverall: z.number().nullable(), // the isOverall section's own score, reported separately
  sections: z.array(sectionScoreDto),
  comments: z.array(z.string()),
});
export type DashboardDto = z.infer<typeof dashboardDto>;
