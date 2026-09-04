import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { requireTestDatabaseUrl } from "../support/test-db";

const suite = process.argv[2];
if (suite !== "smoke" && suite !== "full" && suite !== "full-chromium") {
  throw new Error("Usage: tsx tests/scripts/run-playwright.ts smoke|full|full-chromium");
}

const databaseUrl = requireTestDatabaseUrl();
const production = process.env.E2E_USE_PRODUCTION_BUILD === "1";
const server = spawn(
  process.execPath,
  [resolve("node_modules/next/dist/bin/next"), production ? "start" : "dev", "-p", "4300"],
  {
    cwd: process.cwd(),
    detached: process.platform !== "win32",
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      E2E_TEST_MODE: "1",
      E2E_MAIL_OUTBOX: process.env.E2E_MAIL_OUTBOX ?? resolve("test-results/e2e-mail.ndjson"),
      WEB_ORIGIN: "http://127.0.0.1:4300",
    },
  },
);

async function waitForServer() {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (server.exitCode != null) throw new Error(`Next.js exited with code ${server.exitCode}`);
    try {
      const response = await fetch("http://127.0.0.1:4300/login");
      if (response.ok) return;
    } catch {
      // The listener is not ready yet.
    }
    await delay(500);
  }
  throw new Error("Timed out waiting for the E2E server");
}

function stopServer() {
  if (!server.pid || server.exitCode != null) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill.exe", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      server.kill();
    }
  } else {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      server.kill("SIGTERM");
    }
  }
}

const projects = suite === "smoke"
  ? ["smoke-chromium"]
  : suite === "full-chromium"
    ? ["full-chromium"]
    : ["full-chromium", "full-firefox", "full-webkit", "full-mobile-chromium", "full-mobile-webkit"];

async function main() {
  try {
    await waitForServer();
    execFileSync(
      process.execPath,
      [resolve("node_modules/@playwright/test/cli.js"), "test", ...projects.flatMap((project) => [`--project=${project}`])],
      {
        cwd: process.cwd(),
        stdio: "inherit",
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          E2E_EXTERNAL_SERVER: "1",
          E2E_TEST_MODE: "1",
          E2E_MAIL_OUTBOX: process.env.E2E_MAIL_OUTBOX ?? resolve("test-results/e2e-mail.ndjson"),
        },
      },
    );
  } finally {
    stopServer();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
