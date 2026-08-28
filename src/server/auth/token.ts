import { createHash, randomBytes } from "node:crypto";

/** Raw tokens (session cookies, invitation/ballot links) are never stored — only
 *  their SHA-256 hash is. A leaked database dump then reveals no usable secrets.
 *  This also means "resend the same link" is architecturally impossible; every
 *  resend/reminder regenerates the token and invalidates the old one. */
export function generateRawToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
