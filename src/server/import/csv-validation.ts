/**
 * Pure CSV parsing and row classification — no Prisma dependency, so it's directly
 * unit-testable. The service layer supplies which emails already exist; everything
 * else (the create/update/skip/error ladder) lives here. Ported verbatim from v1's
 * import/csv-validation.ts.
 */

export interface ParsedCsvRow {
  row: number;
  name: string;
  email: string;
  phone: string | null;
  type: string;
}

const REQUIRED_COLUMNS = ["name", "email", "phone", "type"] as const;

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

export function parseCsv(text: string): ParsedCsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error("The file is empty");

  const header = parseLine(lines[0]).map((h) => h.toLowerCase());
  const index: Record<string, number> = {};
  for (const col of REQUIRED_COLUMNS) {
    const i = header.indexOf(col);
    if (i === -1) throw new Error(`Missing required column: ${col}`);
    index[col] = i;
  }

  return lines.slice(1).map((line, i) => {
    const fields = parseLine(line);
    return {
      row: i + 1,
      name: fields[index.name] ?? "",
      email: fields[index.email] ?? "",
      phone: fields[index.phone]?.trim() || null,
      type: (fields[index.type] ?? "").trim(),
    };
  });
}

export interface ExistingPerson {
  id: string;
  name: string;
}

export interface ImportRowClassification {
  row: number;
  action: "create" | "update" | "skip" | "error";
  name: string;
  email: string;
  phone: string | null;
  kind: "TEACHER" | "STUDENT" | null;
  problem: string | null;
}

function normalizeKind(type: string): "TEACHER" | "STUDENT" | null {
  const t = type.toLowerCase();
  if (t === "teacher") return "TEACHER";
  if (t === "student") return "STUDENT";
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The validation ladder: missing/malformed email, missing name, unrecognized type,
 * duplicate within the file, then whether the email already exists (update) or not
 * (create). Nothing here writes anything — dry-run and commit call the exact same
 * function, so "what commit will do" can never drift from "what the preview showed".
 */
export function classifyRows(
  rows: ParsedCsvRow[],
  existingByEmail: Map<string, ExistingPerson>,
): ImportRowClassification[] {
  const seenInFile = new Map<string, number>();
  const results: ImportRowClassification[] = [];

  for (const r of rows) {
    const displayName = r.name || "— missing —";
    const base = { row: r.row, name: displayName, email: r.email, phone: r.phone };

    if (!r.email) {
      results.push({ ...base, action: "error", kind: null, problem: "Email is required" });
      continue;
    }
    if (!EMAIL_RE.test(r.email)) {
      results.push({ ...base, action: "error", kind: null, problem: "Not a valid email address" });
      continue;
    }

    const emailLower = r.email.toLowerCase();
    const kind = normalizeKind(r.type);

    if (!r.name) {
      results.push({ ...base, action: "error", kind, problem: "Name is required" });
      continue;
    }
    if (!kind) {
      results.push({ ...base, action: "error", kind: null, problem: `Unknown type '${r.type}' — expected student or teacher` });
      continue;
    }

    const dupeRow = seenInFile.get(emailLower);
    if (dupeRow != null) {
      results.push({ ...base, action: "skip", kind, problem: `Duplicate of row ${dupeRow} in this file` });
      continue;
    }
    seenInFile.set(emailLower, r.row);

    if (existingByEmail.has(emailLower)) {
      results.push({ ...base, action: "update", kind, problem: "Already registered — details will be updated" });
      continue;
    }
    results.push({ ...base, action: "create", kind, problem: null });
  }

  return results;
}

export function summarizeCounts(rows: ImportRowClassification[]) {
  return {
    create: rows.filter((r) => r.action === "create").length,
    update: rows.filter((r) => r.action === "update").length,
    skip: rows.filter((r) => r.action === "skip").length,
    error: rows.filter((r) => r.action === "error").length,
  };
}
