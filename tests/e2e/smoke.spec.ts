import { expect, test } from "@playwright/test";
import {
  expectNoSeriousA11yViolations,
  login,
  watchUnexpectedBrowserErrors,
} from "./helpers";

test("login, hierarchy, navigation and direct-route protection", async ({ page }) => {
  const errors = watchUnexpectedBrowserErrors(page);
  await page.goto("/login");
  await expect(page.getByText("Sign in", { exact: true }).first()).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await login(page, "admin@astu.edu.et");
  await expect(page).toHaveURL(/\/manage\/structure/);
  await expect(page.getByText("Computer Science & Engineering", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Software Engineering", { exact: true }).first()).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await page.goto("/manage/campaigns");
  await expect(page.getByText(/not allowed|access|permission/i).first()).toBeVisible();
  expect(errors).toEqual([]);
});
