/**
 * Loads the converted registry CSVs into the database.
 *
 *   npx tsx prisma/real-data/load.ts
 *
 * Additive: it does not wipe anything, so run it after `npx prisma db seed` and the
 * synthetic dataset the analytics numbers were verified against stays intact alongside the
 * real one.
 *
 * It drives registry-core.ts — THE SAME FUNCTIONS /manage/import calls. A seeder that
 * wrote these rows its own way would be a second implementation of the import rules, free
 * to diverge from the one that runs in production; this way, "the seeded database" and "a
 * head who uploaded these four files" are the same thing by construction.
 *
 * Order matters and is enforced by the importer itself: sections come into existence with
 * the students, an offering needs its section, an enrolment needs both ends.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  commitEnrollmentsCore,
  commitOfferingsCore,
  commitStudentsCore,
} from "../../src/server/import/registry-core";

const prisma = new PrismaClient();

/** The academic year the export covers: "2025/2026 Second Semester". */
const ACADEMIC_YEAR = 2025;
const TERM = "SPRING" as const;

const DEPARTMENTS = [
  { dir: "cse", nodeName: "Computer Science & Engineering" },
  { dir: "swe", nodeName: "Software Engineering" },
];

function read(dir: string, file: string): string {
  const root = resolve(process.env.REGISTRY_FIXTURE_ROOT ?? join(__dirname, "..", "..", "tests", "fixtures", "registry-full"));
  return readFileSync(join(root, dir, file), "utf8");
}

async function main(): Promise<void> {
  const semester = await prisma.semester.upsert({
    where: { academicYear_term: { academicYear: ACADEMIC_YEAR, term: TERM } },
    create: {
      academicYear: ACADEMIC_YEAR,
      term: TERM,
      startsAt: new Date("2026-02-23"),
      endsAt: new Date("2026-06-12"),
    },
    update: {},
  });
  console.log(`Semester: Spring ${ACADEMIC_YEAR}/${(ACADEMIC_YEAR + 1) % 100} (${semester.id})`);

  for (const dept of DEPARTMENTS) {
    const node = await prisma.hierarchyNode.findFirst({ where: { name: dept.nodeName } });
    if (!node) {
      console.warn(`  ! No node named "${dept.nodeName}" — run \`npx prisma db seed\` first. Skipping ${dept.dir}.`);
      continue;
    }
    console.log(`\n${dept.nodeName}`);

    const students = await commitStudentsCore(prisma, node.id, read(dept.dir, "students.csv"));
    console.log(`  students:    ${students.created} created, ${students.updated} updated, ${students.sections} sections`);

    const offerings = await commitOfferingsCore(prisma, node.id, read(dept.dir, "offerings.csv"), semester.id);
    console.log(
      `  offerings:   ${offerings.created} created, ${offerings.updated} updated, ` +
        `${offerings.teachersInvited} new instructor accounts`,
    );

    const enrollments = await commitEnrollmentsCore(prisma, read(dept.dir, "enrollments.csv"), semester.id);
    console.log(
      `  enrolments:  ${enrollments.created} created, ${enrollments.skipped} already present, ${enrollments.errors} errors`,
    );
  }

  // A quick shape check, so a silently empty load is obvious rather than something you
  // discover when a campaign launches to nobody.
  const [offeringCount, enrollmentCount, teacherCount] = await Promise.all([
    prisma.courseOffering.count({ where: { semesterId: semester.id } }),
    prisma.courseEnrollment.count({ where: { offering: { semesterId: semester.id } } }),
    prisma.user.count({ where: { roles: { some: { kind: "TEACHER" } } } }),
  ]);
  console.log(
    `\nIn ${semester.id}: ${offeringCount} offerings, ${enrollmentCount} enrolments, ${teacherCount} teachers overall.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
