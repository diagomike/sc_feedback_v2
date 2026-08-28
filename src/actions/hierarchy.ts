"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import * as hierarchy from "@/server/hierarchy/hierarchy";
import {
  createNodeSchema,
  reassignParentsSchema,
  assignHeadSchema,
  renameNodeSchema,
  changeLevelSchema,
  changeTypeSchema,
} from "@/lib/schemas/hierarchy";
import type { ActionResult } from "./auth";

/** Structure/Personnel/Offices/Colleges/Departments are ADMIN-only — the system admin
 *  lays out the org chart; this is not delegated to academic managers. Re-asserted here
 *  regardless of the (shell) layout's canAccessPath check, per the three-layer RBAC
 *  convention (nav filtering / route guard / server enforcement all independently). */
async function requireAdmin() {
  const user = await requireUser();
  if (!user.roles.includes("ADMIN")) throw new Error("Only a system administrator can do this");
  return user;
}

function revalidateStructure() {
  for (const p of ["/manage/personnel", "/manage/offices", "/manage/colleges", "/manage/departments", "/manage/hierarchy"]) {
    revalidatePath(p);
  }
}

export async function createNodeAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parentIds = formData.getAll("parentIds").map(String).filter(Boolean);
  const headName = String(formData.get("headName") ?? "").trim();
  const headEmail = String(formData.get("headEmail") ?? "").trim();

  const parsed = createNodeSchema.safeParse({
    name: formData.get("name"),
    level: Number(formData.get("level")),
    type: formData.get("type"),
    parentIds,
    head: headName && headEmail ? { name: headName, email: headEmail } : null,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    await hierarchy.createNodeWithHead(parsed.data);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidateStructure();
  return { ok: true };
}

export async function resendInvitationAction(nodeId: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await hierarchy.resendForNode(nodeId);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidateStructure();
  return { ok: true };
}

export async function revokeAccessAction(nodeId: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await hierarchy.revokeAccess(nodeId);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidateStructure();
  return { ok: true };
}

export async function assignHeadAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = assignHeadSchema.safeParse({
    nodeId: formData.get("nodeId"),
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!parsed.success) return { ok: false, error: "Enter a valid name and email" };
  try {
    await hierarchy.assignHead(parsed.data.nodeId, { name: parsed.data.name, email: parsed.data.email });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidateStructure();
  return { ok: true };
}

export async function deactivateNodeAction(nodeId: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await hierarchy.deactivateNode(nodeId);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidateStructure();
  return { ok: true };
}

export async function reactivateNodeAction(nodeId: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await hierarchy.reactivateNode(nodeId);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidateStructure();
  return { ok: true };
}

export async function deleteNodeAction(nodeId: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await hierarchy.deleteNode(nodeId);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidateStructure();
  return { ok: true };
}

export async function reassignParentsAction(input: { nodeId: string; parentIds: string[]; additive?: boolean }): Promise<ActionResult> {
  await requireAdmin();
  const parsed = reassignParentsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid parent selection" };
  try {
    await hierarchy.reassignParents(parsed.data.nodeId, parsed.data.parentIds, parsed.data.additive ?? false);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidateStructure();
  return { ok: true };
}

export async function renameNodeAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = renameNodeSchema.safeParse({ nodeId: formData.get("nodeId"), name: formData.get("name") });
  if (!parsed.success) return { ok: false, error: "Enter a valid name" };
  await hierarchy.renameNode(parsed.data.nodeId, parsed.data.name);
  revalidateStructure();
  return { ok: true };
}

export async function changeLevelAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = changeLevelSchema.safeParse({ nodeId: formData.get("nodeId"), level: Number(formData.get("level")) });
  if (!parsed.success) return { ok: false, error: "Enter a valid level" };
  try {
    await hierarchy.changeLevel(parsed.data.nodeId, parsed.data.level);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidateStructure();
  return { ok: true };
}

export async function changeTypeAction(nodeId: string, type: "OFFICE" | "COLLEGE" | "DEPARTMENT"): Promise<ActionResult> {
  await requireAdmin();
  const parsed = changeTypeSchema.safeParse({ nodeId, type });
  if (!parsed.success) return { ok: false, error: "Invalid type" };
  await hierarchy.changeType(parsed.data.nodeId, parsed.data.type);
  revalidateStructure();
  return { ok: true };
}
