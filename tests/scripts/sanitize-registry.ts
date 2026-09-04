import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { coursePrefix, personMatchKey } from "../../src/server/courses/course-logic";
import { parseNamedCsv } from "../../src/server/import/erp-parsing";

type Values = Record<string, string>;

const sourceRoot = resolve(process.argv[2] ?? "prisma/real-data-private");
const outputRoot = resolve(process.argv[3] ?? "tests/fixtures/registry-full");
const departments = [
  { key: "cse", prefix: "CSEG", name: "Computer Science & Engineering" },
  { key: "swe", prefix: "SENG", name: "Software Engineering" },
] as const;

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function writeCsv(path: string, headers: string[], rows: Values[]): void {
  const lines = [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header] ?? "")).join(","))];
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

function readCsv(department: string, filename: string, required: readonly string[]): Values[] {
  return parseNamedCsv(readFileSync(join(sourceRoot, department, filename), "utf8"), required).map((row) => row.values);
}

const source = new Map<string, { students: Values[]; offerings: Values[]; enrollments: Values[] }>();
for (const department of departments) {
  source.set(department.key, {
    students: readCsv(department.key, "students.csv", ["student_id", "name", "email", "class_year", "section"]),
    offerings: readCsv(department.key, "offerings.csv", ["course_code", "course_title", "instructor_name", "class_year", "section"]),
    enrollments: readCsv(department.key, "enrollments.csv", ["offering_id", "student_id"]),
  });
}

// One global instructor map preserves people who appear in both department exports.
const instructorKeys = [...new Set(
  [...source.values()].flatMap((data) => data.offerings.map((row) => personMatchKey(row.instructor_name))),
)].sort();
const instructorByKey = new Map(
  instructorKeys.map((key, index) => {
    const sequence = String(index + 1).padStart(4, "0");
    return [key, { name: `Instructor ${sequence} Test`, email: `instructor.${sequence}@example.test` }] as const;
  }),
);

interface ManifestDepartment {
  name: string;
  staffRows: number;
  studentRows: number;
  offeringRows: number;
  enrollmentRows: number;
  sectionRows: number;
  anchor: {
    teacherName: string;
    teacherEmail: string;
    offeringExternalId: string;
    courseCode: string;
    courseTitle: string;
    peerEmails: string[];
    studentEmails: string[];
  };
}

const manifest: { generatedAt: string; departments: Record<string, ManifestDepartment> } = {
  generatedAt: "deterministic",
  departments: {},
};

for (const department of departments) {
  const data = source.get(department.key)!;
  const studentIdMap = new Map<string, string>();
  const studentEmailById = new Map<string, string>();
  const students = data.students.map((row, index) => {
    const sequence = String(index + 1).padStart(4, "0");
    const id = `${department.key.toUpperCase()}-STU-${sequence}`;
    const email = `${department.key}.student.${sequence}@example.test`;
    studentIdMap.set(row.student_id, id);
    studentEmailById.set(id, email);
    return {
      student_id: id,
      name: `${department.key.toUpperCase()} Student ${sequence}`,
      email,
      phone: `090${String(index + 1).padStart(7, "0")}`,
      program: row.program || "REGULAR",
      class_year: row.class_year,
      section: row.section,
    };
  });

  const offeringIdMap = new Map<string, string>();
  const offerings = data.offerings.map((row, index) => {
    const sequence = String(index + 1).padStart(4, "0");
    const id = `${department.key.toUpperCase()}-OFF-${sequence}`;
    offeringIdMap.set(row.offering_id, id);
    const instructor = instructorByKey.get(personMatchKey(row.instructor_name));
    if (!instructor) throw new Error(`No sanitized instructor for ${row.instructor_name}`);
    return {
      offering_id: id,
      course_code: row.course_code,
      course_title: row.course_title,
      instructor_name: instructor.name,
      instructor_email: instructor.email,
      class_year: row.class_year,
      section: row.section,
    };
  });

  const enrollments = data.enrollments.map((row) => {
    const offeringId = offeringIdMap.get(row.offering_id);
    const studentId = studentIdMap.get(row.student_id);
    if (!offeringId) throw new Error(`Unknown offering ${row.offering_id} in ${department.key} enrollments`);
    if (!studentId) throw new Error(`Unknown student ${row.student_id} in ${department.key} enrollments`);
    return { offering_id: offeringId, student_id: studentId };
  });

  // Staff membership follows the course's home prefix. Unmodelled service subjects stay
  // with the department whose registry export contained them, matching the live importer.
  const staffKeys = new Set<string>();
  for (const sourceDepartment of departments) {
    for (const row of source.get(sourceDepartment.key)!.offerings) {
      const prefix = coursePrefix(row.course_code);
      const home = prefix === "CSEG" ? "cse" : prefix === "SENG" ? "swe" : sourceDepartment.key;
      if (home === department.key) staffKeys.add(personMatchKey(row.instructor_name));
    }
  }
  const staff = [...staffKeys]
    .map((key) => instructorByKey.get(key)!)
    .sort((a, b) => a.email.localeCompare(b.email))
    .map((instructor) => ({ name: instructor.name, email: instructor.email, phone: "", type: "teacher" }));

  const enrollmentCountByOffering = new Map<string, number>();
  for (const row of enrollments) {
    enrollmentCountByOffering.set(row.offering_id, (enrollmentCountByOffering.get(row.offering_id) ?? 0) + 1);
  }
  const anchorOffering = offerings.find(
    (row) => coursePrefix(row.course_code) === department.prefix && (enrollmentCountByOffering.get(row.offering_id) ?? 0) >= 5,
  );
  if (!anchorOffering) throw new Error(`No anchor offering with five students for ${department.key}`);
  const anchorStudentIds = enrollments
    .filter((row) => row.offering_id === anchorOffering.offering_id)
    .slice(0, 5)
    .map((row) => row.student_id);
  const peers = staff.filter((row) => row.email !== anchorOffering.instructor_email).slice(0, 5);
  if (peers.length < 5) throw new Error(`Not enough peer staff for ${department.key}`);

  const directory = join(outputRoot, department.key);
  mkdirSync(directory, { recursive: true });
  writeCsv(join(directory, "staff.csv"), ["name", "email", "phone", "type"], staff);
  writeCsv(
    join(directory, "students.csv"),
    ["student_id", "name", "email", "phone", "program", "class_year", "section"],
    students,
  );
  writeCsv(
    join(directory, "offerings.csv"),
    ["offering_id", "course_code", "course_title", "instructor_name", "instructor_email", "class_year", "section"],
    offerings,
  );
  writeCsv(join(directory, "enrollments.csv"), ["offering_id", "student_id"], enrollments);

  manifest.departments[department.key] = {
    name: department.name,
    staffRows: staff.length,
    studentRows: students.length,
    offeringRows: offerings.length,
    enrollmentRows: enrollments.length,
    sectionRows: new Set(students.map((row) => `${row.class_year}\u0000${row.section}`)).size,
    anchor: {
      teacherName: anchorOffering.instructor_name,
      teacherEmail: anchorOffering.instructor_email,
      offeringExternalId: anchorOffering.offering_id,
      courseCode: anchorOffering.course_code,
      courseTitle: anchorOffering.course_title,
      peerEmails: peers.map((row) => row.email),
      studentEmails: anchorStudentIds.map((id) => studentEmailById.get(id)!),
    },
  };
}

mkdirSync(outputRoot, { recursive: true });
writeFileSync(join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Sanitized registry fixtures written to ${outputRoot}`);
