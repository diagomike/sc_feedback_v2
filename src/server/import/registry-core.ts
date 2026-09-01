import type { PrismaClient } from "@prisma/client";
import { createUninvitedUser } from "../auth/create-user";
import { deriveStaffEmail, departmentNameForCourseCode, normalizePersonName } from "../courses/course-logic";
import {
  ENROLLMENT_COLUMNS,
  OFFERING_COLUMNS,
  STUDENT_COLUMNS,
  classifyEnrollmentRows,
  classifyOfferingRows,
  classifyStudentRows,
  enrollmentKey,
  parseNamedCsv,
  sectionKey,
  summarize,
  type ExistingStudent,
  type OfferingRowClassification,
  type StudentRowClassification,
} from "./erp-parsing";

/**
 * The registry import engine — students, offerings, enrolments — for one department node
 * and one semester.
 *
 * Deliberately free of `server-only` and of the `@/` path alias, and taking its Prisma
 * client as an argument, so THE SAME CODE runs in two places: behind /manage/import (via
 * registry-import.ts, which adds the ownDepartmentNode scope check) and under `tsx` in
 * prisma/real-data/load.ts. A seeder that wrote rows its own way would be a second,
 * silently diverging implementation of the rules below.
 *
 * Three properties hold everywhere:
 *
 *  - DRY-RUN AND COMMIT SHARE ONE CLASSIFIER. Commit re-parses and re-classifies the CSV
 *    rather than trusting a row list from the client, so the preview cannot diverge from
 *    what gets written.
 *  - NOBODY IS EMAILED. See create-user.ts.
 *  - A CROSS-DEPARTMENT INSTRUCTOR JOINS THEIR OWN DEPARTMENT, not the importing one. A CSE
 *    export legitimately contains MATH2207 taught by an Applied Maths lecturer; the course
 *    code prefix says whose staff they are, and that decides who evaluates them. See
 *    COURSE_PREFIX_DEPARTMENTS in course-logic.ts and authorizeOfferings in campaign-logic.ts.
 */

export type Db = PrismaClient;

// ─────────────────────────────────────────────────────────────────────────
// Students
// ─────────────────────────────────────────────────────────────────────────

async function studentContext(db: Db, csv: string) {
  const parsed = parseNamedCsv(csv, STUDENT_COLUMNS);
  const ids = [...new Set(parsed.map((r) => (r.values.student_id ?? "").trim()).filter(Boolean))];
  const emails = [...new Set(parsed.map((r) => (r.values.email ?? "").trim().toLowerCase()).filter(Boolean))];

  const users = await db.user.findMany({
    where: { OR: [{ externalId: { in: ids } }, { emailLower: { in: emails } }] },
    select: { id: true, externalId: true, emailLower: true },
  });
  const byExternalId = new Map<string, ExistingStudent>();
  const byEmail = new Map<string, ExistingStudent>();
  for (const u of users) {
    if (u.externalId) byExternalId.set(u.externalId, u);
    byEmail.set(u.emailLower, u);
  }
  return classifyStudentRows(parsed, { byExternalId, byEmail });
}

export async function dryRunStudentsCore(db: Db, csv: string) {
  const rows = await studentContext(db, csv);
  const sections = [...new Set(rows.filter((r) => r.action !== "error").map((r) => `${r.classYear} · ${r.section}`))];
  return { rows, counts: summarize(rows), sections };
}

export async function commitStudentsCore(db: Db, nodeId: string, csv: string) {
  const rows = await studentContext(db, csv);

  // Sections first: every student needs their group to exist before joining it, and doing
  // them up front is one upsert per section instead of one per student.
  const groupIdByKey = new Map<string, string>();
  for (const r of rows) {
    if (r.action === "error") continue;
    const key = sectionKey(r.classYear, r.section);
    if (groupIdByKey.has(key)) continue;
    const group = await db.studentGroup.upsert({
      where: { nodeId_classYear_sectionLabel: { nodeId, classYear: r.classYear, sectionLabel: r.section } },
      create: {
        nodeId,
        name: `${r.classYear} · ${r.section}`,
        program: r.program,
        classYear: r.classYear,
        sectionLabel: r.section,
      },
      update: { program: r.program },
    });
    groupIdByKey.set(key, group.id);
  }

  let created = 0;
  let updated = 0;

  for (const r of rows) {
    if (r.action === "error" || r.action === "skip") continue;

    const emailLower = r.email.toLowerCase();
    const byId = await db.user.findUnique({ where: { externalId: r.studentId } });
    const byEmail = await db.user.findUnique({ where: { emailLower } });
    const existing = byId ?? byEmail;

    let userId: string;
    if (existing) {
      await db.user.update({
        where: { id: existing.id },
        data: { name: r.name, phone: r.phone, externalId: r.studentId, email: r.email, emailLower },
      });
      userId = existing.id;
      updated++;
    } else {
      const invited = await createUninvitedUser(db, { name: r.name, email: r.email, role: "STUDENT" });
      await db.user.update({ where: { id: invited.userId }, data: { externalId: r.studentId, phone: r.phone } });
      userId = invited.userId;
      created++;
    }

    await db.userRole.upsert({
      where: { userId_kind: { userId, kind: "STUDENT" } },
      create: { userId, kind: "STUDENT" },
      update: {},
    });
    await db.membership.upsert({
      where: { userId_nodeId_kind: { userId, nodeId, kind: "STUDENT" } },
      create: { userId, nodeId, kind: "STUDENT" },
      update: {},
    });

    const groupId = groupIdByKey.get(sectionKey(r.classYear, r.section));
    if (groupId) {
      // The registry is the authority for the current term: a student who moved section
      // leaves the old one rather than accumulating both.
      await db.studentGroupMember.deleteMany({ where: { userId, group: { nodeId }, NOT: { groupId } } });
      await db.studentGroupMember.upsert({
        where: { groupId_userId: { groupId, userId } },
        create: { groupId, userId },
        update: {},
      });
    }
  }

  return { created, updated, sections: groupIdByKey.size };
}

// ─────────────────────────────────────────────────────────────────────────
// Offerings
// ─────────────────────────────────────────────────────────────────────────

export interface OfferingReviewRow extends OfferingRowClassification {
  /** Which department this instructor will belong to — theirs, not necessarily yours. */
  homeDepartment: string | null;
}

async function offeringContext(db: Db, nodeId: string, csv: string, semesterId: string) {
  const parsed = parseNamedCsv(csv, OFFERING_COLUMNS);

  const groups = await db.studentGroup.findMany({
    where: { nodeId, classYear: { not: null }, sectionLabel: { not: null } },
    select: { id: true, classYear: true, sectionLabel: true },
  });
  const groupIdByKey = new Map(groups.map((g) => [sectionKey(g.classYear!, g.sectionLabel!), g.id]));

  const staff = await db.user.findMany({
    where: { roles: { some: { kind: "TEACHER" } } },
    select: { id: true, emailLower: true },
  });
  const staffIdByEmail = new Map(staff.map((s) => [s.emailLower, s.id]));

  const existing = await db.courseOffering.findMany({ where: { semesterId }, select: { externalId: true } });
  const existingExternalIds = new Set(existing.map((o) => o.externalId).filter((v): v is string => v != null));

  const rows = classifyOfferingRows(
    parsed,
    { sectionKeys: new Set(groupIdByKey.keys()), staffByEmail: new Set(staffIdByEmail.keys()), existingExternalIds },
    deriveStaffEmail,
    semesterId,
  );

  return { rows, groupIdByKey, staffIdByEmail };
}

export async function dryRunOfferingsCore(db: Db, nodeId: string, csv: string, semesterId: string) {
  const { rows } = await offeringContext(db, nodeId, csv, semesterId);

  const names = new Set(rows.map((r) => departmentNameForCourseCode(r.courseCode)).filter((n): n is string => n != null));
  const known = names.size
    ? await db.hierarchyNode.findMany({ where: { name: { in: [...names] } }, select: { name: true } })
    : [];
  const knownNames = new Set(known.map((n) => n.name));

  const reviewed: OfferingReviewRow[] = rows.map((r) => {
    const home = departmentNameForCourseCode(r.courseCode);
    return { ...r, homeDepartment: home && knownNames.has(home) ? home : null };
  });

  return {
    rows: reviewed,
    counts: summarize(reviewed),
    proposedEmails: reviewed.filter((r) => r.instructorEmailProposed && r.action !== "error").length,
  };
}

export async function commitOfferingsCore(db: Db, nodeId: string, csv: string, semesterId: string) {
  const { rows, groupIdByKey, staffIdByEmail } = await offeringContext(db, nodeId, csv, semesterId);
  const nodeByName = new Map(
    (await db.hierarchyNode.findMany({ select: { id: true, name: true } })).map((n) => [n.name, n.id]),
  );

  let created = 0;
  let updated = 0;
  let teachersInvited = 0;
  let duplicates = 0;

  for (const r of rows) {
    if (r.action === "error" || r.action === "skip") continue;

    const homeName = departmentNameForCourseCode(r.courseCode);
    const homeNodeId = (homeName ? nodeByName.get(homeName) : undefined) ?? nodeId;

    const course = await db.course.upsert({
      where: { code: r.courseCode },
      create: { code: r.courseCode, title: r.courseTitle, nodeId: homeName ? (nodeByName.get(homeName) ?? null) : null },
      update: { title: r.courseTitle },
    });

    const emailLower = r.instructorEmail.toLowerCase();
    let teacherId = staffIdByEmail.get(emailLower);
    if (!teacherId) {
      const existingUser = await db.user.findUnique({ where: { emailLower } });
      if (existingUser) {
        teacherId = existingUser.id;
        await db.userRole.upsert({
          where: { userId_kind: { userId: existingUser.id, kind: "TEACHER" } },
          create: { userId: existingUser.id, kind: "TEACHER" },
          update: {},
        });
      } else {
        const invited = await createUninvitedUser(db, {
          name: normalizePersonName(r.instructorName),
          email: r.instructorEmail,
          role: "TEACHER",
        });
        teacherId = invited.userId;
        teachersInvited++;
      }
      staffIdByEmail.set(emailLower, teacherId);
    }

    await db.membership.upsert({
      where: { userId_nodeId_kind: { userId: teacherId, nodeId: homeNodeId, kind: "TEACHER" } },
      create: { userId: teacherId, nodeId: homeNodeId, kind: "TEACHER" },
      update: {},
    });

    const groupId = groupIdByKey.get(sectionKey(r.classYear, r.section));
    if (!groupId) continue; // already classified as an error; belt and braces

    const byExternal = await db.courseOffering.findUnique({ where: { externalId: r.offeringId } });
    if (byExternal) {
      await db.courseOffering.update({
        where: { id: byExternal.id },
        data: { courseId: course.id, teacherId, studentGroupId: groupId, semesterId },
      });
      updated++;
      continue;
    }

    const byComposite = await db.courseOffering.findUnique({
      where: {
        semesterId_courseId_teacherId_studentGroupId: { semesterId, courseId: course.id, teacherId, studentGroupId: groupId },
      },
    });
    if (byComposite) {
      // Same class, second registry id. The export really does contain these (one class
      // appearing twice, usually with one of the two carrying the whole roster and the
      // other none). Keep the id already imported rather than re-pointing it: overwriting
      // would orphan every enrolment loaded against the first id, which is silent data
      // loss the enrolment file can only report as "no such offering".
      duplicates++;
      continue;
    }

    await db.courseOffering.create({
      data: { semesterId, courseId: course.id, teacherId, studentGroupId: groupId, externalId: r.offeringId },
    });
    created++;
  }

  return { created, updated, teachersInvited, duplicates };
}

// ─────────────────────────────────────────────────────────────────────────
// Enrolments
// ─────────────────────────────────────────────────────────────────────────

async function enrollmentContext(db: Db, csv: string, semesterId: string) {
  const parsed = parseNamedCsv(csv, ENROLLMENT_COLUMNS);
  const offeringIds = [...new Set(parsed.map((r) => (r.values.offering_id ?? "").trim()).filter(Boolean))];
  const studentIds = [...new Set(parsed.map((r) => (r.values.student_id ?? "").trim()).filter(Boolean))];

  const offerings = await db.courseOffering.findMany({
    where: { semesterId, externalId: { in: offeringIds } },
    select: { id: true, externalId: true },
  });
  const offeringIdByExternal = new Map(offerings.map((o) => [o.externalId!, o.id]));

  const students = await db.user.findMany({
    where: { externalId: { in: studentIds } },
    select: { id: true, externalId: true },
  });
  const userIdByExternal = new Map(students.map((s) => [s.externalId!, s.id]));

  const existing = offerings.length
    ? await db.courseEnrollment.findMany({
        where: { offeringId: { in: offerings.map((o) => o.id) } },
        select: { offeringId: true, userId: true },
      })
    : [];
  const externalByOfferingId = new Map(offerings.map((o) => [o.id, o.externalId!]));
  const externalByUserId = new Map([...userIdByExternal.entries()].map(([ext, id]) => [id, ext]));
  const existingPairs = new Set(
    existing
      .map((e) => {
        const off = externalByOfferingId.get(e.offeringId);
        const stu = externalByUserId.get(e.userId);
        return off && stu ? enrollmentKey(off, stu) : null;
      })
      .filter((v): v is string => v != null),
  );

  const rows = classifyEnrollmentRows(parsed, {
    knownOfferingIds: new Set(offeringIdByExternal.keys()),
    knownStudentIds: new Set(userIdByExternal.keys()),
    existingPairs,
  });

  return { rows, offeringIdByExternal, userIdByExternal };
}

export async function dryRunEnrollmentsCore(db: Db, csv: string, semesterId: string) {
  const { rows } = await enrollmentContext(db, csv, semesterId);
  return { rows, counts: summarize(rows) };
}

export async function commitEnrollmentsCore(db: Db, csv: string, semesterId: string) {
  const { rows, offeringIdByExternal, userIdByExternal } = await enrollmentContext(db, csv, semesterId);

  const toCreate: { offeringId: string; userId: string }[] = [];
  for (const r of rows) {
    if (r.action !== "create") continue;
    const offeringId = offeringIdByExternal.get(r.offeringId);
    const userId = userIdByExternal.get(r.studentId);
    if (offeringId && userId) toCreate.push({ offeringId, userId });
  }

  // createMany in chunks, not a loop: an enrolment file is ~6,500 rows per department per
  // semester, and one round trip each would make the import minutes long.
  let created = 0;
  const CHUNK = 1000;
  for (let i = 0; i < toCreate.length; i += CHUNK) {
    const result = await db.courseEnrollment.createMany({ data: toCreate.slice(i, i + CHUNK), skipDuplicates: true });
    created += result.count;
  }

  return {
    created,
    skipped: rows.filter((r) => r.action === "skip").length,
    errors: rows.filter((r) => r.action === "error").length,
  };
}

export type { StudentRowClassification };
