import "server-only";
import { prisma } from "@/server/db";
import { sendMail } from "@/server/mail/mail";
import { registrationEmail } from "@/server/mail/templates";
import { generateRawToken, hashToken } from "./token";
import { DEFAULT_WEB_ORIGIN } from "@/lib/config";
import * as argon2 from "argon2";
import type { RoleKind } from "@prisma/client";

const INVITATION_TTL_DAYS = 14;

export class ConflictError extends Error {}
export class GoneError extends Error {}
export class NotFoundError extends Error {}

/**
 * The one place "what does inviting someone actually do" is answered — reused by the
 * hierarchy screens (inviting a node's head), people screen (single teacher/student),
 * and CSV import (bulk). Each caller creates whatever role-specific row it needs
 * (HierarchyNode.userId, Membership) around the userId this returns; this module only
 * owns the User/Invitation/email side of onboarding. Ported from v1's InvitationService.
 */
export async function inviteNewUser(params: {
  name: string;
  email: string;
  role: RoleKind;
  hierarchyNodeId?: string | null;
  managedByNodeId?: string | null;
}): Promise<{ userId: string }> {
  const emailLower = params.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { emailLower } });
  if (existing) throw new ConflictError(`${params.email} is already in the system`);

  const user = await prisma.user.create({
    data: {
      email: params.email,
      emailLower,
      name: params.name,
      status: "INVITED",
      roles: { create: [{ kind: params.role }] },
    },
  });

  await issueAndSend({
    email: params.email,
    name: params.name,
    role: params.role,
    hierarchyNodeId: params.hierarchyNodeId,
    managedByNodeId: params.managedByNodeId,
  });

  return { userId: user.id };
}

/** A fresh link immediately invalidates the previous one — enforced by deleting any
 *  unconsumed invitation for this email before issuing the new one. */
export async function resendInvitation(userId: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: true } });
  if (user.status === "ACTIVE") throw new ConflictError("This person has already registered");

  await prisma.invitation.deleteMany({ where: { emailLower: user.emailLower, consumedAt: null } });
  await issueAndSend({ email: user.email, name: user.name, role: (user.roles[0]?.kind ?? "TEACHER") as RoleKind });
}

async function issueAndSend(params: {
  email: string;
  name: string;
  role: RoleKind;
  hierarchyNodeId?: string | null;
  managedByNodeId?: string | null;
}): Promise<void> {
  const raw = generateRawToken();
  await prisma.invitation.create({
    data: {
      emailLower: params.email.toLowerCase(),
      tokenHash: hashToken(raw),
      intendedRole: params.role,
      hierarchyNodeId: params.hierarchyNodeId ?? null,
      managedByNodeId: params.managedByNodeId ?? null,
      expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 3600 * 1000),
    },
  });

  const link = `${process.env.WEB_ORIGIN ?? DEFAULT_WEB_ORIGIN}/register/${raw}`;
  const { subject, html } = registrationEmail({ name: params.name, link, role: params.role });
  await sendMail({ to: params.email, subject, html });
}

export interface InvitationPreview {
  valid: boolean;
  name: string | null;
  email: string | null;
  role: RoleKind | null;
  reason: "invalid" | "consumed" | "expired" | null;
}

/** What /register/[token] shows before the person has typed anything — the token in
 *  the URL is the credential, so this must work with no session and must not leak
 *  whether an email exists for a token that doesn't match. */
export async function previewInvitation(rawToken: string): Promise<InvitationPreview> {
  const invitation = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!invitation) return { valid: false, name: null, email: null, role: null, reason: "invalid" };
  if (invitation.consumedAt) return { valid: false, name: null, email: null, role: null, reason: "consumed" };
  if (invitation.expiresAt < new Date()) return { valid: false, name: null, email: null, role: null, reason: "expired" };

  const user = await prisma.user.findUnique({ where: { emailLower: invitation.emailLower } });
  return { valid: true, name: user?.name ?? null, email: user?.email ?? null, role: invitation.intendedRole, reason: null };
}

/** Sets the password and flips the invited account to ACTIVE. The invitation is
 *  consumed in the same transaction as the activation so a link can never be reused
 *  to reset a password later. */
export async function completeRegistration(rawToken: string, password: string): Promise<string> {
  const invitation = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!invitation || invitation.consumedAt || invitation.expiresAt < new Date()) {
    throw new GoneError("This invitation link is no longer valid");
  }
  const user = await prisma.user.findUnique({ where: { emailLower: invitation.emailLower } });
  if (!user) throw new NotFoundError("This invitation is not linked to an account");

  const passwordHash = await argon2.hash(password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash, status: "ACTIVE" } }),
    prisma.invitation.update({ where: { id: invitation.id }, data: { consumedAt: new Date() } }),
  ]);
  return user.id;
}
