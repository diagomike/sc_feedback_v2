import { describe, expect, it } from "vitest";
import {
  COURSE_PREFIX_DEPARTMENTS,
  coursePrefix,
  departmentNameForCourseCode,
  deriveStaffEmail,
  normalizePersonName,
  offeringKeyOf,
  parseRegistryProgram,
  personMatchKey,
  sectionGroupName,
  stripHonorific,
  subjectShortCode,
} from "./course-logic";

/**
 * Every input string in this file is a real one taken from the 2025/26 registry export
 * (D:\py_yaddessa\real_data) — the doubled spaces, the glued-on title and the two
 * different program spellings all occur there.
 */

describe("normalizePersonName", () => {
  it("collapses the doubled spaces the export is full of", () => {
    expect(normalizePersonName("Ejigu  Tefera  H/Maraim")).toBe("Ejigu Tefera H/Maraim");
    expect(normalizePersonName("Tagel   Aboneh Weldu")).toBe("Tagel Aboneh Weldu");
    expect(normalizePersonName("  Daniel Mitiku  ")).toBe("Daniel Mitiku");
  });

  it("gives a glued-on title its space back but keeps the title", () => {
    expect(normalizePersonName("Dr.Endris Mohammed Ali")).toBe("Dr. Endris Mohammed Ali");
    expect(normalizePersonName("Dr. Worku Jifara")).toBe("Dr. Worku Jifara");
  });
});

describe("stripHonorific", () => {
  it("removes a leading title in any of its spellings", () => {
    expect(stripHonorific("Dr. Worku Jifara")).toBe("Worku Jifara");
    expect(stripHonorific("Dr.Endris Mohammed Ali")).toBe("Endris Mohammed Ali");
    expect(stripHonorific("Prof. Miftah Shifera")).toBe("Miftah Shifera");
    expect(stripHonorific("Mr Bekele Dinku")).toBe("Bekele Dinku");
  });

  it("removes stacked titles", () => {
    expect(stripHonorific("Dr. Eng. Solomon Girma")).toBe("Solomon Girma");
  });

  it("leaves an untitled name alone", () => {
    expect(stripHonorific("Megersa Daraje")).toBe("Megersa Daraje");
  });
});

describe("deriveStaffEmail", () => {
  it("builds first.last@astu.edu.et from the first two name tokens", () => {
    expect(deriveStaffEmail("Asnake Emana")).toBe("asnake.emana@astu.edu.et");
    expect(deriveStaffEmail("Bushira Ali yassin")).toBe("bushira.ali@astu.edu.et");
  });

  it("ignores the title", () => {
    expect(deriveStaffEmail("Dr. Mesfin Abebe Haile")).toBe("mesfin.abebe@astu.edu.et");
    expect(deriveStaffEmail("Dr.Endris Mohammed Ali")).toBe("endris.mohammed@astu.edu.et");
  });

  it("treats punctuation inside a name as a separator, not a character", () => {
    expect(deriveStaffEmail("Ejigu  Tefera  H/Maraim")).toBe("ejigu.tefera@astu.edu.et");
  });

  it("falls back to a single token when that is all there is", () => {
    expect(deriveStaffEmail("Nemerra")).toBe("nemerra@astu.edu.et");
  });

  it("returns null rather than a broken address when there is no name", () => {
    expect(deriveStaffEmail("   ")).toBeNull();
    expect(deriveStaffEmail("Dr.")).toBeNull();
  });
});

describe("personMatchKey", () => {
  it("makes spacing, case and title differences match", () => {
    expect(personMatchKey("Dr.Endris Mohammed Ali")).toBe(personMatchKey("Endris  Mohammed  ali"));
    expect(personMatchKey("Wengelawit  Alemu  Assefa")).toBe(personMatchKey("Wengelawit Alemu Assefa"));
  });

  it("does NOT make genuinely different spellings match — those need an alias entry", () => {
    expect(personMatchKey("Bushira Ali yassin")).not.toBe(personMatchKey("Bushra Ali"));
  });
});

describe("parseRegistryProgram", () => {
  it("parses the gradebook spelling", () => {
    expect(parseRegistryProgram("Software Engineering (Undergraduate Regular)")).toEqual({
      subject: "Software Engineering",
      level: "UNDERGRADUATE",
      schedule: "REGULAR",
    });
    expect(parseRegistryProgram("Computer Science and Engineering (Undergraduate Extension)")).toEqual({
      subject: "Computer Science and Engineering",
      level: "UNDERGRADUATE",
      schedule: "EXTENSION",
    });
  });

  it("parses the student-list spelling into the same result", () => {
    expect(parseRegistryProgram("Undergraduate Regular Software Engineering")).toEqual(
      parseRegistryProgram("Software Engineering (Undergraduate Regular)"),
    );
  });

  it("parses the postgraduate and PhD variants", () => {
    expect(parseRegistryProgram("Artificial Intelligence (PhD Regular)")).toEqual({
      subject: "Artificial Intelligence",
      level: "PHD",
      schedule: "REGULAR",
    });
    expect(parseRegistryProgram("Computer Science & Engineering (Data Science ) (Postgraduate Regular)")).toEqual({
      subject: "Computer Science & Engineering Data Science",
      level: "POSTGRADUATE",
      schedule: "REGULAR",
    });
  });

  it("returns null for a label carrying neither a level nor a schedule", () => {
    expect(parseRegistryProgram("Software Engineering")).toBeNull();
    expect(parseRegistryProgram("")).toBeNull();
  });
});

describe("subjectShortCode", () => {
  it("initialises the significant words only", () => {
    expect(subjectShortCode("Computer Science and Engineering")).toBe("CSE");
    expect(subjectShortCode("Software Engineering")).toBe("SE");
    expect(subjectShortCode("Computer Science & Engineering")).toBe("CSE");
  });
});

describe("sectionGroupName", () => {
  it("is stable for the same registry coordinates, which is what makes re-import idempotent", () => {
    const a = sectionGroupName({ shortCode: "CSE", classYear: "Third Year", section: "Section 4" });
    const b = sectionGroupName({ shortCode: "CSE", classYear: " Third Year ", section: "Section 4 " });
    expect(a).toBe("CSE · Third Year · Section 4");
    expect(b).toBe(a);
  });

  it("omits an absent short code rather than leaving a dangling separator", () => {
    expect(sectionGroupName({ classYear: "Second Year", section: "Section 1" })).toBe(
      "Second Year · Section 1",
    );
  });
});

describe("course codes", () => {
  it("reads the prefix case-insensitively", () => {
    expect(coursePrefix("MATH2207")).toBe("MATH");
    expect(coursePrefix("Math2201")).toBe("MATH");
    expect(coursePrefix("CSEG3202")).toBe("CSEG");
  });

  it("maps a known prefix to the owning department", () => {
    expect(departmentNameForCourseCode("CSEG3202")).toBe("Computer Science & Engineering");
    expect(departmentNameForCourseCode("Math2201")).toBe("Applied Mathematics");
  });

  it("returns null for an unmodelled service subject rather than failing", () => {
    expect(departmentNameForCourseCode("SOSC1011")).toBeNull();
    expect(departmentNameForCourseCode("IETP3201")).toBeNull();
    expect(departmentNameForCourseCode("")).toBeNull();
  });

  it("accepts an overridden map", () => {
    expect(departmentNameForCourseCode("SOSC1011", { ...COURSE_PREFIX_DEPARTMENTS, SOSC: "Social Sciences" })).toBe(
      "Social Sciences",
    );
  });
});

describe("offeringKeyOf", () => {
  it("turns a missing offering into the empty discriminator, never null", () => {
    expect(offeringKeyOf(null)).toBe("");
    expect(offeringKeyOf(undefined)).toBe("");
    expect(offeringKeyOf("off_123")).toBe("off_123");
  });
});
