import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHARE_USAGE_DATA,
  updatePreferencesInputSchema,
  userPreferencesSchema,
} from "./preferences.js";
import { ACCOUNT_EXPORT_VERSION, accountExportSchema } from "./account.js";

const seen = { tourCompletedAt: "2026-09-11T10:00:00.000Z", shareUsageData: true };
const unseen = { tourCompletedAt: null, shareUsageData: false };

describe("userPreferencesSchema", () => {
  it("accepts a stamped tour and an unseen one, each with a sharing choice", () => {
    expect(userPreferencesSchema.parse(seen)).toEqual(seen);
    expect(userPreferencesSchema.parse(unseen)).toEqual(unseen);
  });

  it("rejects a missing field, a non-ISO date, and a boolean stand-in", () => {
    expect(userPreferencesSchema.safeParse({}).success).toBe(false);
    expect(userPreferencesSchema.safeParse({ tourCompletedAt: null }).success).toBe(false);
    expect(userPreferencesSchema.safeParse({ shareUsageData: true }).success).toBe(false);
    expect(userPreferencesSchema.safeParse({ ...seen, tourCompletedAt: "yesterday" }).success).toBe(false);
    expect(userPreferencesSchema.safeParse({ ...seen, tourCompletedAt: true }).success).toBe(false);
    expect(userPreferencesSchema.safeParse({ ...seen, shareUsageData: "yes" }).success).toBe(false);
  });

  it("shares on by default — the events cannot carry anything about a child", () => {
    expect(DEFAULT_SHARE_USAGE_DATA).toBe(true);
  });
});

describe("updatePreferencesInputSchema", () => {
  it("takes either key on its own, or both", () => {
    expect(updatePreferencesInputSchema.parse({ tourCompleted: true })).toEqual({ tourCompleted: true });
    expect(updatePreferencesInputSchema.parse({ shareUsageData: false })).toEqual({
      shareUsageData: false,
    });
    expect(updatePreferencesInputSchema.parse({ tourCompleted: true, shareUsageData: true })).toEqual({
      tourCompleted: true,
      shareUsageData: true,
    });
  });

  it("rejects anything that would mean 'un-see the tour' or nothing at all", () => {
    // There is no un-complete: replaying from More deliberately leaves the
    // stamp alone, so `false` is a request with no meaning rather than a
    // silently ignored no-op.
    expect(updatePreferencesInputSchema.safeParse({ tourCompleted: false }).success).toBe(false);
    expect(updatePreferencesInputSchema.safeParse({}).success).toBe(false);
    expect(updatePreferencesInputSchema.safeParse({ tourCompleted: "true" }).success).toBe(false);
    expect(updatePreferencesInputSchema.safeParse({ shareUsageData: "false" }).success).toBe(false);
    // A typo'd key would otherwise be a PATCH that reports success and
    // changes nothing.
    expect(updatePreferencesInputSchema.safeParse({ shareUsage: false }).success).toBe(false);
  });
});

describe("account export v14", () => {
  it("bumped its version and carries usage events alongside the preferences", () => {
    expect(ACCOUNT_EXPORT_VERSION).toBe(14);

    const shape = accountExportSchema.shape;
    expect(shape.preferences.safeParse(null).success).toBe(true);
    expect(shape.preferences.safeParse(seen).success).toBe(true);
    // v10's shape is not a v11 preferences object: the sharing choice is part
    // of the bundle now, which is why the version moved.
    expect(shape.preferences.safeParse({ tourCompletedAt: null }).success).toBe(false);
    // Absent is not the same as null — the key is always present in a v11 file.
    expect(shape.preferences.safeParse(undefined).success).toBe(false);

    expect(shape.usageEvents.safeParse([]).success).toBe(true);
    expect(
      shape.usageEvents.safeParse([
        {
          name: "screen_viewed",
          props: { route_pattern: "/", from_route: null },
          route: "/",
          appVersion: "abc123def456",
          occurredAt: "2026-09-13T10:00:00.000Z",
        },
      ]).success,
    ).toBe(true);
    expect(shape.usageEvents.safeParse(undefined).success).toBe(false);
  });

  // v14 (item 358): the messages this account sent the admins.
  it("carries the account's own feedback, without naming the admin who handled it", () => {
    const shape = accountExportSchema.shape;
    expect(shape.feedback.safeParse([]).success).toBe(true);
    expect(
      shape.feedback.safeParse([
        {
          message: "The log form saves twice on my phone.",
          status: "resolved",
          routePattern: "/log-meal",
          createdAt: "2026-09-13T10:00:00.000Z",
        },
      ]).success,
    ).toBe(true);
    // A message sent from a screen the client could not name is still a
    // message.
    expect(
      shape.feedback.safeParse([
        { message: "Hello", status: "new", routePattern: null, createdAt: "2026-09-13T10:00:00.000Z" },
      ]).success,
    ).toBe(true);
    // Who resolved it is a fact about a member of staff, not about this
    // account, and there is nowhere in the shape to put one.
    expect(
      shape.feedback.safeParse([
        {
          message: "Hello",
          status: "new",
          routePattern: null,
          createdAt: "2026-09-13T10:00:00.000Z",
          resolvedBy: "admin-1",
        },
      ]).data,
    ).toEqual([{ message: "Hello", status: "new", routePattern: null, createdAt: "2026-09-13T10:00:00.000Z" }]);
    expect(shape.feedback.safeParse(undefined).success).toBe(false);
  });

  // v13 (item 345): a container holds a whole meal, so the single
  // `foodId`/`foodName` pair became an ordered list. A v12 file — which named
  // one food per row — is no longer a valid v13 storage row, which is exactly
  // what the version bump is for.
  it("lists every food in a storage row instead of naming one", () => {
    const row = {
      id: "s1",
      recipeId: null,
      recipeTitle: null,
      label: null,
      preparedAt: "2026-09-13T10:00:00.000Z",
      location: "fridge",
      status: "active",
      statusChangedAt: "2026-09-13T10:00:00.000Z",
      quantityNote: null,
      servingsTotal: null,
      servingsLeft: null,
      bestBy: null,
      notes: null,
    };
    const storageItems = accountExportSchema.shape.storageItems;

    expect(storageItems.safeParse([{ ...row, foods: [] }]).success).toBe(true);
    expect(
      storageItems.safeParse([
        { ...row, foods: [{ foodId: "f1", foodName: "Chicken" }, { foodId: "f2", foodName: "Rice" }] },
      ]).success,
    ).toBe(true);
    // The v12 shape, which carried the food as two scalar fields.
    expect(storageItems.safeParse([{ ...row, foodId: "f1", foodName: "Chicken" }]).success).toBe(false);
  });

  it("carries the account's role in the profile block", () => {
    const profile = {
      id: "u1",
      email: "parent@example.com",
      name: "Parent",
      emailVerified: true,
      createdAt: "2026-09-11T10:00:00.000Z",
    };

    // v11's profile is not a v12 profile: the role is what moved the version,
    // so a file without it is a file from before the column was exported.
    expect(accountExportSchema.shape.profile.safeParse(profile).success).toBe(false);
    expect(accountExportSchema.shape.profile.safeParse({ ...profile, role: "parent" }).success).toBe(true);
    expect(accountExportSchema.shape.profile.safeParse({ ...profile, role: "admin" }).success).toBe(true);
  });
});
