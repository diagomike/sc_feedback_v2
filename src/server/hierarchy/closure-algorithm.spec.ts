import { describe, it, expect } from "vitest";
import { computeClosureRows } from "./closure-algorithm";

function rowSet(rows: { ancestorId: string; descendantId: string; depth: number }[]) {
  return new Set(rows.map((r) => `${r.ancestorId}->${r.descendantId}@${r.depth}`));
}

describe("computeClosureRows", () => {
  it("handles the diamond / multi-parent case (x->a, y->a, y->b, a->d)", () => {
    const nodeIds = ["x", "y", "a", "b", "d"];
    const edges = [
      { parentId: "x", childId: "a" },
      { parentId: "y", childId: "a" },
      { parentId: "y", childId: "b" },
      { parentId: "a", childId: "d" },
    ];

    const rows = computeClosureRows(nodeIds, edges);
    const set = rowSet(rows);

    expect(set.has("x->d@2")).toBe(true);
    expect(set.has("y->d@2")).toBe(true);
    expect(rows.filter((r) => r.ancestorId === "x" && r.descendantId === "d")).toHaveLength(1);
    expect(rows.filter((r) => r.ancestorId === "y" && r.descendantId === "d")).toHaveLength(1);

    expect(set.has("x->b@1")).toBe(false);
    expect(rows.some((r) => r.ancestorId === "x" && r.descendantId === "b")).toBe(false);

    for (const id of nodeIds) {
      expect(set.has(`${id}->${id}@0`)).toBe(true);
    }

    expect(rows.filter((r) => r.ancestorId === "d")).toHaveLength(1);
    expect(rows.filter((r) => r.ancestorId === "b")).toHaveLength(1);
  });

  it("keeps the minimum depth when a shortcut edge exists alongside a longer path", () => {
    const nodeIds = ["p", "q", "r"];
    const edges = [
      { parentId: "p", childId: "q" },
      { parentId: "q", childId: "r" },
      { parentId: "p", childId: "r" },
    ];
    const rows = computeClosureRows(nodeIds, edges);
    const pr = rows.find((r) => r.ancestorId === "p" && r.descendantId === "r");
    expect(pr?.depth).toBe(1);
    expect(rows.filter((r) => r.ancestorId === "p" && r.descendantId === "r")).toHaveLength(1);
  });

  it("terminates and stays correct even if a cycle is present", () => {
    const nodeIds = ["a", "b"];
    const edges = [
      { parentId: "a", childId: "b" },
      { parentId: "b", childId: "a" },
    ];
    const rows = computeClosureRows(nodeIds, edges);
    const set = rowSet(rows);
    expect(set.has("a->a@0")).toBe(true);
    expect(set.has("a->b@1")).toBe(true);
    expect(set.has("b->b@0")).toBe(true);
    expect(set.has("b->a@1")).toBe(true);
    expect(rows).toHaveLength(4);
  });

  it("returns only self-membership for an isolated node", () => {
    const rows = computeClosureRows(["solo"], []);
    expect(rows).toEqual([{ ancestorId: "solo", descendantId: "solo", depth: 0 }]);
  });
});
