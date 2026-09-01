/**
 * Pure parsing and classification for the three registry CSVs a department head loads each
 * semester — students, offerings, enrollments. No Prisma dependency, so the whole ladder is
 * unit-testable; the service layer supplies what already exists in the database and does
 * nothing but write the rows this file marks `create` or `update`.
 *
 * Same discipline as csv-validation.ts: dry-run and commit call these functions with the
 * same inputs, so "what commit will do" can never drift from "what the preview showed".
 *
 * ── The file formats ───────────────────────────────────────────────────────
 *
 *   students.csv     student_id, name, email, phone, program, class_year, section
 *   offerings.csv    offering_id, course_code, course_title, instructor_name,
 *                    instructor_email, class_year, section
 *   enrollments.csv  offering_id, student_id
 *
 * Column ORDER is irrelevant and unknown columns are ignored — the registry exports carry
 * plenty of fields (marks, grades, birth dates) that this system has no business storing.
 * The semester is chosen in the UI, never taken from a file: one upload is one semester,
 * and a mislabelled column must not be able to write into the wrong term.
 */

export type RowAction = "create" | "update" | "skip" | "error";

export interface ParsedRow {
  row: number;
  values: Record<string, string>;
}

function parseLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      fields.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur.trim());
  return fields;
}

/**
 * Header-addressed CSV parse. Unlike csv-validation.ts's positional `parseCsv`, this keeps
 * every column by name so each importer can require only the columns it needs and ignore
 * the rest of a wide registry export.
 */
export function parseNamedCsv(text: string, required: readonly string[]): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error("The file is empty");

  const header = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  for (const col of required) {
    if (!header.includes(col)) throw new Error(`Missing required column: ${col}`);
  }

  return lines.slice(1).map((line, i) => {
    const fields = parseLine(line);
    const values: Record<string, string> = {};
    header.forEach((h, idx) => {
      values[h] = fields[idx] ?? "";
    });
    return { row: i + 1, values };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// students.csv
// ─────────────────────────────────────────────────────────────────────────

export const STUDENT_COLUMNS = ["student_id", "name", "email", "class_year", "section"] as const;

export interface StudentRowClassification {
  row: number;
  action: RowAction;
  studentId: string;
  name: string;
  email: string;
  phone: string | null;
  program: "REGULAR" | "WEEKEND" | "EXTENSION";
  classYear: string;
  section: string;
  problem: string | null;
}

export interface ExistingStudent {
  id: string;
  /** Matched on either key: a student may already exist from a people CSV (email only). */
  externalId: string | null;
  emailLower: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeProgram(raw: string): "REGULAR" | "WEEKEND" | "EXTENSION" | null {
  const t = raw.trim().toUpperCase();
  if (!t) return "REGULAR";
  if (t === "REGULAR" || t === "WEEKEND" || t === "EXTENSION") return t;
  return null;
}

export function classifyStudentRows(
  rows: ParsedRow[],
  existing: { byExternalId: Map<string, ExistingStudent>; byEmail: Map<string, ExistingStudent> },
): StudentRowClassification[] {
  const seenIds = new Map<string, number>();
  const seenEmails = new Map<string, number>();
  const out: StudentRowClassification[] = [];

  for (const r of rows) {
    const v = r.values;
    const studentId = (v.student_id ?? "").trim();
    const name = (v.name ?? "").trim();
    const email = (v.email ?? "").trim();
    const classYear = (v.class_year ?? "").trim();
    const section = (v.section ?? "").trim();
    const program = normalizeProgram(v.program ?? "");
    const base = {
      row: r.row,
      studentId,
      name,
      email,
      phone: (v.phone ?? "").trim() || null,
      program: program ?? ("REGULAR" as const),
      classYear,
      section,
    };

    if (!studentId) {
      out.push({ ...base, action: "error", problem: "student_id is required — it is what makes a re-import update rather than duplicate" });
      continue;
    }
    if (!name) {
      out.push({ ...base, action: "error", problem: "name is required" });
      continue;
    }
    if (!email || !EMAIL_RE.test(email)) {
      out.push({ ...base, action: "error", problem: email ? "Not a valid email address" : "email is required" });
      continue;
    }
    if (!classYear || !section) {
      out.push({ ...base, action: "error", problem: "class_year and section are both required — together they identify the section" });
      continue;
    }
    if (program == null) {
      out.push({ ...base, action: "error", problem: `Unknown program '${v.program}' — expected REGULAR, WEEKEND or EXTENSION` });
      continue;
    }

    const emailLower = email.toLowerCase();
    const dupeId = seenIds.get(studentId);
    if (dupeId != null) {
      out.push({ ...base, action: "skip", problem: `Duplicate of row ${dupeId} in this file` });
      continue;
    }
    const dupeEmail = seenEmails.get(emailLower);
    if (dupeEmail != null) {
      out.push({ ...base, action: "error", problem: `Row ${dupeEmail} already uses this email for a different student id` });
      continue;
    }
    seenIds.set(studentId, r.row);
    seenEmails.set(emailLower, r.row);

    const byId = existing.byExternalId.get(studentId);
    const byEmail = existing.byEmail.get(emailLower);
    if (byId && byEmail && byId.id !== byEmail.id) {
      out.push({ ...base, action: "error", problem: "This student id and this email already belong to two different people" });
      continue;
    }
    if (byId || byEmail) {
      out.push({ ...base, action: "update", problem: "Already on file — details and section will be updated" });
      continue;
    }
    out.push({ ...base, action: "create", problem: null });
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// offerings.csv
// ─────────────────────────────────────────────────────────────────────────

export const OFFERING_COLUMNS = ["course_code", "course_title", "instructor_name", "class_year", "section"] as const;

export interface OfferingRowClassification {
  row: number;
  action: RowAction;
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  instructorName: string;
  /** As supplied, or as proposed when the file leaves it blank. */
  instructorEmail: string;
  /** True when nothing in the file gave us this address — the head must confirm it. */
  instructorEmailProposed: boolean;
  classYear: string;
  section: string;
  problem: string | null;
}

export interface OfferingContext {
  /** Section groups that already exist, keyed `classYear||section`. */
  sectionKeys: Set<string>;
  /** Staff already on file, keyed by lowercased email. */
  staffByEmail: Set<string>;
  /** Offerings already imported for this semester, keyed by externalId. */
  existingExternalIds: Set<string>;
}

export function sectionKey(classYear: string, section: string): string {
  return `${classYear.trim().toLowerCase()}||${section.trim().toLowerCase()}`;
}

/**
 * A synthetic offering id for a file that does not carry the registry's own. Deterministic
 * on the four things that identify an offering, so re-importing the same file twice still
 * updates one row instead of creating a second.
 */
export function syntheticOfferingId(input: {
  semesterId: string;
  courseCode: string;
  instructorEmail: string;
  classYear: string;
  section: string;
}): string {
  return [
    input.semesterId,
    input.courseCode.trim().toUpperCase(),
    input.instructorEmail.trim().toLowerCase(),
    input.classYear.trim().toLowerCase(),
    input.section.trim().toLowerCase(),
  ].join("|");
}

export function classifyOfferingRows(
  rows: ParsedRow[],
  ctx: OfferingContext,
  proposeEmail: (name: string) => string | null,
  semesterId: string,
): OfferingRowClassification[] {
  const seen = new Map<string, number>();
  const out: OfferingRowClassification[] = [];

  for (const r of rows) {
    const v = r.values;
    const courseCode = (v.course_code ?? "").trim();
    const courseTitle = (v.course_title ?? "").trim();
    const instructorName = (v.instructor_name ?? "").trim();
    const classYear = (v.class_year ?? "").trim();
    const section = (v.section ?? "").trim();
    const suppliedEmail = (v.instructor_email ?? "").trim();

    const proposed = suppliedEmail ? null : proposeEmail(instructorName);
    const instructorEmail = suppliedEmail || proposed || "";
    const base = {
      row: r.row,
      offeringId: (v.offering_id ?? "").trim(),
      courseCode,
      courseTitle,
      instructorName,
      instructorEmail,
      instructorEmailProposed: !suppliedEmail && proposed != null,
      classYear,
      section,
    };

    if (!courseCode || !courseTitle) {
      out.push({ ...base, action: "error", problem: "course_code and course_title are both required" });
      continue;
    }
    if (!instructorName) {
      out.push({ ...base, action: "error", problem: "instructor_name is required" });
      continue;
    }
    if (!instructorEmail || !EMAIL_RE.test(instructorEmail)) {
      out.push({
        ...base,
        action: "error",
        problem: "No usable instructor email — the registry export carries none, so supply one in the file",
      });
      continue;
    }
    if (!classYear || !section) {
      out.push({ ...base, action: "error", problem: "class_year and section are both required" });
      continue;
    }
    if (!ctx.sectionKeys.has(sectionKey(classYear, section))) {
      // Deliberately an error, not a silent create: a typo'd section would otherwise
      // manufacture an empty group and the offering would reach nobody at launch.
      out.push({ ...base, action: "error", problem: `No section "${classYear} · ${section}" — import students.csv first` });
      continue;
    }

    const id =
      base.offeringId ||
      syntheticOfferingId({ semesterId, courseCode, instructorEmail, classYear, section });
    const dupe = seen.get(id);
    if (dupe != null) {
      out.push({ ...base, offeringId: id, action: "skip", problem: `Duplicate of row ${dupe} in this file` });
      continue;
    }
    seen.set(id, r.row);

    const known = ctx.existingExternalIds.has(id);
    const problems: string[] = [];
    if (!ctx.staffByEmail.has(instructorEmail.toLowerCase())) {
      problems.push(base.instructorEmailProposed ? "New instructor — email proposed, will be invited" : "New instructor — will be invited");
    }
    out.push({
      ...base,
      offeringId: id,
      action: known ? "update" : "create",
      problem: problems.length > 0 ? problems.join("; ") : known ? "Already imported — will be updated" : null,
    });
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// enrollments.csv
// ─────────────────────────────────────────────────────────────────────────

export const ENROLLMENT_COLUMNS = ["offering_id", "student_id"] as const;

export interface EnrollmentRowClassification {
  row: number;
  action: RowAction;
  offeringId: string;
  studentId: string;
  problem: string | null;
}

export interface EnrollmentContext {
  knownOfferingIds: Set<string>;
  knownStudentIds: Set<string>;
  existingPairs: Set<string>;
}

export function enrollmentKey(offeringId: string, studentId: string): string {
  return `${offeringId}||${studentId}`;
}

export function classifyEnrollmentRows(
  rows: ParsedRow[],
  ctx: EnrollmentContext,
): EnrollmentRowClassification[] {
  const seen = new Map<string, number>();
  const out: EnrollmentRowClassification[] = [];

  for (const r of rows) {
    const offeringId = (r.values.offering_id ?? "").trim();
    const studentId = (r.values.student_id ?? "").trim();
    const base = { row: r.row, offeringId, studentId };

    if (!offeringId || !studentId) {
      out.push({ ...base, action: "error", problem: "offering_id and student_id are both required" });
      continue;
    }
    if (!ctx.knownOfferingIds.has(offeringId)) {
      out.push({ ...base, action: "error", problem: "No such offering — import offerings.csv first" });
      continue;
    }
    if (!ctx.knownStudentIds.has(studentId)) {
      out.push({ ...base, action: "error", problem: "No such student — import students.csv first" });
      continue;
    }

    const key = enrollmentKey(offeringId, studentId);
    const dupe = seen.get(key);
    if (dupe != null) {
      out.push({ ...base, action: "skip", problem: `Duplicate of row ${dupe} in this file` });
      continue;
    }
    seen.set(key, r.row);

    if (ctx.existingPairs.has(key)) {
      out.push({ ...base, action: "skip", problem: "Already enrolled" });
      continue;
    }
    out.push({ ...base, action: "create", problem: null });
  }

  return out;
}

export function summarize(rows: { action: RowAction }[]) {
  return {
    create: rows.filter((r) => r.action === "create").length,
    update: rows.filter((r) => r.action === "update").length,
    skip: rows.filter((r) => r.action === "skip").length,
    error: rows.filter((r) => r.action === "error").length,
  };
}
