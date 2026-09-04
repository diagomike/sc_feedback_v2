import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createTestPrisma, requireTestDatabaseUrl, seedE2eBase } from "../support/test-db";
import { ensureTestDatabase } from "./ensure-test-db";

export async function prepareTestDatabase() {
  const databaseUrl = requireTestDatabaseUrl();
  await ensureTestDatabase();
  execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });

  const prisma = createTestPrisma();
  try {
    await seedE2eBase(prisma);
  } finally {
    await prisma.$disconnect();
  }
  console.log("E2E database migrated and seeded");
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("prepare-test-db.ts")) {
  prepareTestDatabase().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
