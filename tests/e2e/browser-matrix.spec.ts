import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { registryManifest } from "../support/registry-fixtures";
import {
  expectNoHorizontalPageOverflow,
  expectNoSeriousA11yViolations,
  login,
  newestLink,
  selectEveryRequiredAnswer,
  watchUnexpectedBrowserErrors,
} from "./helpers";

interface VerificationState {
  matrix: { semesterId: string; recipients: string[] };
  browsers?: string[];
}

const recipientIndex: Record<string, number> = {
  "full-firefox": 0,
  "full-webkit": 1,
  "full-mobile-chromium": 2,
  "full-mobile-webkit": 3,
};
const cseAnchor = registryManifest().departments.cse.anchor;

test("respondent form and AVP analytics remain correct across the release browser matrix", async ({ page }, testInfo) => {
  const errors = watchUnexpectedBrowserErrors(page);
  const state = JSON.parse(readFileSync(resolve("test-results/e2e-verification.json"), "utf8")) as VerificationState;
  const email = state.matrix.recipients[recipientIndex[testInfo.project.name]];
  expect(email).toBeTruthy();

  await page.goto(newestLink(email, "respond", cseAnchor.courseCode));
  await expect(page.getByText(cseAnchor.teacherName, { exact: true })).toBeVisible();
  await expectNoHorizontalPageOverflow(page);
  await expectNoSeriousA11yViolations(page);

  await page.keyboard.press("Tab");
  const hasFocus = await page.evaluate(() => document.activeElement != null && document.activeElement !== document.body);
  expect(hasFocus).toBe(true);
  await selectEveryRequiredAnswer(page.locator("body"), "maximum");
  for (const textarea of await page.locator("textarea").all()) {
    await textarea.fill(`Cross-browser response from ${testInfo.project.name}`);
  }
  await page.getByRole("button", { name: "Submit feedback" }).click();
  await expect(page.getByText("Thank you — your feedback is recorded", { exact: true })).toBeVisible();

  await login(page, "miftah.shifera@astu.edu.et");
  await page.goto(`/analyse/overview?targetGroup=STUDENT&semesterId=${state.matrix.semesterId}`);
  await expect(page.getByText("Scope composite", { exact: true }).locator("xpath=..")).toContainText("50.0");
  await expect(page.getByRole("row").filter({ hasText: "Computer Science & Engineering" })).toContainText("100.0");
  await expect(page.getByRole("row").filter({ hasText: "Software Engineering" })).toContainText("0.0");
  await expectNoHorizontalPageOverflow(page);
  await expectNoSeriousA11yViolations(page);
  expect(errors).toEqual([]);

  state.browsers = [...new Set([...(state.browsers ?? []), testInfo.project.name])];
  writeFileSync(resolve("test-results/e2e-verification.json"), JSON.stringify(state, null, 2));
});
