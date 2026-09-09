import { describe, expect, it } from "vitest";
import { clampStageToAvailable, stageForAge } from "./stage.js";

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

describe("clampStageToAvailable", () => {
  it("keeps a stage the recipe carries", () => {
    expect(clampStageToAvailable("9", ["6", "9", "12"])).toBe("9");
  });

  // The shrimp case (item 253): no 6-month variant exists, so a 6-month
  // request must land on 9 rather than showing 9-month prep under "6mo".
  it("moves a request below the earliest stage up to that earliest stage", () => {
    expect(clampStageToAvailable("6", ["9", "12"])).toBe("9");
    expect(clampStageToAvailable("6", ["12"])).toBe("12");
  });

  it("falls back to the nearest stage BELOW a request the recipe skips", () => {
    expect(clampStageToAvailable("12", ["6", "9"])).toBe("9");
    expect(clampStageToAvailable("9", ["6", "12"])).toBe("6");
  });

  it("ignores the order the stages arrive in", () => {
    expect(clampStageToAvailable("6", ["12", "9"])).toBe("9");
  });

  it("returns null when the recipe carries no stages", () => {
    expect(clampStageToAvailable("6", [])).toBeNull();
  });
});
