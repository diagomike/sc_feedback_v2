/**
 * Pure logic for turning registry exports into course/section identities — no Prisma
 * dependency, so it is directly unit-testable (the repo convention every other
 * `*-logic.ts` follows).
 *
 * Everything here exists because the registry's own strings are not clean:
 *
 *  - instructor names arrive with doubled spaces ("Ejigu  Tefera  H/Maraim"), missing
 *    spaces after a title ("Dr.Endris Mohammed Ali"), and inconsistent spellings of the
 *    same person across files ("Bushira Ali yassin" vs "Bushra Ali");
 *  - no staff email exists anywhere in the export, so one has to be proposed and reviewed;
 *  - the program label is written two different ways depending on which endpoint produced
 *    it ("Software Engineering (Undergraduate Regular)" from the gradebook,
 *    "Undergraduate Regular Software Engineering" from the student list) and encodes both
 *    the subject and the class schedule in one string.
 */

export const EMAIL_DOMAIN = "astu.edu.et";

const HONORIFICS = ["prof", "dr", "mr", "mrs", "ms", "eng", "ato", "w/ro", "wro"];

/**
 * Display form of a person's name: whitespace collapsed and a title given its missing
 * space back ("Dr.Endris" → "Dr. Endris"). The title is deliberately KEPT — it is part of
 * how the university writes a name on a letter.
 */
export function normalizePersonName(raw: string): string {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  // "Dr.Endris" / "Prof.Alemu" — a title glued to the first name.
  return collapsed.replace(
    new RegExp(`^(${HONORIFICS.map((h) => h.replace(/\//g, "\\/")).join("|")})\\.(?=\\S)`, "i"),
    (m) => `${m} `,
  );
}

/** The same name without its title — the form used to derive an email or a match key. */
export function stripHonorific(raw: string): string {
  let name = normalizePersonName(raw);
  // Loop: "Dr. Eng. Solomon" carries two.
  for (;;) {
    const next = name.replace(
      // `(\s+|$)` and not just `\s+` so a name that is NOTHING but a title ("Dr.") strips
      // to empty and deriveStaffEmail returns null, rather than proposing dr@astu.edu.et.
      new RegExp(`^(${HONORIFICS.map((h) => h.replace(/\//g, "\\/")).join("|")})\\.?(\\s+|$)`, "i"),
      "",
    );
    if (next === name) return name.trim();
    name = next;
  }
}

/** Letter-only tokens of a name, lowercased. "Ejigu  Tefera  H/Maraim" → ejigu,tefera,h,maraim */
function nameTokens(raw: string): string[] {
  return stripHonorific(raw)
    .split(/[^A-Za-z]+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase());
}

/**
 * The address the registry does not give us: first.last@astu.edu.et. Verified against all
 * 103 instructors in the 2025/26 export — zero collisions — but it is still a GUESS, so
 * every caller must surface it for review before an invitation is sent.
 */
export function deriveStaffEmail(rawName: string, domain = EMAIL_DOMAIN): string | null {
  const tokens = nameTokens(rawName);
  if (tokens.length === 0) return null;
  const local = tokens.length === 1 ? tokens[0] : `${tokens[0]}.${tokens[1]}`;
  return `${local}@${domain}`;
}

/**
 * Comparison key for "is this the same person". Ignores title, case, punctuation and
 * spacing, which handles the doubled-space and "Dr.X" cases on its own. It does NOT handle
 * genuinely different spellings ("Bushira Ali yassin" vs "Bushra Ali") — those need an
 * explicit alias entry, which is why the importer reports unmatched names rather than
 * guessing.
 */
export function personMatchKey(rawName: string): string {
  return nameTokens(rawName).join("");
}

export type ScheduleProgram = "REGULAR" | "WEEKEND" | "EXTENSION";
export type StudyLevel = "UNDERGRADUATE" | "POSTGRADUATE" | "PHD";

export interface RegistryProgram {
  /** "Computer Science and Engineering", "Software Engineering", … */
  subject: string;
  level: StudyLevel;
  /** Maps onto StudentGroup.program, which is descriptive metadata only. */
  schedule: ScheduleProgram;
}

const LEVEL_WORDS: [RegExp, StudyLevel][] = [
  [/\bphd\b/i, "PHD"],
  [/\bpost\s*graduate\b/i, "POSTGRADUATE"],
  [/\bundergraduate\b/i, "UNDERGRADUATE"],
];

const SCHEDULE_WORDS: [RegExp, ScheduleProgram][] = [
  [/\bextension\b/i, "EXTENSION"],
  [/\b(weekend|evening)\b/i, "WEEKEND"],
  [/\bregular\b/i, "REGULAR"],
];

/**
 * Parses either shape the registry emits:
 *   "Software Engineering (Undergraduate Regular)"        — gradebook
 *   "Undergraduate Regular Software Engineering"          — student list
 * Returns null only when neither a level nor a schedule word is present, which in the real
 * export never happens.
 */
export function parseRegistryProgram(label: string): RegistryProgram | null {
  const text = label.replace(/\s+/g, " ").trim();
  if (!text) return null;

  const level = LEVEL_WORDS.find(([re]) => re.test(text))?.[1] ?? null;
  const schedule = SCHEDULE_WORDS.find(([re]) => re.test(text))?.[1] ?? null;
  if (level == null && schedule == null) return null;

  let subject = text;
  for (const [re] of [...LEVEL_WORDS, ...SCHEDULE_WORDS]) subject = subject.replace(re, " ");
  subject = subject
    .replace(/\(\s*\)/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    subject,
    level: level ?? "UNDERGRADUATE",
    schedule: schedule ?? "REGULAR",
  };
}

/**
 * Short label for a subject, used in a section's display name so a campaign builder
 * reaching another department's section reads unambiguously.
 * "Computer Science and Engineering" → "CSE"; "Software Engineering" → "SE".
 */
export function subjectShortCode(subject: string): string {
  const words = subject
    .replace(/&/g, "and")
    .split(/[^A-Za-z]+/)
    .filter((w) => w.length > 0 && !/^(and|of|the|in|for)$/i.test(w));
  if (words.length === 0) return subject.trim().toUpperCase();
  return words.map((w) => w[0].toUpperCase()).join("");
}

/**
 * A section's display name. The class year and section come straight from the registry, so
 * the same section always produces the same name — which is what lets a re-import match an
 * existing group rather than creating a second one.
 */
export function sectionGroupName(input: {
  shortCode?: string | null;
  classYear: string;
  section: string;
}): string {
  const parts = [input.shortCode?.trim() || null, input.classYear.trim(), input.section.trim()];
  return parts.filter(Boolean).join(" · ");
}

/** Leading alphabetic part of a course code: "MATH2207" → "MATH", "Math2201" → "MATH". */
export function coursePrefix(code: string): string {
  const match = code.trim().match(/^[A-Za-z]+/);
  return match ? match[0].toUpperCase() : "";
}

/**
 * Which department owns a subject, by course-code prefix. Keyed by HierarchyNode.name
 * rather than by any seed-specific id so the mapping survives a re-seed and can be read by
 * an administrator.
 *
 * A prefix that is not listed resolves to null and the course imports unowned — a service
 * subject the university has not modelled as a node must never fail a whole file. Note this
 * only decides which department OWNS the subject; who may evaluate the teacher is decided
 * by the teacher's own membership, and who may run a campaign against a section is decided
 * by the offering (see campaigns.ts).
 */
export const COURSE_PREFIX_DEPARTMENTS: Record<string, string> = {
  CSEG: "Computer Science & Engineering",
  SENG: "Software Engineering",
  MATH: "Applied Mathematics",
  ECEG: "Electrical Power & Control Eng.",
};

export function departmentNameForCourseCode(
  code: string,
  map: Record<string, string> = COURSE_PREFIX_DEPARTMENTS,
): string | null {
  return map[coursePrefix(code)] ?? null;
}

/**
 * The non-null discriminator that keeps ResponseTask/Response uniqueness working. Postgres
 * treats NULLs in a unique constraint as distinct, so a nullable offering id in the key
 * would silently stop deduplicating peer and head rows — the ones with no offering at all.
 */
export function offeringKeyOf(courseOfferingId: string | null | undefined): string {
  return courseOfferingId ?? "";
}
