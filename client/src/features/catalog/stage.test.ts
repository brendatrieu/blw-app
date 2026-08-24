import { describe, expect, it } from "vitest";
import { stageForAge } from "./stage.js";

describe("stageForAge", () => {
  it.each([
    [6, "6"],
    [8, "6"],
    [9, "9"],
    [11, "9"],
    [12, "12"],
    [25, "12"],
  ] as const)("maps %i months to stage %s", (months, expected) => {
    expect(stageForAge(months)).toBe(expected);
  });

  it("defaults to 6 when age is undefined", () => {
    expect(stageForAge(undefined)).toBe("6");
  });

  it("defaults to 6 when age is null", () => {
    expect(stageForAge(null)).toBe("6");
  });
});
