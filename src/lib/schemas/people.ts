import { z } from "zod";

export const createPersonSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  kind: z.enum(["TEACHER", "STUDENT"]),
  groupIds: z.array(z.string()),
});
export type CreatePersonInput = z.infer<typeof createPersonSchema>;

export const studentProgramEnum = z.enum(["REGULAR", "WEEKEND", "EXTENSION"]);

export const createGroupSchema = z.object({
  name: z.string().min(1).max(200),
  program: studentProgramEnum,
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
