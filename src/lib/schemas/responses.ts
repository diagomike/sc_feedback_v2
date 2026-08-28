import { z } from "zod";

export const answerInputSchema = z.object({
  itemId: z.string(),
  pointValue: z.number().int().nullable().optional(),
  text: z.string().nullable().optional(),
});
export type AnswerInput = z.infer<typeof answerInputSchema>;

export const submitResponseSchema = z.object({
  answers: z.array(answerInputSchema).min(1),
});

export const startBallotSchema = z.object({ teacherId: z.string() });
