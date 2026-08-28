import { describe, it, expect } from "vitest";
import { validateSemesterUniqueness } from "./semester-logic";

describe("validateSemesterUniqueness", () => {
  it("passes when no other campaign at this node+semester uses any of the same target groups", () => {
    expect(validateSemesterUniqueness(["STUDENT"], ["PEER", "MANAGER"], "Fall 2026/27")).toBeNull();
  });

  it("passes when nothing else exists yet for this node+semester", () => {
    expect(validateSemesterUniqueness(["STUDENT", "PEER"], [], "Fall 2026/27")).toBeNull();
  });

  it("rejects and names the colliding target group and semester", () => {
    const error = validateSemesterUniqueness(["STUDENT"], ["STUDENT"], "Fall 2026/27");
    expect(error).toContain("student");
    expect(error).toContain("Fall 2026/27");
  });

  it("catches a collision even when only one of several target groups overlaps", () => {
    const error = validateSemesterUniqueness(["STUDENT", "PEER"], ["PEER"], "Spring 2025/26");
    expect(error).toContain("peer");
  });
});
