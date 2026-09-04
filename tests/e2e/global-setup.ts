import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { prepareTestDatabase } from "../scripts/prepare-test-db";

export default async function globalSetup() {
  const outbox = process.env.E2E_MAIL_OUTBOX;
  if (!outbox) throw new Error("E2E_MAIL_OUTBOX is required");
  mkdirSync(dirname(outbox), { recursive: true });
  rmSync(outbox, { force: true });
  await prepareTestDatabase();
}
