import { z } from "zod";

/** One answer to one template item. Exactly one of pointValue / text is populated,
 *  matching whether the parent section is LIKERT_GRID or FREE_TEXT. */
export const answerInputSchema = z.object({
  itemId: z.string(),
  pointValue: z.number().int().nullable().optional(),
  text: z.string().nullable().optional(),
});
export type AnswerInput = z.infer<typeof answerInputSchema>;

export const submitResponseSchema = z.object({
  answers: z.array(answerInputSchema).min(1),
});
export type SubmitResponseInput = z.infer<typeof submitResponseSchema>;

/** Shape returned to the client rendering the grid form — task metadata plus the
 *  full template structure needed to draw sections/items/scale points. */
export const likertPointDto = z.object({
  id: z.string(),
  label: z.string(),
  value: z.number().int(),
  order: z.number().int(),
});

export const templateItemDto = z.object({
  id: z.string(),
  text: z.string(),
  required: z.boolean(),
  order: z.number().int(),
});

export const templateSectionDto = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  type: z.enum(["LIKERT_GRID", "FREE_TEXT"]),
  isOverall: z.boolean(),
  order: z.number().int(),
  scale: z.array(likertPointDto).nullable(),
  items: z.array(templateItemDto),
});

export const responseFormDto = z.object({
  taskId: z.string(),
  teacherName: z.string(),
  campaignName: z.string(),
  targetGroup: z.enum(["STUDENT", "PEER", "MANAGER"]),
  completed: z.boolean(),
  sections: z.array(templateSectionDto),
});
export type ResponseFormDto = z.infer<typeof responseFormDto>;
