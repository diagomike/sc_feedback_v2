"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import {
  createSessionAndSetCookie,
  destroySessionAndClearCookie,
  validateCredentials,
} from "@/server/auth/session";
import { completeRegistration, GoneError, NotFoundError } from "@/server/auth/invitation";
import * as argon2 from "argon2";
import { loginSchema, registerSchema, updateProfileSchema, changePasswordSchema } from "@/lib/schemas/auth";
import { landingPathFor } from "@/lib/nav";
import { requireUser } from "@/server/auth/session";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function loginAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, error: "Enter a valid email and password" };

  let user;
  try {
    user = await validateCredentials(parsed.data.email, parsed.data.password);
  } catch {
    return { ok: false, error: "Invalid email or password" };
  }

  await createSessionAndSetCookie(user.id);
  const roles = user.roles.map((r) => r.kind);
  redirect(landingPathFor(roles, user.hierarchyNode?.type ?? null));
}

export async function logoutAction(): Promise<void> {
  await destroySessionAndClearCookie();
  redirect("/login");
}

export async function registerAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = registerSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, error: "Password must be at least 8 characters" };

  let userId: string;
  try {
    userId = await completeRegistration(parsed.data.token, parsed.data.password);
  } catch (e) {
    if (e instanceof GoneError) return { ok: false, error: e.message };
    if (e instanceof NotFoundError) return { ok: false, error: e.message };
    return { ok: false, error: "Something went wrong completing registration" };
  }

  await createSessionAndSetCookie(userId);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { roles: true, hierarchyNode: true },
  });
  redirect(landingPathFor(user.roles.map((r) => r.kind), user.hierarchyNode?.type ?? null));
}

export async function updateProfileAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = updateProfileSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") || null,
  });
  if (!parsed.success) return { ok: false, error: "Enter a valid name" };

  await prisma.user.update({
    where: { id: user.id },
    data: { name: parsed.data.name, phone: parsed.data.phone ?? null },
  });
  return { ok: true };
}

export async function changePasswordAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const sessionUser = await requireUser();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) return { ok: false, error: "New password must be at least 8 characters" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id } });
  if (!user.passwordHash || !(await argon2.verify(user.passwordHash, parsed.data.currentPassword))) {
    return { ok: false, error: "Current password is incorrect" };
  }
  const passwordHash = await argon2.hash(parsed.data.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  return { ok: true };
}
