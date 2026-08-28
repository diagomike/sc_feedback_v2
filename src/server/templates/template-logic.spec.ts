import { describe, it, expect } from "vitest";
import { compositeShares, isTemplateVisible } from "./template-logic";

describe("isTemplateVisible", () => {
  const OWN = "node-cse";
  const ANCESTORS = ["node-cse", "node-astu"]; // includes self, per ancestorIdsOf's contract

  it("is always visible when the caller's own node owns it, in any status", () => {
    expect(isTemplateVisible({ ownerNodeId: OWN, status: "DRAFT" }, OWN, ANCESTORS)).toBe(true);
    expect(isTemplateVisible({ ownerNodeId: OWN, status: "ARCHIVED" }, OWN, ANCESTORS)).toBe(true);
  });

  it("is visible when an ancestor owns it AND it is published", () => {
    expect(isTemplateVisible({ ownerNodeId: "node-astu", status: "PUBLISHED" }, OWN, ANCESTORS)).toBe(true);
  });

  it("hides an ancestor's still-draft or archived template", () => {
    expect(isTemplateVisible({ ownerNodeId: "node-astu", status: "DRAFT" }, OWN, ANCESTORS)).toBe(false);
    expect(isTemplateVisible({ ownerNodeId: "node-astu", status: "ARCHIVED" }, OWN, ANCESTORS)).toBe(false);
  });

  it("hides a published template owned by a non-ancestor (sibling department, descendant)", () => {
    expect(isTemplateVisible({ ownerNodeId: "node-mechanical", status: "PUBLISHED" }, OWN, ANCESTORS)).toBe(false);
  });
});

describe("compositeShares", () => {
  it("splits share proportionally to weight among LIKERT_GRID, non-overall sections", () => {
    const shares = compositeShares([
      { id: "a", type: "LIKERT_GRID", isOverall: false, weight: 1 },
      { id: "b", type: "LIKERT_GRID", isOverall: false, weight: 2 },
      { id: "c", type: "LIKERT_GRID", isOverall: false, weight: 1 },
    ]);
    expect(shares.get("a")).toBe(25);
    expect(shares.get("b")).toBe(50);
    expect(shares.get("c")).toBe(25);
  });

  it("excludes FREE_TEXT sections from the pool entirely", () => {
    const shares = compositeShares([
      { id: "a", type: "LIKERT_GRID", isOverall: false, weight: 1 },
      { id: "comments", type: "FREE_TEXT", isOverall: false, weight: 1 },
    ]);
    expect(shares.get("a")).toBe(100);
    expect(shares.get("comments")).toBe(0);
  });

  it("excludes isOverall (self-rated) sections even when they are LIKERT_GRID", () => {
    const shares = compositeShares([
      { id: "a", type: "LIKERT_GRID", isOverall: false, weight: 1 },
      { id: "overall", type: "LIKERT_GRID", isOverall: true, weight: 5 },
    ]);
    expect(shares.get("a")).toBe(100);
    expect(shares.get("overall")).toBe(0);
  });

  it("returns zero for every section when nothing contributes to the composite", () => {
    const shares = compositeShares([{ id: "comments", type: "FREE_TEXT", isOverall: false, weight: 1 }]);
    expect(shares.get("comments")).toBe(0);
  });

  it("rounds to one decimal place rather than repeating fractions", () => {
    const shares = compositeShares([
      { id: "a", type: "LIKERT_GRID", isOverall: false, weight: 1 },
      { id: "b", type: "LIKERT_GRID", isOverall: false, weight: 1 },
      { id: "c", type: "LIKERT_GRID", isOverall: false, weight: 1 },
    ]);
    expect(shares.get("a")).toBe(33.3);
    expect(shares.get("b")).toBe(33.3);
    expect(shares.get("c")).toBe(33.3);
  });
});
