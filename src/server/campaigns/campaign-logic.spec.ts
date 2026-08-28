import { describe, it, expect } from "vitest";
import { campaignMinNGate, teacherMinNGate, validateWindow, validateAudienceMinimums } from "./campaign-logic";

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
