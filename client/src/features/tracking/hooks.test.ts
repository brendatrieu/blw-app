import { describe, expect, it } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { invalidateAllergenQueries, trackingKeys } from "./hooks.js";

describe("invalidateAllergenQueries", () => {
  it("invalidates the ladder AND every allergen detail for the baby (they must never disagree)", () => {
    const calls: unknown[] = [];
    const fake = {
      invalidateQueries: (filters: { queryKey: unknown }) => {
        calls.push(filters.queryKey);
        return Promise.resolve();
      },
    } as unknown as QueryClient;

    invalidateAllergenQueries(fake, "baby-1");

    expect(calls).toContainEqual(trackingKeys.allergenProgress("baby-1"));
    expect(calls).toContainEqual(trackingKeys.allergenDetails("baby-1"));
    // The details prefix covers each per-allergen key.
    const detail = trackingKeys.allergenDetail("baby-1", "peanut");
    const prefix = trackingKeys.allergenDetails("baby-1");
    expect(detail.slice(0, prefix.length)).toEqual([...prefix]);
  });
});

describe("trackingKeys.ratings", () => {
  it("prefixes every rating history, so one meal-mutation invalidation refreshes cards AND graphs", () => {
    const prefix = trackingKeys.ratings("baby-1");
    const history = trackingKeys.ratingHistory("baby-1", { foodId: "f1" });
    expect(history.slice(0, prefix.length)).toEqual([...prefix]);
    expect(trackingKeys.ratings("baby-2")).not.toEqual(prefix);
  });
});
