import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

export const TEST_PASSWORD = "astu1234";

export interface CapturedMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  createdAt: string;
}

export function capturedMessages(): CapturedMessage[] {
  const path = process.env.E2E_MAIL_OUTBOX;
  if (!path) throw new Error("E2E_MAIL_OUTBOX is not configured");
  try {
    return readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CapturedMessage);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export function newestLink(to: string, kind: "register" | "respond", subjectIncludes?: string): string {
  const marker = `/${kind}/`;
  const message = [...capturedMessages()].reverse().find(
    (candidate) =>
      candidate.to.toLowerCase() === to.toLowerCase() &&
      (!subjectIncludes || candidate.subject.includes(subjectIncludes)) &&
      candidate.html.includes(marker),
  );
  if (!message) throw new Error(`No captured ${kind} message for ${to}`);
  const escaped = marker.replace("/", "\\/");
  const link = message.html.match(new RegExp(`href=["']([^"']+${escaped}[^"'/]+)["']`))?.[1];
  if (!link) throw new Error(`Captured message for ${to} has no ${kind} link`);
  return link.replace("http://localhost:4300", "http://127.0.0.1:4300");
}

export async function login(page: Page, email: string, password = TEST_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

export async function logout(page: Page) {
  const button = page.getByRole("button", { name: "Sign out" });
  await button.click();
  await expect(page).toHaveURL(/\/login$/);
}

export function watchUnexpectedBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

export async function expectNoSeriousA11yViolations(page: Page, include?: string) {
  let scan = new AxeBuilder({ page });
  if (include) scan = scan.include(include);
  const result = await scan.analyze();
  const blocking = result.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical",
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

export async function expectNoHorizontalPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

export async function selectEveryRequiredAnswer(form: Locator, score: "minimum" | "maximum") {
  const inputs = form.locator('input[type="radio"]:not([aria-label$="not applicable"]):visible');
  const names = await inputs.evaluateAll((nodes) => [...new Set(nodes.map((node) => (node as HTMLInputElement).name))]);
  for (const name of names) {
    const escaped = name.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
    const group = form.locator(`input[type="radio"][name="${escaped}"]:not([aria-label$="not applicable"]):visible`);
    const count = await group.count();
    if (count > 0) await group.nth(score === "maximum" ? count - 1 : 0).check();
  }

  const mobileButtons = form.locator('button[aria-label][aria-pressed]:not([aria-label$="not applicable"])');
  if ((await mobileButtons.count()) > 0 && (await mobileButtons.first().isVisible())) {
    const labels = await mobileButtons.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("aria-label") ?? ""),
    );
    const statements = [...new Set(labels.map((label) => label.slice(0, label.lastIndexOf(":"))))];
    for (const statement of statements) {
      const candidates = labels.filter((label) => label.startsWith(`${statement}:`));
      const selected = candidates[score === "maximum" ? candidates.length - 1 : 0];
      if (selected) await form.getByRole("button", { name: selected, exact: true }).click();
    }
  }
}
