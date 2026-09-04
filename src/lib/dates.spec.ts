import { describe, expect, it } from "vitest";
import { shortDate } from "./dates";

describe("shortDate", () => {
  it("is deterministic across server and browser locales", () => {
    expect(shortDate("2026-10-02T00:00:00.000Z")).toBe("02 Oct 2026");
  });
});
