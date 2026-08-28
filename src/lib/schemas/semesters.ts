import { z } from "zod";

export const termEnum = z.enum(["FALL", "SPRING", "SUMMER"]);

export const createSemesterSchema = z.object({
  academicYear: z.number().int().min(2000).max(2100),
  term: termEnum,
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
});
export type CreateSemesterInput = z.infer<typeof createSemesterSchema>;
