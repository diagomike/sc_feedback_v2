import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseNamedCsv } from "../../src/server/import/erp-parsing";
import { deriveStaffEmail } from "../../src/server/courses/course-logic";

interface OfferingRow {
  offering_id: string;
  course_code: string;
  course_title: string;
  instructor_name: string;
  instructor_email: string;
}

interface StudentRow {
  student_id: string;
  email: string;
  class_year: string;
  section: string;
}

interface EnrollmentRow {
  offering_id: string;
  student_id: string;
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function rowsFor<T>(csv: string, required: string[]): T[] {
  return parseNamedCsv(csv, required).map((row) => row.values as unknown as T);
}

function prepareDepartment(sourceRoot: string, targetRoot: string, department: "cse" | "swe") {
  const source = resolve(sourceRoot, department);
  const target = resolve(targetRoot, department);
  mkdirSync(target, { recursive: true });
  for (const name of ["students.csv", "offerings.csv", "enrollments.csv"]) {
    writeFileSync(join(target, name), readFileSync(join(source, name)));
  }
  const students = rowsFor<StudentRow>(readFileSync(join(source, "students.csv"), "utf8"), [
    "student_id", "email", "class_year", "section",
  ]);
  const offerings = rowsFor<OfferingRow>(readFileSync(join(source, "offerings.csv"), "utf8"), [
    "offering_id", "course_code", "course_title", "instructor_name", "instructor_email",
  ]);
  const enrollments = rowsFor<EnrollmentRow>(readFileSync(join(source, "enrollments.csv"), "utf8"), [
    "offering_id", "student_id",
  ]);
  const people = new Map<string, OfferingRow>();
  for (const row of offerings) {
    const email = row.instructor_email.trim() || deriveStaffEmail(row.instructor_name);
    if (!email) throw new Error(`Could not derive an email for ${row.instructor_name}`);
    row.instructor_email = email;
    const key = row.instructor_email.toLowerCase();
    if (key) people.set(key, row);
  }
  const rows = ["name,email,phone,type"];
  for (const person of [...people.values()].sort((a, b) => a.instructor_name.localeCompare(b.instructor_name))) {
    rows.push([person.instructor_name, person.instructor_email, "", "teacher"].map(csvCell).join(","));
  }
  writeFileSync(join(target, "staff.csv"), `${rows.join("\n")}\n`);

  const enrollmentsByOffering = new Map<string, string[]>();
  for (const enrollment of enrollments) {
    const ids = enrollmentsByOffering.get(enrollment.offering_id) ?? [];
    ids.push(enrollment.student_id);
    enrollmentsByOffering.set(enrollment.offering_id, ids);
  }
  const studentById = new Map(students.map((student) => [student.student_id, student]));
  const anchor = offerings.find((offering) => (enrollmentsByOffering.get(offering.offering_id)?.length ?? 0) >= 5);
  if (!anchor) throw new Error(`No offering with five students exists in ${department}`);
  const peers = [...people.values()].filter((person) => person.instructor_email !== anchor.instructor_email).slice(0, 5);
  if (peers.length < 5) throw new Error(`Fewer than five peer staff exist in ${department}`);
  const anchorStudents = enrollmentsByOffering.get(anchor.offering_id)!.slice(0, 5).map((id) => studentById.get(id)?.email);
  if (anchorStudents.some((email) => !email)) throw new Error(`Anchor enrolments have missing students in ${department}`);
  return {
    name: department === "cse" ? "Computer Science & Engineering" : "Software Engineering",
    staffRows: people.size,
    studentRows: students.length,
    offeringRows: offerings.length,
    enrollmentRows: enrollments.length,
    sectionRows: new Set(students.map((student) => `${student.class_year}|${student.section}`)).size,
    anchor: {
      teacherName: anchor.instructor_name,
      teacherEmail: anchor.instructor_email,
      offeringExternalId: anchor.offering_id,
      courseCode: anchor.course_code,
      courseTitle: anchor.course_title,
      peerEmails: peers.map((peer) => peer.instructor_email),
      studentEmails: anchorStudents as string[],
    },
  };
}

const privateBase = resolve(process.env.PRIVATE_REGISTRY_ROOT ?? "prisma/real-data-private");
const privateSemester = process.env.PRIVATE_REGISTRY_SEMESTER ?? "second_sem";
const privateRoot = join(privateBase, privateSemester);
for (const department of ["cse", "swe"] as const) {
  if (!existsSync(join(privateRoot, department, "offerings.csv"))) {
    throw new Error(
      `Private registry exports are missing under ${privateRoot}; run npm run registry:convert first`,
    );
  }
}

const preparedRoot = join(tmpdir(), `astu-feedback-private-${process.pid}`);
try {
  const departments = {
    cse: prepareDepartment(privateRoot, preparedRoot, "cse"),
    swe: prepareDepartment(privateRoot, preparedRoot, "swe"),
  };
  writeFileSync(join(preparedRoot, "manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), departments }, null, 2));
  execFileSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), "tests/scripts/run-playwright.ts", "full-chromium"], {
    cwd: process.cwd(),
    env: { ...process.env, REGISTRY_FIXTURE_ROOT: preparedRoot },
    stdio: "inherit",
  });
  execFileSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), "tests/scripts/render-e2e-report.ts"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
} finally {
  rmSync(preparedRoot, { recursive: true, force: true });
}
