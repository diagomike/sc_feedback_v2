import { describe, expect, it } from "vitest";
import { deriveStaffEmail } from "@/server/courses/course-logic";
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
  syntheticOfferingId,
  type ExistingStudent,
} from "./erp-parsing";

const SEMESTER = "sem_spring_2025";

function students(csv: string) {
  return parseNamedCsv(csv, STUDENT_COLUMNS);
}
function offerings(csv: string) {
  return parseNamedCsv(csv, OFFERING_COLUMNS);
}
function enrollments(csv: string) {
  return parseNamedCsv(csv, ENROLLMENT_COLUMNS);
}

const noStudents = { byExternalId: new Map<string, ExistingStudent>(), byEmail: new Map<string, ExistingStudent>() };

describe("parseNamedCsv", () => {
  it("addresses columns by name, so order does not matter", () => {
    const a = parseNamedCsv("student_id,name\n1,Abebe", ["student_id", "name"]);
    const b = parseNamedCsv("name,student_id\nAbebe,1", ["student_id", "name"]);
    expect(a[0].values).toEqual(b[0].values);
  });

  it("keeps unknown columns instead of rejecting them — registry exports are wide", () => {
    const rows = parseNamedCsv("student_id,name,mark,grade\n1,Abebe,69,B-", ["student_id", "name"]);
    expect(rows[0].values.grade).toBe("B-");
  });

  it("normalises header spacing and case", () => {
    const rows = parseNamedCsv("Student ID,NAME\n1,Abebe", ["student_id", "name"]);
    expect(rows[0].values.student_id).toBe("1");
  });

  it("handles quoted fields containing commas", () => {
    const rows = parseNamedCsv('student_id,name\n1,"Abate, Abebe"', ["student_id", "name"]);
    expect(rows[0].values.name).toBe("Abate, Abebe");
  });

  it("names the missing column rather than failing obscurely", () => {
    expect(() => parseNamedCsv("name\nAbebe", ["student_id", "name"])).toThrow(/student_id/);
    expect(() => parseNamedCsv("", ["name"])).toThrow(/empty/);
  });
});

describe("classifyStudentRows", () => {
  const header = "student_id,name,email,phone,program,class_year,section";

  it("creates a student the system has never seen", () => {
    const rows = classifyStudentRows(
      students(`${header}\nUGR/12345/17,Abel Tesfaye,abel.tesfaye@astu.edu.et,,REGULAR,Second Year,Section 1`),
      noStudents,
    );
    expect(rows[0].action).toBe("create");
    expect(rows[0].problem).toBeNull();
  });

  it("updates when the student id is already on file — this is what makes a re-import safe", () => {
    const existing: ExistingStudent = { id: "u1", externalId: "UGR/12345/17", emailLower: "abel.tesfaye@astu.edu.et" };
    const rows = classifyStudentRows(
      students(`${header}\nUGR/12345/17,Abel Tesfaye,abel.tesfaye@astu.edu.et,,REGULAR,Third Year,Section 2`),
      { byExternalId: new Map([["UGR/12345/17", existing]]), byEmail: new Map() },
    );
    expect(rows[0].action).toBe("update");
    expect(rows[0].classYear).toBe("Third Year");
  });

  it("updates a student who already exists from a people CSV, matched on email alone", () => {
    const existing: ExistingStudent = { id: "u1", externalId: null, emailLower: "abel.tesfaye@astu.edu.et" };
    const rows = classifyStudentRows(
      students(`${header}\nUGR/12345/17,Abel Tesfaye,abel.tesfaye@astu.edu.et,,REGULAR,Second Year,Section 1`),
      { byExternalId: new Map(), byEmail: new Map([["abel.tesfaye@astu.edu.et", existing]]) },
    );
    expect(rows[0].action).toBe("update");
  });

  it("refuses a row where the id and the email already belong to two different people", () => {
    const byId: ExistingStudent = { id: "u1", externalId: "UGR/1/17", emailLower: "one@astu.edu.et" };
    const byEmail: ExistingStudent = { id: "u2", externalId: "UGR/2/17", emailLower: "two@astu.edu.et" };
    const rows = classifyStudentRows(
      students(`${header}\nUGR/1/17,Someone,two@astu.edu.et,,REGULAR,Second Year,Section 1`),
      { byExternalId: new Map([["UGR/1/17", byId]]), byEmail: new Map([["two@astu.edu.et", byEmail]]) },
    );
    expect(rows[0].action).toBe("error");
    expect(rows[0].problem).toMatch(/two different people/);
  });

  it("requires the section coordinates, since they are the group identity", () => {
    const rows = classifyStudentRows(
      students(`${header}\nUGR/1/17,Someone,one@astu.edu.et,,REGULAR,,Section 1`),
      noStudents,
    );
    expect(rows[0].action).toBe("error");
    expect(rows[0].problem).toMatch(/class_year and section/);
  });

  it("defaults a blank program to REGULAR but rejects an unrecognised one", () => {
    const ok = classifyStudentRows(students(`${header}\nUGR/1/17,A,a@astu.edu.et,,,Second Year,Section 1`), noStudents);
    expect(ok[0].action).toBe("create");
    expect(ok[0].program).toBe("REGULAR");

    const bad = classifyStudentRows(students(`${header}\nUGR/2/17,B,b@astu.edu.et,,EVENING,Second Year,Section 1`), noStudents);
    expect(bad[0].action).toBe("error");
    expect(bad[0].problem).toMatch(/EVENING/);
  });

  it("skips a repeated student id but errors on a reused email", () => {
    const rows = classifyStudentRows(
      students(
        `${header}\n` +
          `UGR/1/17,A,a@astu.edu.et,,REGULAR,Second Year,Section 1\n` +
          `UGR/1/17,A,a@astu.edu.et,,REGULAR,Second Year,Section 1\n` +
          `UGR/2/17,B,a@astu.edu.et,,REGULAR,Second Year,Section 1`,
      ),
      noStudents,
    );
    expect(rows[1].action).toBe("skip");
    expect(rows[2].action).toBe("error");
    expect(rows[2].problem).toMatch(/different student id/);
  });
});

describe("classifyOfferingRows", () => {
  const header = "offering_id,course_code,course_title,instructor_name,instructor_email,class_year,section";
  const ctx = {
    sectionKeys: new Set([sectionKey("Second Year", "Section 1")]),
    staffByEmail: new Set(["asnake.emana@astu.edu.et"]),
    existingExternalIds: new Set<string>(),
  };

  it("creates an offering against a known section", () => {
    const rows = classifyOfferingRows(
      offerings(
        `${header}\nKp2g9xJXMd,MATH2207,Discrete mathematics,Asnake Emana,asnake.emana@astu.edu.et,Second Year,Section 1`,
      ),
      ctx,
      deriveStaffEmail,
      SEMESTER,
    );
    expect(rows[0].action).toBe("create");
    expect(rows[0].offeringId).toBe("Kp2g9xJXMd");
    expect(rows[0].instructorEmailProposed).toBe(false);
  });

  it("proposes an address when the registry export leaves instructor_email blank, and says so", () => {
    const rows = classifyOfferingRows(
      offerings(`${header}\nX1,MATH2207,Discrete mathematics,Dr.Endris Mohammed Ali,,Second Year,Section 1`),
      ctx,
      deriveStaffEmail,
      SEMESTER,
    );
    expect(rows[0].instructorEmail).toBe("endris.mohammed@astu.edu.et");
    expect(rows[0].instructorEmailProposed).toBe(true);
    // Flagged for review rather than quietly accepted — a guessed address is about to
    // receive an invitation.
    expect(rows[0].problem).toMatch(/email proposed/);
  });

  it("errors rather than inventing a section that does not exist", () => {
    const rows = classifyOfferingRows(
      offerings(`${header}\nX1,MATH2207,Discrete mathematics,Asnake Emana,asnake.emana@astu.edu.et,Ninth Year,Section 9`),
      ctx,
      deriveStaffEmail,
      SEMESTER,
    );
    expect(rows[0].action).toBe("error");
    expect(rows[0].problem).toMatch(/import students.csv first/);
  });

  it("marks a re-import of the same registry id as an update, not a second offering", () => {
    const rows = classifyOfferingRows(
      offerings(`${header}\nKp2g9xJXMd,MATH2207,Discrete mathematics,Asnake Emana,asnake.emana@astu.edu.et,Second Year,Section 1`),
      { ...ctx, existingExternalIds: new Set(["Kp2g9xJXMd"]) },
      deriveStaffEmail,
      SEMESTER,
    );
    expect(rows[0].action).toBe("update");
  });

  it("derives a stable id when the file carries no offering_id, so re-import still updates", () => {
    const csv = `${header}\n,MATH2207,Discrete mathematics,Asnake Emana,asnake.emana@astu.edu.et,Second Year,Section 1`;
    const first = classifyOfferingRows(offerings(csv), ctx, deriveStaffEmail, SEMESTER);
    const id = first[0].offeringId;
    expect(id).toBe(
      syntheticOfferingId({
        semesterId: SEMESTER,
        courseCode: "MATH2207",
        instructorEmail: "asnake.emana@astu.edu.et",
        classYear: "Second Year",
        section: "Section 1",
      }),
    );

    const second = classifyOfferingRows(offerings(csv), { ...ctx, existingExternalIds: new Set([id]) }, deriveStaffEmail, SEMESTER);
    expect(second[0].action).toBe("update");
  });

  it("puts the same offering in two different semesters at two different ids", () => {
    const csv = `${header}\n,MATH2207,Discrete mathematics,Asnake Emana,asnake.emana@astu.edu.et,Second Year,Section 1`;
    const spring = classifyOfferingRows(offerings(csv), ctx, deriveStaffEmail, "sem_spring")[0].offeringId;
    const fall = classifyOfferingRows(offerings(csv), ctx, deriveStaffEmail, "sem_fall")[0].offeringId;
    expect(spring).not.toBe(fall);
  });

  it("skips a duplicated row within one file", () => {
    const line = `Kp2g9xJXMd,MATH2207,Discrete mathematics,Asnake Emana,asnake.emana@astu.edu.et,Second Year,Section 1`;
    const rows = classifyOfferingRows(offerings(`${header}\n${line}\n${line}`), ctx, deriveStaffEmail, SEMESTER);
    expect(rows[0].action).toBe("create");
    expect(rows[1].action).toBe("skip");
  });
});

describe("classifyEnrollmentRows", () => {
  const header = "offering_id,student_id";
  const ctx = {
    knownOfferingIds: new Set(["Kp2g9xJXMd"]),
    knownStudentIds: new Set(["UGR/12345/17"]),
    existingPairs: new Set<string>(),
  };

  it("creates an enrolment when both ends exist", () => {
    const rows = classifyEnrollmentRows(enrollments(`${header}\nKp2g9xJXMd,UGR/12345/17`), ctx);
    expect(rows[0].action).toBe("create");
  });

  it("names which end is missing rather than failing the whole file", () => {
    const rows = classifyEnrollmentRows(
      enrollments(`${header}\nGHOST,UGR/12345/17\nKp2g9xJXMd,UGR/99999/17`),
      ctx,
    );
    expect(rows[0].problem).toMatch(/offerings.csv first/);
    expect(rows[1].problem).toMatch(/students.csv first/);
    expect(summarize(rows).error).toBe(2);
  });

  it("skips an enrolment that already exists — re-import is a no-op, not a conflict", () => {
    const rows = classifyEnrollmentRows(enrollments(`${header}\nKp2g9xJXMd,UGR/12345/17`), {
      ...ctx,
      existingPairs: new Set([enrollmentKey("Kp2g9xJXMd", "UGR/12345/17")]),
    });
    expect(rows[0].action).toBe("skip");
    expect(rows[0].problem).toBe("Already enrolled");
  });
});
