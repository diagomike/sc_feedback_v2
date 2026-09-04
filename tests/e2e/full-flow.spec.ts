import { expect, test, type Browser, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import JSZip from "jszip";
import { createTestPrisma, EXPIRED_SWE_INVITATION_TOKEN } from "../support/test-db";
import { registryManifest, registryRoot, type RegistryManifestDepartment } from "../support/registry-fixtures";
import {
  capturedMessages,
  expectNoHorizontalPageOverflow,
  expectNoSeriousA11yViolations,
  login,
  logout,
  newestLink,
  selectEveryRequiredAnswer,
  TEST_PASSWORD,
  watchUnexpectedBrowserErrors,
} from "./helpers";

type DepartmentKey = "cse" | "swe";
type CampaignShape = "STUDENT" | "COMBINED";

const manifest = registryManifest();
const prisma = createTestPrisma();
const campaigns = new Map<DepartmentKey, string>();
const headEmail: Record<DepartmentKey, string> = {
  cse: "meron.assefa@astu.edu.et",
  swe: "dawit.haile@astu.edu.et",
};

function dateInput(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Addis_Ababa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function campaignIdFromUrl(page: Page): string {
  const id = new URL(page.url()).pathname.match(/\/manage\/campaigns\/([^/]+)/)?.[1];
  if (!id || id === "new") throw new Error(`No campaign id in ${page.url()}`);
  return id;
}

async function registerLink(browser: Browser, link: string) {
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:4300" });
  const page = await context.newPage();
  const errors = watchUnexpectedBrowserErrors(page);
  await page.goto(link);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByLabel("Confirm password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Complete registration" }).click();
  await expect(page).toHaveURL(/\/(manage|respond|me)\//);
  return { context, page, errors };
}

async function importCsv(
  page: Page,
  tab: string,
  file: string,
  expectedRows: number,
  commit = true,
) {
  await page.getByRole("button", { name: tab, exact: true }).click();
  await page.getByLabel("CSV file").setInputFiles(file);
  await expect(page.getByPlaceholder("Paste CSV content here, or choose a file above")).not.toHaveValue("");
  await page.getByRole("button", { name: "Dry run" }).click();
  if (expectedRows > 200) {
    await expect(page.getByText(`Showing the first 200 of ${expectedRows} rows — the counts above cover all of them.`)).toBeVisible();
  }
  await expect(page.getByText("error", { exact: true }).last().locator("xpath=..")).toContainText("0");
  const commitButton = page.getByRole("button", { name: /^Commit \d+ row\(s\)$/ });
  if (commit) {
    await expect(commitButton).toBeVisible();
    await commitButton.click();
    await expect(page.getByText(/^Committed —/)).toBeVisible({ timeout: 180_000 });
  } else {
    await expect(commitButton).toHaveCount(0);
  }
}

async function importDepartment(page: Page, key: DepartmentKey) {
  const fixture = manifest.departments[key];
  const root = join(registryRoot(), key);
  await page.goto("/manage/import");
  await expectNoSeriousA11yViolations(page);
  await importCsv(page, "1 · Staff", join(root, "staff.csv"), fixture.staffRows);
  await importCsv(page, "2 · Students & sections", join(root, "students.csv"), fixture.studentRows);
  await importCsv(page, "3 · Course offerings", join(root, "offerings.csv"), fixture.offeringRows);
  await importCsv(page, "4 · Enrolments", join(root, "enrollments.csv"), fixture.enrollmentRows);

  const stable = {
    users: await prisma.user.count(),
    groups: await prisma.studentGroup.count(),
    offerings: await prisma.courseOffering.count(),
    enrollments: await prisma.courseEnrollment.count(),
  };
  await importCsv(page, "1 · Staff", join(root, "staff.csv"), fixture.staffRows);
  await importCsv(page, "2 · Students & sections", join(root, "students.csv"), fixture.studentRows);
  await importCsv(page, "3 · Course offerings", join(root, "offerings.csv"), fixture.offeringRows);
  await importCsv(page, "4 · Enrolments", join(root, "enrollments.csv"), fixture.enrollmentRows, false);
  expect({
    users: await prisma.user.count(),
    groups: await prisma.studentGroup.count(),
    offerings: await prisma.courseOffering.count(),
    enrollments: await prisma.courseEnrollment.count(),
  }).toEqual(stable);

  await page.goto("/manage/offerings");
  const head = await prisma.user.findUniqueOrThrow({ where: { emailLower: headEmail[key] } });
  const node = await prisma.hierarchyNode.findUniqueOrThrow({ where: { userId: head.id } });
  const teacherIds = (await prisma.membership.findMany({ where: { nodeId: node.id, kind: "TEACHER" } })).map((row) => row.userId);
  const activeSemester = await prisma.semester.findFirstOrThrow({ where: { active: true }, orderBy: { startsAt: "desc" } });
  const authorizedOfferings = await prisma.courseOffering.count({ where: { semesterId: activeSemester.id, teacherId: { in: teacherIds } } });
  await expect(page.getByText(new RegExp(`${authorizedOfferings}.*offering`, "i")).first()).toBeVisible();
}

async function createCampaign(
  page: Page,
  key: DepartmentKey,
  shape: CampaignShape,
  fixture: RegistryManifestDepartment,
  semesterId?: string,
) {
  const name = `E2E ${key.toUpperCase()} ${shape === "COMBINED" ? "Combined teaching feedback" : "Student evaluation"}`;
  await page.goto("/manage/campaigns/new");
  await page.getByLabel("Campaign name").fill(name);
  if (semesterId) await page.getByLabel("Campaign semester").selectOption(semesterId);
  await page.getByRole("button", { name: "Create draft" }).click();
  await page.waitForURL((url) => {
    const match = url.pathname.match(/^\/manage\/campaigns\/([^/]+)$/);
    return Boolean(match && match[1] !== "new");
  });
  const id = campaignIdFromUrl(page);

  await page.getByLabel("Opens").fill(dateInput(0));
  await page.getByLabel("Closes").fill(dateInput(30));
  await page.getByLabel("Minimum responses").fill("5");
  await page.getByLabel("Minimum teachers").fill("1");
  await page.getByLabel("Minimum students").fill("5");
  if (shape === "STUDENT") {
    await page.getByLabel("Peer template").selectOption("");
    await page.getByLabel("Manager template").selectOption("");
  }

  await page.getByRole("button", { name: /^Select all \d+ offerings$/ }).click();
  if (shape === "COMBINED") {
    const row = page.locator('[data-testid^="campaign-teacher-"]').filter({ hasText: fixture.anchor.teacherName });
    await expect(row).toHaveCount(1);
    for (const email of fixture.anchor.peerEmails) {
      const peer = await prisma.user.findUniqueOrThrow({ where: { emailLower: email } });
      await row.getByRole("checkbox", { name: peer.name, exact: true }).check();
    }
    await row.getByRole("checkbox", { name: "Include department head" }).check();
  }

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible({ timeout: 120_000 });
  await page.reload();
  await expect(page.getByLabel("Campaign name")).toHaveValue(name);
  await expect(page.getByLabel("Minimum responses")).toHaveValue("5");

  const messageCount = capturedMessages().length;
  await page.getByRole("button", { name: "Launch", exact: true }).click({ timeout: 600_000 });
  await expect(page).toHaveURL(new RegExp(`/manage/campaigns/${id}/monitor$`), { timeout: 600_000 });
  await expectNoSeriousA11yViolations(page);

  const taskCount = await prisma.responseTask.count({ where: { campaignId: id } });
  const assignments = await prisma.campaignAssignment.findMany({
    where: { campaignId: id, targetGroup: "STUDENT" },
    select: { courseOfferingId: true },
  });
  const offeringIds = assignments.flatMap((assignment) => assignment.courseOfferingId ? [assignment.courseOfferingId] : []);
  const expectedStudents = await prisma.courseEnrollment.count({ where: { offeringId: { in: offeringIds } } });
  expect(taskCount).toBe(expectedStudents + (shape === "COMBINED" ? 6 : 0));
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id } });
  const campaignNode = await prisma.hierarchyNode.findUniqueOrThrow({ where: { id: campaign.nodeId } });
  const departmentTeacherIds = (await prisma.membership.findMany({ where: { nodeId: campaignNode.id, kind: "TEACHER" } })).map((row) => row.userId);
  const authorizedOfferingCount = await prisma.courseOffering.count({
    where: { semesterId: campaign.semesterId, teacherId: { in: departmentTeacherIds } },
  });
  expect(offeringIds).toHaveLength(authorizedOfferingCount);
  expect(capturedMessages().length - messageCount).toBe(taskCount);
  return id;
}

async function submitForm(page: Page, score: "minimum" | "maximum", comment: string, notApplicable = false) {
  const form = page.locator("body");
  const submit = page.getByRole("button", { name: "Submit feedback" });
  await expect(submit).toBeDisabled();
  await selectEveryRequiredAnswer(form, score);
  for (const textarea of await page.locator("textarea").all()) await textarea.fill(comment);
  if (notApplicable) {
    const option = page.getByRole("radio", { name: /not applicable$/i }).first();
    await expect(option).toBeVisible();
    await option.check();
  }
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText("Thank you — your feedback is recorded", { exact: true })).toBeVisible();
}

async function resendPerson(page: Page, email: string) {
  await page.goto("/manage/people");
  const row = page.getByRole("row").filter({ hasText: email });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "Resend" }).click();
  await expect.poll(() => capturedMessages().filter((message) => message.to === email && message.html.includes("/register/")).length).toBeGreaterThan(0);
  return newestLink(email, "register");
}

async function completeResponses(page: Page, browser: Browser, key: DepartmentKey, campaignId: string) {
  const fixture = manifest.departments[key];
  const score = key === "cse" ? "maximum" : "minimum";
  const prefix = key.toUpperCase();

  await page.goto(`/manage/campaigns/${campaignId}/monitor`);
  const oldLink = newestLink(fixture.anchor.studentEmails[1], "respond", fixture.anchor.courseCode);
  const anchorRow = page.getByRole("row").filter({ hasText: fixture.anchor.teacherName });
  await anchorRow.getByRole("button", { name: "Remind" }).click();
  await expect(page.getByText(/^Sent \d+ reminder\(s\)\.$/)).toBeVisible({ timeout: 180_000 });
  await page.goto(oldLink);
  await expect(page.getByText("This link is invalid or expired", { exact: true })).toBeVisible();
  const replacement = newestLink(fixture.anchor.studentEmails[1], "respond", fixture.anchor.courseCode);
  expect(replacement).not.toBe(oldLink);
  await page.goto(replacement);
  await expect(page.getByText(fixture.anchor.teacherName, { exact: true })).toBeVisible();

  const studentRegistration = await resendPerson(page, fixture.anchor.studentEmails[0]);
  const student = await registerLink(browser, studentRegistration);
  await student.page.goto("/respond/tasks");
  const signedStudentTask = student.page.getByRole("link").filter({ hasText: fixture.anchor.teacherName }).filter({ hasText: fixture.anchor.courseCode }).first();
  await Promise.all([
    student.page.waitForURL(/\/respond\/task\/[^/]+$/),
    signedStudentTask.click(),
  ]);
  const signedTaskUrl = student.page.url();
  await submitForm(student.page, score, `${prefix} automated student comment`, key === "cse");
  await student.page.goto(signedTaskUrl);
  await expect(student.page.getByText("You have already responded", { exact: true })).toBeVisible();

  const studentUser = await prisma.user.findUniqueOrThrow({ where: { emailLower: fixture.anchor.studentEmails[0] } });
  const someoneElsesTask = await prisma.responseTask.findFirstOrThrow({ where: { respondentId: { not: studentUser.id } } });
  await student.page.goto(`/respond/task/${someoneElsesTask.id}`);
  await expect(student.page.getByText("This link is invalid or expired", { exact: true })).toBeVisible();
  await student.page.goto("/respond/task/unknown-task-id");
  await expect(student.page.getByText("This link is invalid or expired", { exact: true })).toBeVisible();
  expect(student.errors).toEqual([]);
  await student.context.close();

  await page.goto(`/manage/campaigns/${campaignId}/monitor`);
  let monitorRow = page.getByRole("row").filter({ hasText: fixture.anchor.teacherName });
  await expect(monitorRow).toContainText(/1\/\d+/);
  for (let index = 1; index < 5; index++) {
    const link = newestLink(fixture.anchor.studentEmails[index], "respond", fixture.anchor.courseCode);
    await page.goto(link);
    if (index === 1) await expectNoSeriousA11yViolations(page);
    await submitForm(page, score, `${prefix} automated student comment`);
    await page.goto(`/manage/campaigns/${campaignId}/monitor`);
    monitorRow = page.getByRole("row").filter({ hasText: fixture.anchor.teacherName });
    await expect(monitorRow).toContainText(new RegExp(`${index + 1}/\\d+`));
  }

  const peerRegistration = newestLink(fixture.anchor.peerEmails[0], "register");
  const peer = await registerLink(browser, peerRegistration);
  await peer.page.goto("/respond/tasks");
  const signedPeerTask = peer.page.getByRole("link").filter({ hasText: fixture.anchor.teacherName }).filter({ hasText: `E2E ${prefix} Combined teaching feedback` }).first();
  await Promise.all([peer.page.waitForURL(/\/respond\/task\/[^/]+$/), signedPeerTask.click()]);
  await submitForm(peer.page, score, `${prefix} automated peer comment`);
  expect(peer.errors).toEqual([]);
  await peer.context.close();
  for (let index = 1; index < 5; index++) {
    await page.goto(newestLink(fixture.anchor.peerEmails[index], "respond", fixture.anchor.teacherName));
    await submitForm(page, score, `${prefix} automated peer comment`);
    await page.goto(`/manage/campaigns/${campaignId}/monitor`);
    monitorRow = page.getByRole("row").filter({ hasText: fixture.anchor.teacherName });
    await expect(monitorRow).toContainText(`${index + 1}/5`);
  }

  await page.goto("/respond/tasks");
  const headTask = page.getByRole("link").filter({ hasText: fixture.anchor.teacherName }).filter({ hasText: `E2E ${prefix} Combined teaching feedback` });
  await Promise.all([page.waitForURL(/\/respond\/task\/[^/]+$/), headTask.click()]);
  await submitForm(page, score, `${prefix} automated head comment`);
  await page.goto(`/manage/campaigns/${campaignId}/monitor`);
  monitorRow = page.getByRole("row").filter({ hasText: fixture.anchor.teacherName });
  await expect(monitorRow).toContainText("done");

  const completedToken = newestLink(fixture.anchor.studentEmails[1], "respond", fixture.anchor.courseCode);
  await page.goto(completedToken);
  await expect(page.getByText("You have already responded", { exact: true })).toBeVisible();
  expect(await prisma.response.count({
    where: {
      campaignId,
      respondentKind: "STUDENT",
      teacherId: (await prisma.user.findUniqueOrThrow({ where: { emailLower: fixture.anchor.teacherEmail } })).id,
    },
  })).toBe(5);
}

async function closeCampaign(page: Page, campaignId: string) {
  await page.goto("/manage/campaigns");
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const row = page.getByRole("row").filter({ hasText: campaign.name });
  await row.getByRole("button", { name: "Close early" }).click();
  await expect.poll(async () => (await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } })).status).toBe("CLOSED");
  await page.reload();
}

async function verifyDepartmentResults(page: Page, key: DepartmentKey, campaignId: string) {
  const fixture = manifest.departments[key];
  const teacher = await prisma.user.findUniqueOrThrow({ where: { emailLower: fixture.anchor.teacherEmail } });
  const expected = key === "cse" ? "100.0" : "0.0";
  for (const audience of ["STUDENT", "PEER", "MANAGER"] as const) {
    await page.goto(`/analyse/results?campaignId=${campaignId}&teacherId=${teacher.id}&targetGroup=${audience}`);
    await expect(page.getByText("Composite", { exact: true }).locator("xpath=..")).toContainText(expected);
    await expect(page.getByText(`${key.toUpperCase()} automated ${audience === "STUDENT" ? "student" : audience === "PEER" ? "peer" : "head"} comment`, { exact: true }).first()).toBeVisible();
  }
  await page.goto(`/analyse/results?campaignId=${campaignId}&teacherId=${teacher.id}&targetGroup=STUDENT`);
  const courseRow = page.getByRole("row").filter({ hasText: fixture.anchor.courseCode }).filter({ hasText: "5/" });
  await expect(courseRow).toHaveCount(1);
  await expect(courseRow).toContainText("5/");
  await expect(courseRow).toContainText(expected);

  await page.goto("/manage/letters");
  await page.getByLabel("Student campaign").selectOption(campaignId);
  await page.getByLabel("Peer campaign").selectOption(campaignId);
  await page.getByLabel("Head campaign").selectOption(campaignId);
  await page.getByLabel("Round label").fill("E2E semester");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("1 ready", { exact: true })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: fixture.anchor.teacherName })).toContainText("ready");

  const downloadDir = resolve("test-results/downloads", key);
  mkdirSync(downloadDir, { recursive: true });
  const [word] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download Word" }).click(),
  ]);
  const docxPath = join(downloadDir, "evaluation-letters.docx");
  await word.saveAs(docxPath);
  const docx = readFileSync(docxPath);
  expect(docx.subarray(0, 2).toString()).toBe("PK");
  const zip = await JSZip.loadAsync(docx);
  const documentXml = await zip.file("word/document.xml")!.async("string");
  const docxText = documentXml
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/\s+/g, " ");
  expect(docxText).toContain(fixture.anchor.teacherName);
  expect(docxText).toContain(fixture.name);
  expect(docxText).toContain("E2E semester");

  const [pdf] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download PDF" }).click(),
  ]);
  const pdfPath = join(downloadDir, "evaluation-letters.pdf");
  await pdf.saveAs(pdfPath);
  const pdfBuffer = readFileSync(pdfPath);
  expect(pdfBuffer.length).toBeGreaterThan(1_000);
  expect(pdfBuffer.subarray(0, 5).toString()).toBe("%PDF-");
}

test("full CSE/SWE workflow from onboarding and CSV import through AVP review", async ({ page, browser }) => {
  test.setTimeout(2_400_000);
  const startedAt = Date.now();
  const errors = watchUnexpectedBrowserErrors(page);

  await page.goto(`/register/${EXPIRED_SWE_INVITATION_TOKEN}`);
  await expect(page.getByText("This invitation has expired", { exact: true })).toBeVisible();
  await login(page, "admin@astu.edu.et");
  await expect(page.getByText("Computer Science & Engineering", { exact: true }).first()).toBeVisible();
  const sweNodeButton = page.getByRole("button").filter({ hasText: "Software Engineering" }).last();
  await sweNodeButton.click();
  await page.getByRole("button", { name: "Resend invitation" }).click();
  await expect.poll(() => capturedMessages().filter((message) => message.to === headEmail.swe).length).toBe(1);
  const sweRegistration = newestLink(headEmail.swe, "register");
  const sweHeadRegistration = await registerLink(browser, sweRegistration);
  await expect(sweHeadRegistration.page).toHaveURL(/\/manage\/campaigns/);
  expect(sweHeadRegistration.errors).toEqual([]);
  await sweHeadRegistration.context.close();
  await page.goto(`/register/${EXPIRED_SWE_INVITATION_TOKEN}`);
  await expect(page.getByText(/expired|invalid|already been used/i).first()).toBeVisible();
  await page.goto("/manage/campaigns");
  await expect(page.getByText("You don't have access to this screen", { exact: true })).toBeVisible();
  await logout(page);

  for (const key of ["cse", "swe"] as const) {
    await login(page, headEmail[key]);
    await importDepartment(page, key);
    if (key === "cse") {
      await page.goto("/manage/people");
      await expect(page.getByText(manifest.departments.swe.anchor.studentEmails[0], { exact: true })).toHaveCount(0);
    }
    await logout(page);
  }

  const semester = await prisma.semester.findFirstOrThrow();
  expect(await prisma.courseEnrollment.count()).toBe(
    manifest.departments.cse.enrollmentRows + manifest.departments.swe.enrollmentRows,
  );
  expect(await prisma.studentGroup.count()).toBe(
    manifest.departments.cse.sectionRows + manifest.departments.swe.sectionRows,
  );

  for (const key of ["cse", "swe"] as const) {
    await login(page, headEmail[key]);
    const fixture = manifest.departments[key];
    campaigns.set(key, await createCampaign(page, key, "COMBINED", fixture));
    await logout(page);
  }

  await login(page, headEmail.cse);
  await page.goto(`/manage/campaigns/${campaigns.get("swe")!}`);
  await expect(page.getByText("Campaign not found", { exact: true })).toBeVisible();
  await logout(page);

  for (const key of ["cse", "swe"] as const) {
    await login(page, headEmail[key]);
    await completeResponses(page, browser, key, campaigns.get(key)!);
    const incomplete = await prisma.responseTask.findFirstOrThrow({
      where: { campaignId: campaigns.get(key)!, completedAt: null },
      include: {
        respondent: { select: { email: true } },
        teacher: { select: { name: true } },
        offering: { include: { course: { select: { code: true } } } },
      },
    });
    await closeCampaign(page, campaigns.get(key)!);
    const closedLink = newestLink(
      incomplete.respondent.email,
      "respond",
      incomplete.offering?.course.code ?? incomplete.teacher.name,
    );
    await page.goto(closedLink);
    await selectEveryRequiredAnswer(page.locator("body"), "maximum");
    for (const textarea of await page.locator("textarea").all()) await textarea.fill("Closed campaign check");
    await page.getByRole("button", { name: "Submit feedback" }).click();
    await expect(page.getByText("This campaign has closed", { exact: true })).toBeVisible();
    await verifyDepartmentResults(page, key, campaigns.get(key)!);
    await logout(page);
  }

  for (const key of ["cse", "swe"] as const) {
    const fixture = manifest.departments[key];
    const anchorRegistration = newestLink(fixture.anchor.teacherEmail, "register");
    const anchor = await registerLink(browser, anchorRegistration);
    await anchor.page.goto("/me/feedback");
    await expect(anchor.page.getByText(key === "cse" ? "100.0" : "0.0", { exact: true }).first()).toBeVisible();
    await anchor.page.goto("/analyse/overview");
    await expect(anchor.page.getByText("You don't have access to this screen", { exact: true })).toBeVisible();
    expect(anchor.errors).toEqual([]);
    await anchor.context.close();
  }

  await login(page, "miftah.shifera@astu.edu.et");
  const avpActual = { cse: Number.NaN, swe: Number.NaN, scope: Number.NaN };
  for (const [audience, count] of [["STUDENT", 10], ["PEER", 10], ["MANAGER", 2]] as const) {
    await page.goto(`/analyse/overview?targetGroup=${audience}&semesterId=${semester.id}`);
    await expect(page.getByText("Scope composite", { exact: true }).locator("xpath=..")).toContainText("50.0");
    await expect(page.getByText("Responses", { exact: true }).first().locator("xpath=..")).toContainText(String(count));
    const cseRow = page.getByRole("row").filter({ hasText: manifest.departments.cse.name });
    const sweRow = page.getByRole("row").filter({ hasText: manifest.departments.swe.name });
    await expect(cseRow).toContainText("100.0");
    await expect(sweRow).toContainText("0.0");
    await expect(page.getByRole("row").filter({ hasText: "Quality Assurance Directorate" })).toHaveCount(0);
    if (audience === "STUDENT") {
      const scopeText = await page.getByText("Scope composite", { exact: true }).locator("xpath=..").innerText();
      avpActual.scope = Number(scopeText.match(/-?\d+(?:\.\d+)?/)?.[0]);
      avpActual.cse = Number(await cseRow.getByRole("cell").nth(3).innerText());
      avpActual.swe = Number(await sweRow.getByRole("cell").nth(3).innerText());
    }
  }
  await expectNoSeriousA11yViolations(page);
  await logout(page);

  const cseHead = await prisma.user.findUniqueOrThrow({ where: { emailLower: headEmail.cse } });
  const cseNode = await prisma.hierarchyNode.findUniqueOrThrow({ where: { userId: cseHead.id } });
  const anchorOffering = await prisma.courseOffering.findUniqueOrThrow({
    where: { externalId: manifest.departments.cse.anchor.offeringExternalId },
    include: { enrollments: { take: 5, orderBy: { userId: "asc" } } },
  });
  const matrixSemester = await prisma.semester.create({
    data: {
      academicYear: semester.academicYear + 10,
      term: semester.term,
      startsAt: new Date(`${dateInput(0)}T00:00:00+03:00`),
      endsAt: new Date(`${dateInput(30)}T23:59:00+03:00`),
    },
  });
  await prisma.courseOffering.create({
    data: {
      externalId: "E2E-MATRIX-OFFERING",
      semesterId: matrixSemester.id,
      courseId: anchorOffering.courseId,
      teacherId: anchorOffering.teacherId,
      studentGroupId: anchorOffering.studentGroupId,
      enrollments: { create: anchorOffering.enrollments.map((enrollment) => ({ userId: enrollment.userId })) },
    },
  });
  await login(page, headEmail.cse);
  const matrixCampaign = await createCampaign(page, "cse", "STUDENT", manifest.departments.cse, matrixSemester.id);
  await logout(page);

  const matrixRecipients = await prisma.responseTask.findMany({
    where: { campaignId: matrixCampaign },
    include: { respondent: { select: { email: true } } },
    orderBy: { respondent: { email: "asc" } },
  });
  expect(matrixRecipients).toHaveLength(5);
  const taskHashes = await prisma.responseTask.findMany({ select: { tokenHash: true } });
  expect(taskHashes.every(({ tokenHash }) => /^[0-9a-f]{64}$/.test(tokenHash))).toBe(true);
  expect(capturedMessages().some((message) => message.html.includes(taskHashes[0].tokenHash))).toBe(false);

  const report = {
    environment: { database: new URL(process.env.TEST_DATABASE_URL!).pathname.slice(1), browser: "Chromium" },
    browsers: ["Chromium"],
    imported: manifest.departments,
    campaignIds: Object.fromEntries(campaigns),
    taskCount: await prisma.responseTask.count({ where: { campaignId: { in: [...campaigns.values()] } } }),
    messageCount: capturedMessages().length,
    responseTotals: { student: 10, peer: 10, manager: 2 },
    avp: { expected: { cse: 100, swe: 0, scope: 50 }, actual: avpActual },
    matrix: { campaignId: matrixCampaign, semesterId: semester.id, recipients: matrixRecipients.map((task) => task.respondent.email) },
    durationMs: Date.now() - startedAt,
  };
  mkdirSync(resolve("test-results"), { recursive: true });
  writeFileSync(resolve("test-results/e2e-verification.json"), JSON.stringify(report, null, 2));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(newestLink(matrixRecipients[0].respondent.email, "respond", manifest.departments.cse.anchor.courseCode));
  await expectNoHorizontalPageOverflow(page);
  await expectNoSeriousA11yViolations(page);
  expect(cseNode.type).toBe("DEPARTMENT");
  expect(errors).toEqual([]);
});

test.afterAll(async () => {
  await prisma.$disconnect();
});
