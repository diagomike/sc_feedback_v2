import { describe, it, expect } from "vitest";
import {
  authorizeBareStudentGroups,
  authorizeOfferings,
  campaignMinNGate,
  effectiveMinResponses,
  teacherMinNGate,
  validateAudienceMinimums,
  validateWindow,
  templateSlotsForAssignedGroups,
  type AssignableOffering,
} from "./campaign-logic";
import { validateSemesterUniqueness } from "./semester-logic";

describe("effectiveMinResponses", () => {
  it("uses the shared campaign threshold for anonymous student and peer feedback", () => {
    expect(effectiveMinResponses("STUDENT", 5)).toBe(5);
    expect(effectiveMinResponses("PEER", 5)).toBe(5);
  });

  it("makes identified manager feedback visible after its one response", () => {
    expect(effectiveMinResponses("MANAGER", 5)).toBe(1);
  });
});

describe("campaignMinNGate", () => {
  it("is n/a when the only target group is MANAGER — a teacher has exactly one direct manager", () => {
    const result = campaignMinNGate([{ teacherId: "t1", completedAt: new Date() }], ["MANAGER"], 5);
    expect(result).toEqual({ ok: true, label: "n/a — identified" });
  });

  it("reports not started when there are no tasks yet", () => {
    expect(campaignMinNGate([], ["STUDENT"], 5)).toEqual({ ok: true, label: "not started" });
  });

  it("passes only teachers whose completed count clears minResponses", () => {
    const tasks = [
      { teacherId: "a", completedAt: new Date() },
      { teacherId: "a", completedAt: new Date() },
      { teacherId: "a", completedAt: null },
      { teacherId: "b", completedAt: new Date() },
    ];
    const result = campaignMinNGate(tasks, ["STUDENT"], 2);
    expect(result).toEqual({ ok: false, label: "1 of 2 teachers" });
  });

  it("is ok once every teacher clears the threshold", () => {
    const tasks = [
      { teacherId: "a", completedAt: new Date() },
      { teacherId: "a", completedAt: new Date() },
      { teacherId: "b", completedAt: new Date() },
      { teacherId: "b", completedAt: new Date() },
    ];
    expect(campaignMinNGate(tasks, ["STUDENT"], 2)).toEqual({ ok: true, label: "2 of 2 teachers" });
  });
});

describe("teacherMinNGate", () => {
  it("is n/a when every group used is MANAGER, even with zero responses", () => {
    expect(teacherMinNGate(new Map(), ["MANAGER"], 5)).toEqual({ ok: true, label: "n/a — identified" });
  });

  it("passes when every non-MANAGER group individually clears the threshold", () => {
    const done = new Map([
      ["STUDENT", 6],
      ["PEER", 5],
    ] as const);
    expect(teacherMinNGate(done, ["STUDENT", "PEER"], 5)).toEqual({ ok: true, label: "past min-N" });
  });

  it("fails if even one group is short, regardless of the others clearing it", () => {
    const done = new Map([
      ["STUDENT", 6],
      ["PEER", 2],
    ] as const);
    expect(teacherMinNGate(done, ["STUDENT", "PEER"], 5)).toEqual({ ok: false, label: "below min-N" });
  });

  it("ignores MANAGER when mixed with other groups — only the non-MANAGER groups gate", () => {
    const done = new Map([
      ["STUDENT", 6],
      ["MANAGER", 0],
    ] as const);
    expect(teacherMinNGate(done, ["STUDENT", "MANAGER"], 5)).toEqual({ ok: true, label: "past min-N" });
  });
});

describe("validateWindow", () => {
  const today = new Date("2026-08-21T00:00:00Z");

  it("passes when both dates are unset", () => {
    expect(validateWindow(null, null, today)).toBeNull();
  });

  it("allows opening today — 'today counts', not strictly future", () => {
    expect(validateWindow(today, null, today)).toBeNull();
  });

  it("rejects an opening date in the past", () => {
    expect(validateWindow(new Date("2026-08-20T00:00:00Z"), null, today)).toBe("Opening date can't be in the past");
  });

  it("rejects a closing date in the past", () => {
    expect(validateWindow(null, new Date("2026-08-20T00:00:00Z"), today)).toBe("Closing date can't be in the past");
  });

  it("rejects a closing date on or before the opening date", () => {
    const opensAt = new Date("2026-09-01T00:00:00Z");
    expect(validateWindow(opensAt, opensAt, today)).toBe("Closing date must be after the opening date");
    expect(validateWindow(opensAt, new Date("2026-08-31T00:00:00Z"), today)).toBe(
      "Closing date must be after the opening date",
    );
  });

  it("passes a valid same-day-open, later-close window", () => {
    expect(validateWindow(today, new Date("2026-09-01T00:00:00Z"), today)).toBeNull();
  });
});

describe("validateAudienceMinimums", () => {
  it("rejects when assigned teachers fall short of the floor", () => {
    expect(validateAudienceMinimums(0, 0, false, 1, 1)).toBe("At least 1 teacher must be assigned (0 assigned)");
    expect(validateAudienceMinimums(2, 0, false, 3, 1)).toBe("At least 3 teachers must be assigned (2 assigned)");
  });

  it("only checks students when the campaign actually uses a student group", () => {
    expect(validateAudienceMinimums(1, 0, false, 1, 5)).toBeNull();
  });

  it("rejects when reachable students fall short of the floor, e.g. an assignment pointing only at empty groups", () => {
    expect(validateAudienceMinimums(1, 0, true, 1, 1)).toBe(
      "At least 1 student must be reachable through assigned groups (0 reachable)",
    );
  });

  it("passes once both floors clear", () => {
    expect(validateAudienceMinimums(2, 10, true, 1, 5)).toBeNull();
  });
});

describe("authorizeOfferings (cross-department student reach)", () => {
  const CSE = "node_cse";
  const SPRING = "sem_spring";

  // Asnake Emana is an Applied Maths lecturer who teaches Discrete Mathematics to CSE
  // Year 2 — the real shape of the 2025/26 export, and the case the whole rule exists for.
  const mathsTeacherOwnOffering: AssignableOffering = {
    id: "off_maths_in_cse",
    teacherId: "t_asnake",
    semesterId: SPRING,
    sectionNodeId: CSE,
  };
  const ownOffering: AssignableOffering = {
    id: "off_cse_own",
    teacherId: "t_meron",
    semesterId: SPRING,
    sectionNodeId: CSE,
  };

  it("lets a department reach another department's section through its own teacher's offering", () => {
    const result = authorizeOfferings({
      campaignNodeId: "node_maths",
      campaignSemesterId: SPRING,
      ownTeacherIds: ["t_asnake"],
      requestedOfferingIds: ["off_maths_in_cse"],
      knownOfferings: [mathsTeacherOwnOffering],
    });
    expect(result.ok).toEqual(["off_maths_in_cse"]);
    expect(result.errors).toEqual([]);
  });

  it("refuses an offering taught by someone outside the department", () => {
    const result = authorizeOfferings({
      campaignNodeId: "node_maths",
      campaignSemesterId: SPRING,
      ownTeacherIds: ["t_asnake"],
      requestedOfferingIds: ["off_cse_own"],
      knownOfferings: [ownOffering],
    });
    expect(result.ok).toEqual([]);
    expect(result.errors[0]).toContain("outside this department");
  });

  it("refuses an offering from another semester, so last term's roster can't be re-asked", () => {
    const result = authorizeOfferings({
      campaignNodeId: CSE,
      campaignSemesterId: "sem_fall",
      ownTeacherIds: ["t_meron"],
      requestedOfferingIds: ["off_cse_own"],
      knownOfferings: [ownOffering],
    });
    expect(result.ok).toEqual([]);
    expect(result.errors[0]).toContain("different semester");
  });

  it("names an unknown id rather than silently dropping it", () => {
    const result = authorizeOfferings({
      campaignNodeId: CSE,
      campaignSemesterId: SPRING,
      ownTeacherIds: ["t_meron"],
      requestedOfferingIds: ["off_ghost"],
      knownOfferings: [ownOffering],
    });
    expect(result.ok).toEqual([]);
    expect(result.errors[0]).toContain("off_ghost");
  });

  it("deduplicates a repeated request", () => {
    const result = authorizeOfferings({
      campaignNodeId: CSE,
      campaignSemesterId: SPRING,
      ownTeacherIds: ["t_meron"],
      requestedOfferingIds: ["off_cse_own", "off_cse_own"],
      knownOfferings: [ownOffering],
    });
    expect(result.ok).toEqual(["off_cse_own"]);
  });
});

describe("authorizeBareStudentGroups", () => {
  it("accepts only the department's own groups", () => {
    const result = authorizeBareStudentGroups("node_cse", [
      { id: "g_own", nodeId: "node_cse" },
      { id: "g_other", nodeId: "node_swe" },
    ]);
    expect(result.ok).toEqual(["g_own"]);
    expect(result.errors[0]).toContain("assign it through a course offering instead");
  });
});

describe("templateSlotsForAssignedGroups", () => {
  const allThree = [
    { targetGroup: "STUDENT", templateId: "t_student" },
    { targetGroup: "PEER", templateId: "t_peer" },
    { targetGroup: "MANAGER", templateId: "t_manager" },
  ];

  it("keeps only the audiences the campaign actually asks", () => {
    expect(templateSlotsForAssignedGroups(allThree, ["STUDENT"])).toEqual([
      { targetGroup: "STUDENT", templateId: "t_student" },
    ]);
  });

  it("leaves a head-only campaign with a MANAGER slot alone — which is what keeps its min-N exemption", () => {
    const kept = templateSlotsForAssignedGroups(allThree, ["MANAGER"]);
    expect(kept.map((k) => k.targetGroup)).toEqual(["MANAGER"]);
    // The exemption is the whole point: with STUDENT/PEER slots attached it would be false.
    expect(teacherMinNGate(new Map([["MANAGER", 1]]), kept.map((k) => k.targetGroup) as never, 5).ok).toBe(true);
  });

  it("does not block a later peer round in the same semester", () => {
    const studentRound = templateSlotsForAssignedGroups(allThree, ["STUDENT"]).map((k) => k.targetGroup);
    expect(validateSemesterUniqueness(["PEER"], studentRound, "Fall 2026/27")).toBeNull();
  });

  it("keeps every slot when the campaign really does ask all three", () => {
    expect(templateSlotsForAssignedGroups(allThree, ["STUDENT", "PEER", "MANAGER"])).toHaveLength(3);
  });

  it("drops everything when nothing is assigned yet", () => {
    expect(templateSlotsForAssignedGroups(allThree, [])).toEqual([]);
  });
});
