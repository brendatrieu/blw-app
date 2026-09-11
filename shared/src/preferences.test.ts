import { describe, expect, it } from "vitest";
import { updatePreferencesInputSchema, userPreferencesSchema } from "./preferences.js";
import { ACCOUNT_EXPORT_VERSION, accountExportSchema } from "./account.js";

describe("userPreferencesSchema", () => {
  it("accepts a stamped tour and an unseen one", () => {
    expect(userPreferencesSchema.parse({ tourCompletedAt: "2026-09-11T10:00:00.000Z" })).toEqual({
      tourCompletedAt: "2026-09-11T10:00:00.000Z",
    });
    expect(userPreferencesSchema.parse({ tourCompletedAt: null })).toEqual({ tourCompletedAt: null });
  });

  it("rejects a missing field, a non-ISO date, and a boolean stand-in", () => {
    expect(userPreferencesSchema.safeParse({}).success).toBe(false);
    expect(userPreferencesSchema.safeParse({ tourCompletedAt: "yesterday" }).success).toBe(false);
    expect(userPreferencesSchema.safeParse({ tourCompletedAt: true }).success).toBe(false);
  });
});

describe("updatePreferencesInputSchema", () => {
  it("accepts only { tourCompleted: true }", () => {
    expect(updatePreferencesInputSchema.parse({ tourCompleted: true })).toEqual({ tourCompleted: true });
  });

  it("rejects anything that would mean 'un-see the tour' or nothing at all", () => {
    // There is no un-complete: replaying from More deliberately leaves the
    // stamp alone, so `false` is a request with no meaning rather than a
    // silently ignored no-op.
    expect(updatePreferencesInputSchema.safeParse({ tourCompleted: false }).success).toBe(false);
    expect(updatePreferencesInputSchema.safeParse({}).success).toBe(false);
    expect(updatePreferencesInputSchema.safeParse({ tourCompleted: "true" }).success).toBe(false);
  });
});

describe("account export v10", () => {
  it("bumped its version and carries preferences, null when the account has none", () => {
    expect(ACCOUNT_EXPORT_VERSION).toBe(10);

    const shape = accountExportSchema.shape;
    expect(shape.preferences.safeParse(null).success).toBe(true);
    expect(shape.preferences.safeParse({ tourCompletedAt: null }).success).toBe(true);
    expect(shape.preferences.safeParse({ tourCompletedAt: "2026-09-11T10:00:00.000Z" }).success).toBe(true);
    // Absent is not the same as null — the key is always present in a v10 file.
    expect(shape.preferences.safeParse(undefined).success).toBe(false);
  });
});
