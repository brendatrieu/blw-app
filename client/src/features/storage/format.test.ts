import { describe, expect, it } from "vitest";
import {
  bestByLabel,
  clampServings,
  countdownLabel,
  isLabelOnly,
  storageItemTitle,
  resolveStorageItemMenuActions,
  servingsLabel,
} from "./format.js";

describe("storageItemTitle", () => {
  it("prefers the label when set", () => {
    expect(storageItemTitle({ label: "Leftover soup", foodName: "Avocado", recipeTitle: "Purée" })).toBe(
      "Leftover soup",
    );
  });

  it("falls back to the recipe title, then the food name, then a generic label", () => {
    expect(storageItemTitle({ label: null, foodName: "Avocado", recipeTitle: "Purée" })).toBe("Purée");
    expect(storageItemTitle({ label: null, foodName: "Avocado", recipeTitle: null })).toBe("Avocado");
    expect(storageItemTitle({ label: null, foodName: null, recipeTitle: null })).toBe("Prepared food");
  });
});

describe("countdownLabel", () => {
  it("reports Expired once past expiresAt", () => {
    expect(countdownLabel(new Date(Date.now() - 1000).toISOString())).toBe("Expired");
  });

  it("reports minutes under an hour out", () => {
    expect(countdownLabel(new Date(Date.now() + 30 * 60_000).toISOString())).toMatch(/Use within \d+ min/);
  });

  it("reports hours under 48h out", () => {
    expect(countdownLabel(new Date(Date.now() + 5 * 60 * 60_000).toISOString())).toBe("Use within 5h");
  });

  it("reports days at 48h or beyond", () => {
    expect(countdownLabel(new Date(Date.now() + 72 * 60 * 60_000).toISOString())).toBe("Use within 3d");
  });
});

describe("servingsLabel", () => {
  it("formats as 'N of M servings left'", () => {
    expect(servingsLabel(2, 6)).toBe("2 of 6 servings left");
    expect(servingsLabel(0, 6)).toBe("0 of 6 servings left");
  });
});

describe("bestByLabel", () => {
  it("formats a YYYY-MM-DD date as 'Best by <Mon, Aug 29>'", () => {
    // Saturday, Aug 29 2026.
    expect(bestByLabel("2026-08-29")).toBe("Best by Sat, Aug 29");
  });

  it("parses as a local calendar date, not a UTC instant (no off-by-one near midnight)", () => {
    expect(bestByLabel("2026-01-01")).toBe("Best by Thu, Jan 1");
  });
});

describe("isLabelOnly", () => {
  it("is true for a free-form label with no linked food or recipe", () => {
    expect(isLabelOnly({ foodSlug: null, recipeTitle: null })).toBe(true);
  });

  it("is false for a food-sourced item", () => {
    expect(isLabelOnly({ foodSlug: "avocado", recipeTitle: null })).toBe(false);
  });

  it("is false for a recipe-sourced item", () => {
    expect(isLabelOnly({ foodSlug: null, recipeTitle: "Iron-Rich Purée" })).toBe(false);
  });
});

describe("resolveStorageItemMenuActions", () => {
  it("offers Serve, Edit, and Remove for an active, food-sourced item", () => {
    expect(resolveStorageItemMenuActions({ status: "active", foodSlug: "avocado", recipeTitle: null })).toEqual({
      serve: true,
      edit: true,
      remove: true,
      restore: false,
    });
  });

  it("offers Serve for an active, recipe-sourced item", () => {
    expect(
      resolveStorageItemMenuActions({ status: "active", foodSlug: null, recipeTitle: "Iron-Rich Purée" }),
    ).toEqual({ serve: true, edit: true, remove: true, restore: false });
  });

  it("withholds Serve for a label-only active item (nothing the serve endpoint could log)", () => {
    expect(resolveStorageItemMenuActions({ status: "active", foodSlug: null, recipeTitle: null })).toEqual({
      serve: false,
      edit: true,
      remove: true,
      restore: false,
    });
  });

  // Item 264: the kebab is the only action surface a list card has now, so
  // a finished/discarded item offers exactly one thing — Restore — instead
  // of nothing at all.
  it("offers only Restore for a finished item", () => {
    expect(resolveStorageItemMenuActions({ status: "finished", foodSlug: "avocado", recipeTitle: null })).toEqual({
      serve: false,
      edit: false,
      remove: false,
      restore: true,
    });
  });

  it("offers only Restore for a discarded item", () => {
    expect(resolveStorageItemMenuActions({ status: "discarded", foodSlug: "avocado", recipeTitle: null })).toEqual({
      serve: false,
      edit: false,
      remove: false,
      restore: true,
    });
  });

  it("never offers Restore alongside Remove — they are exact complements", () => {
    for (const status of ["active", "finished", "discarded"] as const) {
      const actions = resolveStorageItemMenuActions({ status, foodSlug: "avocado", recipeTitle: null });
      expect(actions.restore).toBe(!actions.remove);
    }
  });
});

describe("clampServings", () => {
  it("clamps below 1 up to 1", () => {
    expect(clampServings(0, 6)).toBe(1);
    expect(clampServings(-3, 6)).toBe(1);
  });

  it("clamps above max down to max", () => {
    expect(clampServings(10, 6)).toBe(6);
  });

  it("leaves an in-range value untouched", () => {
    expect(clampServings(3, 6)).toBe(3);
  });

  it("rounds a fractional value", () => {
    expect(clampServings(2.6, 6)).toBe(3);
  });

  it("never clamps below 1 even when max itself is below 1", () => {
    expect(clampServings(5, 0)).toBe(1);
  });
});
