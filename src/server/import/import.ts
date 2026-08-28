import "server-only";
import { prisma } from "@/server/db";
import { ownDepartmentNode } from "@/server/scope";
import { classifyRows, parseCsv, summarizeCounts, type ExistingPerson, type ParsedCsvRow } from "./csv-validation";

async function lookupExisting(rows: ParsedCsvRow[]): Promise<Map<string, ExistingPerson>> {
  const emails = [...new Set(rows.map((r) => r.email.toLowerCase()).filter(Boolean))];
  if (emails.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { emailLower: { in: emails } } });
  return new Map(users.map((u) => [u.emailLower, { id: u.id, name: u.name }]));
}

export async function dryRunImport(requestingUserId: string, csv: string) {
  await ownDepartmentNode(requestingUserId);
  const rows = parseCsv(csv);
  const existing = await lookupExisting(rows);
  const classified = classifyRows(rows, existing);
  return { rows: classified, counts: summarizeCounts(classified) };
}

/** Re-runs the exact same classification as dryRun (never trusts a client-supplied row
 *  list) and writes only the create/update rows. Ported from v1's ImportService. */
export async function commitImport(requestingUserId: string, csv: string) {
  const node = await ownDepartmentNode(requestingUserId);
  const rows = parseCsv(csv);
  const existing = await lookupExisting(rows);
  const classified = classifyRows(rows, existing);

  let created = 0;
  let updated = 0;

  for (const r of classified) {
    if (r.action === "create") {
      const { inviteNewUser } = await import("@/server/auth/invitation");
      const { userId } = await inviteNewUser({ name: r.name, email: r.email, role: r.kind!, managedByNodeId: node.id });
      await prisma.membership.create({ data: { userId, nodeId: node.id, kind: r.kind! } });
      if (r.phone) await prisma.user.update({ where: { id: userId }, data: { phone: r.phone } });
      created++;
    } else if (r.action === "update") {
      const existingPerson = existing.get(r.email.toLowerCase())!;
      await prisma.user.update({ where: { id: existingPerson.id }, data: { name: r.name, phone: r.phone } });
      await prisma.membership.upsert({
        where: { userId_nodeId_kind: { userId: existingPerson.id, nodeId: node.id, kind: r.kind! } },
        create: { userId: existingPerson.id, nodeId: node.id, kind: r.kind! },
        update: {},
      });
      updated++;
    }
  }

  return { created, updated };
}
