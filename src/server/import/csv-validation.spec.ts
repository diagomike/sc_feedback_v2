import { describe, it, expect } from "vitest";
import { parseCsv, classifyRows, summarizeCounts, type ExistingPerson } from "./csv-validation";

describe("parseCsv", () => {
  it("parses a well-formed file, matching columns regardless of order", () => {
    const rows = parseCsv("email,name,phone,type\na@x.com,Abel,+251911,student\nb@x.com,Bethlehem,,teacher");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ row: 1, name: "Abel", email: "a@x.com", phone: "+251911", type: "student" });
    expect(rows[1]).toEqual({ row: 2, name: "Bethlehem", email: "b@x.com", phone: null, type: "teacher" });
  });

  it("handles a quoted field containing a comma", () => {
    const rows = parseCsv('name,email,phone,type\n"Smith, Jr.",smith@x.com,,teacher');
    expect(rows[0].name).toBe("Smith, Jr.");
  });

  it("skips blank lines", () => {
    const rows = parseCsv("name,email,phone,type\na@x.com,Abel,,student\n\n\nb@x.com,Beth,,student");
    expect(rows).toHaveLength(2);
  });

  it("throws when a required column is missing", () => {
    expect(() => parseCsv("name,email,type\na,b,c")).toThrow(/Missing required column: phone/);
  });

  it("throws on an empty file", () => {
    expect(() => parseCsv("")).toThrow(/empty/);
  });
});

describe("classifyRows", () => {
  const noExisting = new Map<string, ExistingPerson>();

  it("creates a fresh, valid, unknown-email row", () => {
    const [result] = classifyRows(
      [{ row: 1, name: "Abel Tesfaye", email: "abel@astu.edu.et", phone: null, type: "student" }],
      noExisting,
    );
    expect(result).toMatchObject({ action: "create", kind: "STUDENT", problem: null });
  });

  it("updates a row whose email already exists in the system", () => {
    const existing = new Map<string, ExistingPerson>([["dagim.wolde@astu.edu.et", { id: "u1", name: "Dagim Wolde" }]]);
    const [result] = classifyRows(
      [{ row: 4, name: "Dagim Wolde", email: "dagim.wolde@astu.edu.et", phone: "+251934428890", type: "student" }],
      existing,
    );
    expect(result.action).toBe("update");
    expect(result.problem).toMatch(/already registered/i);
  });

  it("errors on a malformed email", () => {
    const [result] = classifyRows(
      [{ row: 3, name: "Chala Regassa", email: "chala.regassa@astu", phone: null, type: "student" }],
      noExisting,
    );
    expect(result).toMatchObject({ action: "error", problem: "Not a valid email address" });
  });

  it("errors on an unrecognized type, distinct from a missing-name error", () => {
    const [result] = classifyRows(
      [{ row: 5, name: "Eden Mulugeta", email: "eden@astu.edu.et", phone: null, type: "lecturer" }],
      noExisting,
    );
    expect(result.action).toBe("error");
    expect(result.problem).toMatch(/Unknown type 'lecturer'/);
  });

  it("errors on a missing name and labels it '— missing —' rather than a blank cell", () => {
    const [result] = classifyRows(
      [{ row: 8, name: "", email: "hanna.desta@astu.edu.et", phone: null, type: "student" }],
      noExisting,
    );
    expect(result).toMatchObject({ action: "error", name: "— missing —", problem: "Name is required" });
  });

  it("skips a later duplicate of an earlier valid row in the SAME file, naming that row", () => {
    const rows = classifyRows(
      [
        { row: 1, name: "Fikir Assefa", email: "fikir@astu.edu.et", phone: null, type: "student" },
        { row: 6, name: "Fikir Assefa", email: "fikir@astu.edu.et", phone: null, type: "student" },
      ],
      noExisting,
    );
    expect(rows[0].action).toBe("create");
    expect(rows[1]).toMatchObject({ action: "skip", problem: "Duplicate of row 1 in this file" });
  });

  it("matches duplicate emails case-insensitively", () => {
    const rows = classifyRows(
      [
        { row: 1, name: "A", email: "same@astu.edu.et", phone: null, type: "teacher" },
        { row: 2, name: "B", email: "SAME@astu.edu.et", phone: null, type: "teacher" },
      ],
      noExisting,
    );
    expect(rows[1].action).toBe("skip");
  });

  it("checks email validity before name, so a bad email never masquerades as a name problem", () => {
    const [result] = classifyRows([{ row: 1, name: "", email: "not-an-email", phone: null, type: "student" }], noExisting);
    expect(result.problem).toBe("Not a valid email address");
  });

  it("dry-run and commit share this function, so counts always match what was shown", () => {
    const rows = classifyRows(
      [
        { row: 1, name: "A", email: "a@x.com", phone: null, type: "student" },
        { row: 2, name: "B", email: "b@x.com", phone: null, type: "teacher" },
        { row: 3, name: "C", email: "not-an-email", phone: null, type: "student" },
        { row: 4, name: "A", email: "a@x.com", phone: null, type: "student" },
      ],
      noExisting,
    );
    expect(summarizeCounts(rows)).toEqual({ create: 2, update: 0, skip: 1, error: 1 });
  });
});
