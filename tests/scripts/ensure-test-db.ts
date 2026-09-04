import { PrismaClient } from "@prisma/client";
import { requireTestDatabaseUrl } from "../support/test-db";

export async function ensureTestDatabase(): Promise<void> {
  const testUrl = new URL(requireTestDatabaseUrl());
  const database = decodeURIComponent(testUrl.pathname.slice(1));
  if (!/^[A-Za-z0-9_]+_test$/.test(database)) {
    throw new Error(`Refusing to create unsafe test database name '${database}'`);
  }

  const adminUrl = new URL(testUrl);
  adminUrl.pathname = "/postgres";
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
  try {
    const rows = await admin.$queryRawUnsafe<{ datname: string }[]>(
      "SELECT datname FROM pg_database WHERE datname = $1",
      database,
    );
    if (rows.length === 0) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
      process.stdout.write(`Created isolated database ${database}\n`);
    }
  } finally {
    await admin.$disconnect();
  }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("ensure-test-db.ts")) {
  ensureTestDatabase().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
