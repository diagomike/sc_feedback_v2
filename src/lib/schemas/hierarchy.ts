import { z } from "zod";

export const nodeTypeEnum = z.enum(["OFFICE", "COLLEGE", "DEPARTMENT"]);

export const createNodeSchema = z.object({
  name: z.string().min(1).max(200),
  level: z.number().int().min(0).max(10),
  type: nodeTypeEnum,
  parentIds: z.array(z.string()),
  head: z.object({ name: z.string().min(1), email: z.string().email() }).nullable(),
});
export type CreateNodeInput = z.infer<typeof createNodeSchema>;

export const createEdgeSchema = z.object({
  parentId: z.string(),
  childId: z.string(),
});
export type CreateEdgeInput = z.infer<typeof createEdgeSchema>;

export const reassignParentsSchema = z.object({
  nodeId: z.string(),
  parentIds: z.array(z.string()),
  additive: z.boolean().optional(), // Structure page's Shift+drop — add rather than replace
});
export type ReassignParentsInput = z.infer<typeof reassignParentsSchema>;

export const assignHeadSchema = z.object({
  nodeId: z.string(),
  name: z.string().min(1).max(200),
  email: z.string().email(),
});
export type AssignHeadInput = z.infer<typeof assignHeadSchema>;

export const renameNodeSchema = z.object({
  nodeId: z.string(),
  name: z.string().min(1).max(200),
});
export type RenameNodeInput = z.infer<typeof renameNodeSchema>;

export const changeLevelSchema = z.object({
  nodeId: z.string(),
  level: z.number().int().min(0).max(10),
});
export type ChangeLevelInput = z.infer<typeof changeLevelSchema>;

export const changeTypeSchema = z.object({
  nodeId: z.string(),
  type: nodeTypeEnum,
});
export type ChangeTypeInput = z.infer<typeof changeTypeSchema>;
