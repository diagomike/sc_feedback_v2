import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { loadTestEnv } from "./tests/support/test-db";

loadTestEnv();
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required. It must name an isolated database ending in _test.");
}

const outbox = process.env.E2E_MAIL_OUTBOX ?? resolve("test-results/e2e-mail.ndjson");
process.env.E2E_MAIL_OUTBOX = outbox;
process.env.E2E_TEST_MODE = "1";
process.env.DATABASE_URL = testDatabaseUrl;

const production = process.env.E2E_USE_PRODUCTION_BUILD === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results/artifacts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:4300",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: process.env.E2E_EXTERNAL_SERVER === "1" ? undefined : {
    command: production
      ? "node node_modules/next/dist/bin/next start -p 4300"
      : "node node_modules/next/dist/bin/next dev -p 4300",
    url: "http://127.0.0.1:4300/login",
    reuseExistingServer: false,
    timeout: 180_000,
    gracefulShutdown: { signal: "SIGINT", timeout: 1_000 },
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      E2E_TEST_MODE: "1",
      E2E_MAIL_OUTBOX: outbox,
      WEB_ORIGIN: "http://127.0.0.1:4300",
    },
  },
  projects: [
    {
      name: "smoke-chromium",
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "full-chromium",
      testMatch: /full-flow\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "full-firefox",
      testMatch: /browser-matrix\.spec\.ts/,
      dependencies: ["full-chromium"],
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "full-webkit",
      testMatch: /browser-matrix\.spec\.ts/,
      dependencies: ["full-chromium"],
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "full-mobile-chromium",
      testMatch: /browser-matrix\.spec\.ts/,
      dependencies: ["full-chromium"],
      use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "full-mobile-webkit",
      testMatch: /browser-matrix\.spec\.ts/,
      dependencies: ["full-chromium"],
      use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } },
    },
  ],
});
