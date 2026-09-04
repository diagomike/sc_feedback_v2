import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { seedE2eBase } from "../support/test-db";
import { clearOutbox, rawTokenFrom, readOutbox } from "../support/outbox";
import { registryCsv, registryManifest, type RegistryManifestDepartment } from "../support/registry-fixtures";
import { dryRunImport, commitImport } from "@/server/import/import";
import {
  commitEnrollments,
  commitOfferings,
  commitStudents,
  dryRunEnrollments,
  dryRunOfferings,
  dryRunStudents,
} from "@/server/import/registry-import";
import {
  closeCampaign,
  createCampaign,
  getCampaignDetail,
  launchCampaign,
  updateCampaign,
} from "@/server/campaigns/campaigns";
import { getFormByToken, submitByToken } from "@/server/responses/responses";
import { getCourseBreakdown, getDashboard, getScopeRollup } from "@/server/analytics/analytics";
import { previewLetters } from "@/server/letters/letters";

type DepartmentKey = "cse" | "swe";
type TargetGroup = "STUDENT" | "PEER" | "MANAGER";

interface CampaignSet {
  campaign: string;
  headId: string;
  headEmail: string;
  anchorTeacherId: string;
  anchorOfferingId: string;
}

const manifest = registryManifest();
const campaigns = new Map<DepartmentKey, CampaignSet>();

function isoDate(offsetDays: number): string {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

function messageToken(recipient: string, teacherName: string, courseCode?: string): string {
  const message = [...readOutbox()].reverse().find(
    (candidate) =>
      candidate.to.toLowerCase() === recipient.toLowerCase() &&
      candidate.subject.includes(teacherName) &&
      (!courseCode || candidate.subject.includes(courseCode)),
  );
  if (!message) throw new Error(`No response message for ${recipient}, ${teacherName}, ${courseCode ?? "no course"}`);
  const link = message.html.match(/href="([^"]+\/respond\/[^"/]+)"/)?.[1];
  if (!link) throw new Error(`No response link in captured message for ${recipient}`);
  return rawTokenFrom(link);
}

function answersFor(
  form: Awaited<ReturnType<typeof getFormByToken>>,
  score: "maximum" | "minimum",
  comment: string,
  useNotApplicable = false,
) {
  let usedNotApplicable = false;
  return form.sections.flatMap((section) =>
    section.items.map((item) => {
      if (section.type === "FREE_TEXT") return { itemId: item.id, text: comment };
      if (useNotApplicable && section.allowNotApplicable && !usedNotApplicable) {
        usedNotApplicable = true;
        return { itemId: item.id, notApplicable: true };
      }
      const values = section.scale!.map((point) => point.value);
      return { itemId: item.id, pointValue: score === "maximum" ? Math.max(...values) : Math.min(...values) };
    }),
  );
}

async function importDepartment(key: DepartmentKey, headId: string, semesterId: string) {
  const expected = manifest.departments[key];

  const staffCsv = registryCsv(key, "staff");
  const staffPreview = await dryRunImport(headId, staffCsv);
  expect(staffPreview.counts.error).toBe(0);
  expect(staffPreview.counts.create + staffPreview.counts.update).toBe(expected.staffRows);
  const staffCommit = await commitImport(headId, staffCsv);
  expect(staffCommit.created + staffCommit.updated).toBe(expected.staffRows);

  const studentCsv = registryCsv(key, "students");
  const studentPreview = await dryRunStudents(headId, studentCsv);
  expect(studentPreview.counts).toMatchObject({ create: expected.studentRows, error: 0 });
  expect(studentPreview.sections).toHaveLength(expected.sectionRows);
  const studentCommit = await commitStudents(headId, studentCsv);
  expect(studentCommit).toMatchObject({ created: expected.studentRows, sections: expected.sectionRows });

  const offeringCsv = registryCsv(key, "offerings");
  const offeringPreview = await dryRunOfferings(headId, offeringCsv, semesterId);
  expect(offeringPreview.counts.error).toBe(0);
  expect(offeringPreview.counts.create + offeringPreview.counts.skip).toBe(expected.offeringRows);
  const offeringCommit = await commitOfferings(headId, offeringCsv, semesterId);
  expect(offeringCommit.created + offeringCommit.duplicates).toBe(expected.offeringRows);

  const enrollmentCsv = registryCsv(key, "enrollments");
  const enrollmentPreview = await dryRunEnrollments(headId, enrollmentCsv, semesterId);
  expect(enrollmentPreview.counts).toMatchObject({ create: expected.enrollmentRows, error: 0 });
  const enrollmentCommit = await commitEnrollments(headId, enrollmentCsv, semesterId);
  expect(enrollmentCommit).toMatchObject({ created: expected.enrollmentRows, errors: 0 });

  const before = {
    users: await prisma.user.count(),
    groups: await prisma.studentGroup.count(),
    offerings: await prisma.courseOffering.count(),
    enrollments: await prisma.courseEnrollment.count(),
  };

  const staffAgain = await dryRunImport(headId, staffCsv);
  expect(staffAgain.counts.create).toBe(0);
  expect(staffAgain.counts.error).toBe(0);
  await commitImport(headId, staffCsv);

  const studentsAgain = await dryRunStudents(headId, studentCsv);
  expect(studentsAgain.counts.create).toBe(0);
  expect(studentsAgain.counts.error).toBe(0);
  await commitStudents(headId, studentCsv);

  const offeringsAgain = await dryRunOfferings(headId, offeringCsv, semesterId);
  expect(offeringsAgain.counts.create).toBe(0);
  expect(offeringsAgain.counts.error).toBe(0);
  await commitOfferings(headId, offeringCsv, semesterId);

  const enrollmentsAgain = await dryRunEnrollments(headId, enrollmentCsv, semesterId);
  expect(enrollmentsAgain.counts).toMatchObject({ create: 0, error: 0 });
  expect(enrollmentsAgain.counts.skip).toBe(expected.enrollmentRows);

  expect({
    users: await prisma.user.count(),
    groups: await prisma.studentGroup.count(),
    offerings: await prisma.courseOffering.count(),
    enrollments: await prisma.courseEnrollment.count(),
  }).toEqual(before);
}

async function createDepartmentCampaign(
  key: DepartmentKey,
  fixture: RegistryManifestDepartment,
  headId: string,
  headEmail: string,
  semesterId: string,
) {
  const anchor = await prisma.user.findUniqueOrThrow({ where: { emailLower: fixture.anchor.teacherEmail } });
  const peers = await prisma.user.findMany({ where: { emailLower: { in: fixture.anchor.peerEmails } } });
  expect(peers).toHaveLength(5);

  const draft = await createCampaign(headId, {
    name: `E2E ${key.toUpperCase()} combined teaching feedback`,
    type: "EMAIL",
    semesterId,
  });
  const detail = await getCampaignDetail(headId, draft.id);
  const offeringsByTeacher = new Map<string, string[]>();
  for (const offering of detail.availableOfferings) {
    const ids = offeringsByTeacher.get(offering.teacherId) ?? [];
    ids.push(offering.id);
    offeringsByTeacher.set(offering.teacherId, ids);
  }
  expect(detail.availableOfferings.length).toBeGreaterThan(0);
  const templates = Object.fromEntries(
    detail.templates.map((template) => [template.targetGroup, template.templateId]),
  ) as Record<TargetGroup, string>;
  expect(Object.values(templates).every(Boolean)).toBe(true);
  await updateCampaign(headId, draft.id, {
    name: draft.name,
    audienceMode: "REGISTERED_ONLY",
    opensAt: isoDate(0),
    closesAt: isoDate(30),
    maxResponses: null,
    minResponses: 5,
    minTeachers: 1,
    minStudents: 5,
    templates,
    assignments: [...offeringsByTeacher].map(([teacherId, offeringIds]) => ({
      teacherId,
      offeringIds,
      studentGroupIds: [],
      peerIds: teacherId === anchor.id ? peers.map((peer) => peer.id) : [],
      headIncluded: teacherId === anchor.id,
    })),
  });
  const expectedStudentTasks = await prisma.courseEnrollment.count({
    where: { offeringId: { in: detail.availableOfferings.map((offering) => offering.id) } },
  });
  const mailBeforeLaunch = readOutbox().length;
  await launchCampaign(headId, draft.id);
  expect(await prisma.responseTask.count({ where: { campaignId: draft.id } })).toBe(expectedStudentTasks + 6);
  expect(readOutbox().length - mailBeforeLaunch).toBe(expectedStudentTasks + 6);

  const anchorOffering = await prisma.courseOffering.findUniqueOrThrow({
    where: { externalId: fixture.anchor.offeringExternalId },
  });
  const result = {
    campaign: draft.id,
    headId,
    headEmail,
    anchorTeacherId: anchor.id,
    anchorOfferingId: anchorOffering.id,
  };
  campaigns.set(key, result);
  return result;
}

async function submitDepartmentResponses(key: DepartmentKey, fixture: RegistryManifestDepartment, set: CampaignSet) {
  const score = key === "cse" ? "maximum" : "minimum";
  const expectedScore = key === "cse" ? 100 : 0;

  for (let index = 0; index < fixture.anchor.studentEmails.length; index++) {
    const token = messageToken(fixture.anchor.studentEmails[index], fixture.anchor.teacherName, fixture.anchor.courseCode);
    const form = await getFormByToken(token);
    await submitByToken(
      token,
      answersFor(form, score, `${key.toUpperCase()} automated student comment`, key === "cse" && index === 0),
    );
    const dashboard = await getDashboard({
      campaignId: set.campaign,
      teacherId: set.anchorTeacherId,
      targetGroup: "STUDENT",
      requestingUserId: set.headId,
    });
    expect(dashboard.suppressed).toBe(index < 4);
  }

  for (const email of fixture.anchor.peerEmails) {
    const token = messageToken(email, fixture.anchor.teacherName);
    const form = await getFormByToken(token);
    await submitByToken(token, answersFor(form, score, `${key.toUpperCase()} automated peer comment`));
  }

  const managerToken = messageToken(set.headEmail, fixture.anchor.teacherName);
  const managerForm = await getFormByToken(managerToken);
  await submitByToken(managerToken, answersFor(managerForm, score, `${key.toUpperCase()} automated head comment`));

  for (const [targetGroup, count] of [
    ["STUDENT", 5],
    ["PEER", 5],
    ["MANAGER", 1],
  ] as const) {
    const dashboard = await getDashboard({
      campaignId: set.campaign,
      teacherId: set.anchorTeacherId,
      targetGroup,
      requestingUserId: set.headId,
    });
    expect(dashboard.suppressed).toBe(false);
    expect(dashboard.responseCount).toBe(count);
    expect(dashboard.overallScore).toBe(expectedScore);
    expect(dashboard.comments.some((comment) => comment.includes(`${key.toUpperCase()} automated`))).toBe(true);
  }

  const courses = await getCourseBreakdown({
    campaignId: set.campaign,
    teacherId: set.anchorTeacherId,
    targetGroup: "STUDENT",
    requestingUserId: set.headId,
  });
  const anchorCourse = courses.find((course) => course.offeringId === set.anchorOfferingId);
  expect(anchorCourse).toMatchObject({ responseCount: 5, suppressed: false, score: expectedScore });
  expect(courses.some((course) => course.offeringId !== set.anchorOfferingId && course.suppressed)).toBe(true);

  await closeCampaign(set.headId, set.campaign);
}

describe.sequential("two-department full data workflow", () => {
  beforeAll(async () => {
    clearOutbox();
    await seedE2eBase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("imports both full registries and proves every import is repeatable", async () => {
    const semester = await prisma.semester.findFirstOrThrow();
    const cseHead = await prisma.user.findUniqueOrThrow({ where: { emailLower: "meron.assefa@astu.edu.et" } });
    const sweHead = await prisma.user.findUniqueOrThrow({ where: { emailLower: "dawit.haile@astu.edu.et" } });

    await importDepartment("cse", cseHead.id, semester.id);
    await importDepartment("swe", sweHead.id, semester.id);

    expect(await prisma.courseEnrollment.count()).toBe(
      manifest.departments.cse.enrollmentRows + manifest.departments.swe.enrollmentRows,
    );
    expect(await prisma.studentGroup.count()).toBe(
      manifest.departments.cse.sectionRows + manifest.departments.swe.sectionRows,
    );
  });

  it("launches one combined student, peer, and head round in both departments", async () => {
    const semester = await prisma.semester.findFirstOrThrow();
    for (const key of ["cse", "swe"] as const) {
      const headEmail = key === "cse" ? "meron.assefa@astu.edu.et" : "dawit.haile@astu.edu.et";
      const head = await prisma.user.findUniqueOrThrow({ where: { emailLower: headEmail } });
      await createDepartmentCampaign(key, manifest.departments[key], head.id, headEmail, semester.id);
    }

    const cse = campaigns.get("cse")!;
    const swe = campaigns.get("swe")!;
    await expect(getCampaignDetail(cse.headId, swe.campaign)).rejects.toThrow("Campaign not found");

    const duplicate = await createCampaign(cse.headId, {
      name: "E2E duplicate student round",
      type: "EMAIL",
      semesterId: semester.id,
    });
    const detail = await getCampaignDetail(cse.headId, duplicate.id);
    const templateId = detail.templates.find((template) => template.targetGroup === "STUDENT")!.templateId!;
    await updateCampaign(cse.headId, duplicate.id, {
      name: duplicate.name,
      audienceMode: "REGISTERED_ONLY",
      opensAt: isoDate(0),
      closesAt: isoDate(30),
      maxResponses: null,
      minResponses: 5,
      minTeachers: 1,
      minStudents: 1,
      templates: { STUDENT: templateId, PEER: null, MANAGER: null },
      assignments: [{
        teacherId: cse.anchorTeacherId,
        offeringIds: [cse.anchorOfferingId],
        studentGroupIds: [],
        peerIds: [],
        headIncluded: false,
      }],
    });
    await expect(launchCampaign(cse.headId, duplicate.id)).rejects.toThrow(/student campaign already exists/i);

    const hashes = await prisma.responseTask.findMany({ select: { tokenHash: true } });
    expect(hashes.length).toBeGreaterThan(1_000);
    expect(hashes.every(({ tokenHash }) => /^[0-9a-f]{64}$/.test(tokenHash))).toBe(true);
  });

  it("accepts student, peer and head responses, enforces min-N, and produces exact AVP results", async () => {
    await submitDepartmentResponses("cse", manifest.departments.cse, campaigns.get("cse")!);
    await submitDepartmentResponses("swe", manifest.departments.swe, campaigns.get("swe")!);

    const semester = await prisma.semester.findFirstOrThrow();
    const avp = await prisma.user.findUniqueOrThrow({ where: { emailLower: "miftah.shifera@astu.edu.et" } });
    const expectedCounts: Record<TargetGroup, number> = { STUDENT: 10, PEER: 10, MANAGER: 2 };

    for (const targetGroup of ["STUDENT", "PEER", "MANAGER"] as const) {
      const rollup = await getScopeRollup({ targetGroup, semesterId: semester.id, requestingUserId: avp.id });
      expect(rollup.scopeComposite).toBe(50);
      expect(rollup.responseCount).toBe(expectedCounts[targetGroup]);
      expect(rollup.rows.find((row) => row.name === manifest.departments.cse.name)?.composite).toBe(100);
      expect(rollup.rows.find((row) => row.name === manifest.departments.swe.name)?.composite).toBe(0);
      expect(rollup.rows.some((row) => row.name.includes("Academic VP") || row.name.includes("Quality Assurance"))).toBe(false);
    }

    for (const key of ["cse", "swe"] as const) {
      const set = campaigns.get(key)!;
      const preview = await previewLetters(set.headId, {
        studentCampaignId: set.campaign,
        peerCampaignId: set.campaign,
        managerCampaignId: set.campaign,
        roundLabel: "E2E semester",
      });
      const anchor = preview.rows.find((row) => row.teacherId === set.anchorTeacherId)!;
      expect(anchor.ready).toBe(true);
      expect(anchor.overallScore).toBe(key === "cse" ? 5 : 0);
      expect(preview.rows.filter((row) => row.ready)).toHaveLength(1);
    }
  });
});
