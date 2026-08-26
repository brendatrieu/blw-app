import { describe, expect, it } from "vitest";
import { babyFormError, type BabyFormValues } from "./SettingsPage.js";

function values(overrides: Partial<BabyFormValues> = {}): BabyFormValues {
  return { name: "Priya", birthDate: "2026-03-15", notes: "", ...overrides };
}

describe("babyFormError", () => {
  it("passes with a name and a birth date", () => {
    expect(babyFormError(values())).toBeNull();
  });

  it("blocks with a message when the birth date is empty", () => {
    expect(babyFormError(values({ birthDate: "" }))).toBe("Please choose a birth date.");
  });

  it("blocks with a message when the name is empty", () => {
    expect(babyFormError(values({ name: "" }))).toBe("Please enter a name.");
  });

  it("blocks when the name is only whitespace", () => {
    expect(babyFormError(values({ name: "   " }))).toBe("Please enter a name.");
  });

  it("checks name before birth date when both are missing", () => {
    expect(babyFormError(values({ name: "", birthDate: "" }))).toBe("Please enter a name.");
  });

  it("does not require notes", () => {
    expect(babyFormError(values({ notes: "" }))).toBeNull();
  });
});
