/**
 * Converts the raw ASTU registry export into the four CSVs the department importer reads.
 *
 *   npx tsx prisma/real-data/convert-erp.ts [pathToExport] [semesterKeyword]
 *
 * Source (default D:\py_yaddessa\real_data — not vendored here, it is ~2.4 MB of JSON):
 *   feedback_en/all_students.json               every enrolled student, with real emails
 *   grades/<sem>/courses_cache.json             one entry per course x teacher x section
 *   grades/<sem>/grades_cache.json              keyed by course_id -> the enrolled roster
 *
 * Output, split per department because the importer is department-scoped (a head loads
 * their own file):
 *   prisma/real-data/<dept>/students.csv
 *   prisma/real-data/<dept>/offerings.csv
 *   prisma/real-data/<dept>/enrollments.csv
 *
 * Three decisions worth knowing:
 *
 *  - A SECTION BELONGS TO THE DEPARTMENT WHOSE STUDENTS SIT IN IT, so an offering goes in
 *    the file of the section's department, not the instructor's. MATH2207 taught to CSE
 *    Year 2 lands in cse/offerings.csv; the importer then puts the instructor into Applied
 *    Mathematics via the course-code prefix, which is what keeps "your own department
 *    evaluates you" true.
 *  - instructor_email IS LEFT BLANK on purpose. The export contains no staff address
 *    anywhere, so the importer proposes first.last@astu.edu.et and shows every proposal in
 *    the dry-run for review. Filling them in here would bypass exactly the check that
 *    exists because these addresses are guesses.
 *  - OFFERINGS WITH NO MATCHING SECTION ARE DROPPED, with a count reported. The export
 *    carries postgraduate, PhD and Extension offerings whose student rosters are not in
 *    all_students.json; importing them would create offerings that reach nobody.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseRegistryProgram, subjectShortCode } from "../../src/server/courses/course-logic";

interface RawStudent {
  id_number: string;
  name: string;
  email: string;
  mobile?: string;
  program: string;
  class_year: string;
  section: string;
}

interface RawOffering {
  course_name: string;
  course_code: string;
  instructor: string;
  program: string;
  class_year: string;
  section: string;
  course_id: string;
}

interface RawGradeEntry extends RawOffering {
  students: { student_name: string; id_number: string }[];
}

/** Registry subject -> the directory (and department) the file belongs to. */
const DEPARTMENT_DIRS: Record<string, string> = {
  CSE: "cse",
  SE: "swe",
};

function csvCell(value: string | null | undefined): string {
  const v = (value ?? "").replace(/\s+/g, " ").trim();
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function writeCsv(path: string, header: string[], rows: (string | null)[][]): void {
  const body = [header.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
  writeFileSync(path, `${body}\n`, "utf8");
}

function departmentDirFor(programLabel: string): string | null {
  const parsed = parseRegistryProgram(programLabel);
  if (!parsed) return null;
  // Only undergraduate cohorts have a student roster in the export; anything else would
  // produce offerings with no enrolments.
  if (parsed.level !== "UNDERGRADUATE") return null;
  return DEPARTMENT_DIRS[subjectShortCode(parsed.subject)] ?? null;
}

function scheduleFor(programLabel: string): "REGULAR" | "WEEKEND" | "EXTENSION" {
  return parseRegistryProgram(programLabel)?.schedule ?? "REGULAR";
}

function sectionKeyOf(classYear: string, section: string): string {
  return `${classYear.trim().toLowerCase()}||${section.trim().toLowerCase()}`;
}

function main(): void {
  const sourceRoot = resolve(process.argv[2] ?? "D:/py_yaddessa/real_data");
  const semesterDir = process.argv[3] ?? "second_sem";
  const outRoot = resolve(join(__dirname));

  const students: RawStudent[] = JSON.parse(readFileSync(join(sourceRoot, "feedback_en/all_students.json"), "utf8"));
  const offerings: RawOffering[] = JSON.parse(
    readFileSync(join(sourceRoot, "grades", semesterDir, "courses_cache.json"), "utf8"),
  );
  const grades: Record<string, RawGradeEntry> = JSON.parse(
    readFileSync(join(sourceRoot, "grades", semesterDir, "grades_cache.json"), "utf8"),
  );

  console.log(`Source: ${sourceRoot} (${semesterDir})`);
  console.log(`  ${students.length} students · ${offerings.length} offerings · ${Object.keys(grades).length} rosters`);

  // ── students, per department ───────────────────────────────────────────
  const studentsByDept = new Map<string, RawStudent[]>();
  const sectionsByDept = new Map<string, Set<string>>();
  const studentIdsByDept = new Map<string, Set<string>>();
  let unmappedStudents = 0;

  for (const s of students) {
    const dir = departmentDirFor(s.program);
    if (!dir) {
      unmappedStudents++;
      continue;
    }
    if (!studentsByDept.has(dir)) {
      studentsByDept.set(dir, []);
      sectionsByDept.set(dir, new Set());
      studentIdsByDept.set(dir, new Set());
    }
    studentsByDept.get(dir)!.push(s);
    sectionsByDept.get(dir)!.add(sectionKeyOf(s.class_year, s.section));
    studentIdsByDept.get(dir)!.add(s.id_number);
  }

  // ── offerings, filed under the SECTION's department ─────────────────────
  const offeringsByDept = new Map<string, RawOffering[]>();
  let droppedNoDept = 0;
  let droppedNoSection = 0;

  for (const o of offerings) {
    const dir = departmentDirFor(o.program);
    if (!dir) {
      droppedNoDept++;
      continue;
    }
    if (!sectionsByDept.get(dir)?.has(sectionKeyOf(o.class_year, o.section))) {
      droppedNoSection++;
      continue;
    }
    if (!offeringsByDept.has(dir)) offeringsByDept.set(dir, []);
    offeringsByDept.get(dir)!.push(o);
  }

  // ── collapse the export's duplicate offerings ───────────────────────────
  // The registry sometimes carries one class twice under two course_ids (typically one of
  // the pair holding the whole roster and the other none). They are the same class, so the
  // importer would collapse them anyway — but it can only keep one course_id, and any
  // enrolment loaded against the other would then have nowhere to go. Merge them HERE,
  // where the rosters are still in hand, and remap the losing id.
  const canonicalOfferingId = new Map<string, string>();
  let mergedDuplicates = 0;

  for (const [dir, kept] of offeringsByDept) {
    const byClass = new Map<string, RawOffering[]>();
    for (const o of kept) {
      const key = [o.course_code, o.instructor, o.class_year, o.section].join("|").toLowerCase();
      byClass.set(key, [...(byClass.get(key) ?? []), o]);
    }
    const deduped: RawOffering[] = [];
    for (const group of byClass.values()) {
      // Keep whichever id the registry actually attached students to; ties break on the id
      // so a re-run of this script produces byte-identical files.
      const winner = [...group].sort((a, b) => {
        const byRoster = (grades[b.course_id]?.students.length ?? 0) - (grades[a.course_id]?.students.length ?? 0);
        return byRoster !== 0 ? byRoster : a.course_id.localeCompare(b.course_id);
      })[0];
      for (const o of group) {
        canonicalOfferingId.set(o.course_id, winner.course_id);
        if (o.course_id !== winner.course_id) mergedDuplicates++;
      }
      deduped.push(winner);
    }
    offeringsByDept.set(dir, deduped);
  }

  // ── enrolments, from the roster attached to each kept offering ──────────
  const enrollmentsByDept = new Map<string, [string, string][]>();
  let droppedUnknownStudent = 0;

  for (const [dir, kept] of offeringsByDept) {
    const knownStudents = studentIdsByDept.get(dir)!;
    const keptIds = new Set(kept.map((o) => o.course_id));
    const seen = new Set<string>();
    const pairs: [string, string][] = [];
    // Walk every ORIGINAL course_id, not just the kept ones, so a roster that hung off a
    // merged-away duplicate still reaches its class under the canonical id.
    for (const [courseId, roster] of Object.entries(grades)) {
      const canonical = canonicalOfferingId.get(courseId);
      if (!canonical || !keptIds.has(canonical)) continue;
      for (const enrolled of roster.students) {
        if (!knownStudents.has(enrolled.id_number)) {
          droppedUnknownStudent++;
          continue;
        }
        const key = `${canonical}||${enrolled.id_number}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push([canonical, enrolled.id_number]);
      }
    }
    pairs.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    enrollmentsByDept.set(dir, pairs);
  }

  // ── write ──────────────────────────────────────────────────────────────
  for (const [dir, deptStudents] of studentsByDept) {
    const dirPath = join(outRoot, dir);
    mkdirSync(dirPath, { recursive: true });

    writeCsv(
      join(dirPath, "students.csv"),
      ["student_id", "name", "email", "phone", "program", "class_year", "section"],
      deptStudents.map((s) => [
        s.id_number,
        s.name,
        s.email,
        s.mobile ?? "",
        scheduleFor(s.program),
        s.class_year,
        s.section,
      ]),
    );

    const deptOfferings = offeringsByDept.get(dir) ?? [];
    writeCsv(
      join(dirPath, "offerings.csv"),
      ["offering_id", "course_code", "course_title", "instructor_name", "instructor_email", "class_year", "section"],
      deptOfferings.map((o) => [
        o.course_id,
        o.course_code,
        o.course_name,
        o.instructor,
        "", // deliberately blank — see the header comment
        o.class_year,
        o.section,
      ]),
    );

    const deptEnrollments = enrollmentsByDept.get(dir) ?? [];
    writeCsv(join(dirPath, "enrollments.csv"), ["offering_id", "student_id"], deptEnrollments.map(([a, b]) => [a, b]));

    console.log(
      `  ${dir}: ${deptStudents.length} students · ${sectionsByDept.get(dir)!.size} sections · ` +
        `${deptOfferings.length} offerings · ${deptEnrollments.length} enrolments`,
    );
  }

  console.log(
    `Dropped: ${unmappedStudents} students outside CSE/SE undergraduate, ` +
      `${droppedNoDept} offerings outside those programs, ` +
      `${droppedNoSection} offerings with no matching section, ` +
      `${mergedDuplicates} duplicate offering(s) merged, ` +
      `${droppedUnknownStudent} enrolments for students not in the roster.`,
  );
}

main();
