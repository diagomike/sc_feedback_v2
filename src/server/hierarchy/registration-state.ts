/**
 * Pure derivation of "registered / invited / expired" plus the human-readable detail
 * string ("sent 04 Sep · 6d left") — no Prisma dependency, so it's directly
 * unit-testable. Ported from v1's auth/registration-state.ts.
 */

export type RegistrationStatus = "registered" | "invited" | "expired";

export interface RegistrationStateResult {
  status: RegistrationStatus;
  detail: string | null;
}

export function registrationState(
  input: {
    userStatus: "INVITED" | "ACTIVE" | "DISABLED";
    invitation: { createdAt: Date; expiresAt: Date } | null;
  },
  now: Date = new Date(),
): RegistrationStateResult {
  if (input.userStatus === "ACTIVE") {
    return { status: "registered", detail: null };
  }

  if (!input.invitation) {
    return { status: "expired", detail: "no invitation on record" };
  }

  const sent = shortDate(input.invitation.createdAt);
  if (input.invitation.expiresAt.getTime() <= now.getTime()) {
    return { status: "expired", detail: `sent ${sent} · expired` };
  }

  const daysLeft = Math.max(1, Math.ceil((input.invitation.expiresAt.getTime() - now.getTime()) / 86_400_000));
  return { status: "invited", detail: `sent ${sent} · ${daysLeft}d left` };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]}`;
}
