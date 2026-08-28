import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import * as argon2 from "argon2";
import { prisma } from "@/server/db";
import { generateRawToken, hashToken } from "./token";
import type { NodeType, RoleKind } from "@prisma/client";

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "sc_session_v2";
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 14);

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  roles: RoleKind[];
  hierarchyNodeId: string | null;
  hierarchyNodeType: NodeType | null;
}

/** Verifies credentials against the stored argon2 hash. Never distinguishes "no such
 *  user" from "wrong password" in the error it throws — same as v1. */
export async function validateCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { emailLower: email.toLowerCase() },
    include: { roles: true, hierarchyNode: true },
  });
  if (!user || !user.passwordHash || user.status !== "ACTIVE") {
    throw new Error("Invalid email or password");
  }
  const valid = await argon2.verify(user.passwordHash, password);
  if (!valid) throw new Error("Invalid email or password");
  return user;
}

/** Creates a session row and sets the httpOnly cookie on the current response. Call
 *  only from a Server Action or Route Handler (cookies() is only writable there). */
export async function createSessionAndSetCookie(userId: string) {
  const raw = generateRawToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const h = await headers();
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      expiresAt,
      userAgent: h.get("user-agent") ?? undefined,
    },
  });
  const jar = await cookies();
  jar.set(COOKIE_NAME, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function destroySessionAndClearCookie() {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (raw) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(raw) } });
  }
  jar.delete(COOKIE_NAME);
}

/** Reads the session cookie and resolves the current user, or null if not signed in /
 *  session expired / account disabled. Safe to call from Server Components (cookies()
 *  is readable everywhere in the request lifecycle), unlike the cookie-writing helpers
 *  above which require a Server Action or Route Handler. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const tokenHash = createHash("sha256").update(raw).digest("hex");
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: { include: { roles: true, hierarchyNode: true } } },
  });

  if (!session || session.expiresAt < new Date() || session.user.status !== "ACTIVE") {
    return null;
  }

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    roles: session.user.roles.map((r) => r.kind),
    hierarchyNodeId: session.user.hierarchyNode?.id ?? null,
    hierarchyNodeType: session.user.hierarchyNode?.type ?? null,
  };
}

/** Redirects to /login when not signed in — call at the top of every protected
 *  Server Component page/layout and every server action that requires auth. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export { hashToken };
