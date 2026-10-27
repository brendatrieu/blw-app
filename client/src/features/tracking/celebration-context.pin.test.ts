import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// VERIFY-p4-c1 #1 (repro-first.mjs): /plan opened cold holds no meals list,
// and a one-tap Serve for a baby WITH meals celebrated "First food logged!"
// and sent is_first_meal: true. "Any meals" now comes from loaded data only.
const h = vi.hoisted(() => ({ calls: 0, serverMeals: [] as unknown[], fail: false }));

vi.mock("./api.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchMeals: async () => {
    h.calls += 1;
    if (h.fail) throw new Error("offline");
    return { items: h.serverMeals };
  },
  fetchAllergenProgress: async () => ({ items: [] }),
}));

const { celebrateForNewMeal, snapshotMealCelebrationContext, trackingKeys } = await import("./hooks.js");

const BABY = "baby-1";

beforeEach(() => {
  h.calls = 0;
  h.serverMeals = [{ id: "m1" }];
  h.fail = false;
});

describe("the first-meal answer (VERIFY-p4-c1 #1)", () => {
  it("a cold cache asks the server: a baby with meals is not celebrated", async () => {
    const context = await snapshotMealCelebrationContext(new QueryClient(), BABY);
    expect(h.calls).toBe(1);
    expect(context?.hadAnyMeals).toBe(true);
    const celebrate = vi.fn();
    celebrateForNewMeal(BABY, context, celebrate);
    expect(celebrate).not.toHaveBeenCalledWith(expect.objectContaining({ title: "First food logged!" }));
  });

  it("a cold cache and a baby with no meals still celebrates", async () => {
    h.serverMeals = [];
    const context = await snapshotMealCelebrationContext(new QueryClient(), BABY);
    expect(context?.hadAnyMeals).toBe(false);
  });

  it("a loaded first page WITH meals answers without a request; a cursor page alone does not", async () => {
    const client = new QueryClient();
    client.setQueryData([...trackingKeys.meals(BABY), { limit: 100, before: "2026-10-01T00:00:00.000Z" }], { items: [] });
    expect((await snapshotMealCelebrationContext(client, BABY))?.hadAnyMeals).toBe(true);
    expect(h.calls).toBe(1);
    client.setQueryData([...trackingKeys.meals(BABY), { limit: 100 }], { items: [{ id: "m1" }] });
    expect((await snapshotMealCelebrationContext(client, BABY))?.hadAnyMeals).toBe(true);
    expect(h.calls).toBe(1);
  });

  // VERIFY-p44-c1: an empty first page saved to disk can be stale (a meal
  // logged on another device since), so it is checked with the server.
  it("an EMPTY cached first page is re-asked: a meal logged elsewhere means no celebration", async () => {
    const client = new QueryClient();
    client.setQueryData([...trackingKeys.meals(BABY), { limit: 100 }], { items: [] });
    expect((await snapshotMealCelebrationContext(client, BABY))?.hadAnyMeals).toBe(true);
    expect(h.calls).toBe(1);
    h.serverMeals = [];
    expect((await snapshotMealCelebrationContext(client, BABY))?.hadAnyMeals).toBe(false);
  });

  it("an answer it can't get is 'had meals', never a wrong celebration", async () => {
    h.fail = true;
    expect((await snapshotMealCelebrationContext(new QueryClient(), BABY))?.hadAnyMeals).toBe(true);
  });
});
