import type { PrismaClient } from "@prisma/client";
import type { RoleKind } from "@prisma/client";

export class UserExistsError extends Error {}

/**
 * Creates an account WITHOUT issuing an invitation or sending anything.
 *
 * Deliberately kept free of `server-only` and of the `@/` path alias so the same function
 * runs both inside Next (via invitation.ts, which re-exports it) and under `tsx` in the
 * real-data loader — the seeder and the live importer must create people the same way, not
 * two ways that can drift.
 *
 * Bulk roster loads use this rather than inviteNewUser because a 1,100-student import must
 * not fire 1,100 registration emails, and does not need to: a respondent reaches their form
 * through the per-task token a campaign launch mails them, registered or not. When someone
 * does need a login, resendInvitation() issues and sends the link on demand — it works fine
 * against an account that never had an invitation row.
 */
export async function createUninvitedUser(
  db: Pick<PrismaClient, "user">,
  params: { name: string; email: string; role: RoleKind },
): Promise<{ userId: string }> {
  const emailLower = params.email.toLowerCase();
  const existing = await db.user.findUnique({ where: { emailLower } });
  if (existing) throw new UserExistsError(`${params.email} is already in the system`);

  const user = await db.user.create({
    data: {
      email: params.email,
      emailLower,
      name: params.name,
      status: "INVITED",
      roles: { create: [{ kind: params.role }] },
    },
  });
  return { userId: user.id };
}
