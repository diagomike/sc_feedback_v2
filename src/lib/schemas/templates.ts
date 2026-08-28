import { z } from "zod";

export const createTemplateSchema = z.object({
  title: z.string().min(1).max(200),
  targetGroup: z.enum(["STUDENT", "PEER", "MANAGER"]),
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const templateItemSchema = z.object({
  text: z.string().min(1),
  weight: z.number().min(0),
  required: z.boolean(),
});

export const templateSectionSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable(),
  type: z.enum(["LIKERT_GRID", "FREE_TEXT"]),
  scaleId: z.string().nullable(),
  weight: z.number().min(0),
  isOverall: z.boolean(),
  items: z.array(templateItemSchema).min(1),
});

export const updateTemplateSchema = z.object({
  title: z.string().min(1).max(200),
  sections: z.array(templateSectionSchema).min(1),
});
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const scalePointSchema = z.object({
  label: z.string().min(1),
  value: z.number(),
});

export const saveScaleSchema = z.object({
  name: z.string().min(1).max(200),
  points: z.array(scalePointSchema).min(2),
});
export type SaveScaleInput = z.infer<typeof saveScaleSchema>;
