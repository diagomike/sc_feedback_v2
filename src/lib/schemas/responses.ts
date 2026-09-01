import { z } from "zod";

export const answerInputSchema = z.object({
  itemId: z.string(),
  pointValue: z.number().int().nullable().optional(),
  /** The ASTU forms' "not applicable" mark. Distinct from simply leaving an item blank:
   *  N/A is a deliberate statement that the item does not apply to this teacher, so it
   *  satisfies a required item — while still contributing no rating to any mean. */
  notApplicable: z.boolean().optional(),
  text: z.string().nullable().optional(),
});
export type AnswerInput = z.infer<typeof answerInputSchema>;

export const submitResponseSchema = z.object({
  answers: z.array(answerInputSchema).min(1),
});

export const startBallotSchema = z.object({ teacherId: z.string() });
