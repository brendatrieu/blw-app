// Call-site pins for the storage events (item 320). Same harness as
// tracking/hooks.usage.test.ts, plus a React store for
// `useStorageStatusChange`, which is a stateful hook rather than a bare
// mutation.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0, refs: [] as { current: unknown }[], r: 0 };
  return {
    store,
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
      return [store.states[i], (v: unknown) => {
        store.states[i] = typeof v === "function" ? (v as (p: unknown) => unknown)(store.states[i]) : v;
      }];
    },
    useRef: (init: unknown) => {
      const i = store.r++;
      if (!(i in store.refs)) store.refs[i] = { current: init };
      return store.refs[i];
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState, useRef: h.useRef, useEffect: () => {} };
});

const captured: Array<Record<string, (...args: never[]) => unknown>> = [];
const mutateCalls: Array<{ variables: unknown; options?: Record<string, (...args: never[]) => unknown> }> = [];

vi.mock("@tanstack/react-query", () => ({
  useMutation: (options: Record<string, (...args: never[]) => unknown>) => {
    captured.push(options);
    return {
      mutate: (variables: unknown, callOptions?: Record<string, (...args: never[]) => unknown>) => {
        mutateCalls.push({ variables, options: callOptions });
      },
      isPending: false,
    };
  },
  useQuery: () => ({ data: undefined }),
  useQueryClient: () => fakeQueryClient,
}));

vi.mock("../../components/ui/Celebration.js", () => ({ useCelebration: () => ({ celebrate: () => {} }) }));
vi.mock("../tracking/api.js", () => ({ fetchAllergenProgress: async () => ({ items: [] }) }));

const tracked: Array<[string, Record<string, unknown>]> = [];
vi.mock("../../lib/usage/track.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, track: (...args: unknown[]) => tracked.push(args as [string, Record<string, unknown>]) };
});

import { ApiError } from "../../lib/api.js";
import { useCreateStorageItem, useStorageServe, useStorageStatusChange } from "./hooks.js";

const fakeQueryClient = {
  getQueryData: () => undefined,
  getQueriesData: () => [],
  setQueryData: () => {},
  invalidateQueries: () => Promise.resolve(),
  cancelQueries: () => Promise.resolve(),
} as never;

const ITEM = {
  id: "s1",
  label: "Leftovers",
  foods: [{ id: "f-oats", slug: "oats", name: "Oats", emoji: null }],
  recipeId: null,
  recipeTitle: null,
  preparedAt: "2026-09-08T12:00:00.000Z",
  location: "fridge",
  status: "active",
  statusChangedAt: "2026-09-08T12:00:00.000Z",
  expiresAt: "2026-09-15T12:00:00.000Z",
  useSoon: true,
  expired: false,
  quantityNote: null,
  servingsTotal: 4,
  servingsLeft: 2,
  bestBy: null,
  notes: null,
};

function firstOptions(create: () => unknown) {
  captured.length = 0;
  create();
  return captured[0]!;
}

beforeEach(() => {
  tracked.length = 0;
  captured.length = 0;
  mutateCalls.length = 0;
  h.store.states = [];
  h.store.i = 0;
  h.store.refs = [];
  h.store.r = 0;
  vi.setSystemTime(new Date("2026-09-13T12:00:00.000Z"));
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("window", { location: { pathname: "/storage/add", search: "" } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useCreateStorageItem — storage_item_added", () => {
  /**
   * `created` is what the route answered with. It defaults to the ordinary
   * case — ONE container holding every food the input named (item 347) — so
   * only the tests that care about splitting have to spell it out.
   */
  function add(input: Record<string, unknown>, created?: Array<Record<string, unknown>>) {
    const options = firstOptions(() => useCreateStorageItem());
    const foodIds = (input.foodIds as string[] | undefined) ?? [];
    const container = { id: "s2", foods: foodIds.map((id) => ({ id })) };
    options.onSuccess!((created ?? [container]) as never, input as never);
    return tracked;
  }

  it("reports the container's shape and where it was added from, never its text", () => {
    expect(
      add({ label: "Priya's pasta", location: "freezer", servingsTotal: 6, bestBy: "2026-09-20" }),
    ).toEqual([
      [
        "storage_item_added",
        {
          location: "freezer",
          source: "label",
          via: "storage_page",
          has_servings: true,
          has_best_by: true,
          split: false,
        },
      ],
    ]);
    expect(JSON.stringify(tracked)).not.toContain("Priya");
  });

  // Item 347/348: the event counts CONTAINERS, not submissions, so the two
  // ways of saving three foods are comparable.
  it("sends ONE event carrying the whole container's food count by default", () => {
    const events = add({ foodIds: ["f1", "f2", "f3"], location: "fridge" });
    expect(events).toHaveLength(1);
    expect(events[0]![1]).toMatchObject({ source: "food", food_count: "3", split: false });
  });

  it("sends one event PER container, each holding one food, when separate containers were asked for", () => {
    const events = add(
      { foodIds: ["f1", "f2", "f3"], separateItems: true, location: "fridge" },
      [
        { id: "s2", foods: [{ id: "f1" }] },
        { id: "s3", foods: [{ id: "f2" }] },
        { id: "s4", foods: [{ id: "f3" }] },
      ],
    );
    expect(events).toHaveLength(3);
    for (const [name, props] of events) {
      expect(name).toBe("storage_item_added");
      expect(props).toMatchObject({ source: "food", food_count: "1", split: true });
    }
  });

  it("omits food_count for a recipe or label container, which names no foods of its own", () => {
    expect(add({ recipeId: "r1", location: "fridge" })[0]![1]).not.toHaveProperty("food_count");
    tracked.length = 0;
    expect(add({ label: "Soup", location: "fridge" })[0]![1]).not.toHaveProperty("food_count");
  });

  it("reads `source` off the payload", () => {
    expect(add({ recipeId: "r1", location: "fridge" })[0]![1]).toMatchObject({ source: "recipe" });
    tracked.length = 0;
    expect(add({ foodIds: ["f1"], location: "fridge" })[0]![1]).toMatchObject({ source: "food", food_count: "1" });
  });

  it("calls a leftovers save from the log form log_leftovers", () => {
    vi.stubGlobal("window", { location: { pathname: "/log-meal", search: "" } });
    expect(add({ foodIds: ["f1"], location: "fridge" })[0]![1]).toMatchObject({ via: "log_leftovers" });
  });

  it("distinguishes a food page's Add to storage from the Storage tab's", () => {
    vi.stubGlobal("window", { location: { pathname: "/storage/add", search: "?food=f1" } });
    expect(add({ foodIds: ["f1"], location: "fridge" })[0]![1]).toMatchObject({ via: "food_page" });
  });
});

describe("useStorageServe — meal_logged from storage", () => {
  function serve(itemAfter: Record<string, unknown>, servedAt?: string) {
    const options = firstOptions(() => useStorageServe("baby-1"));
    options.onSuccess!(
      {
        meal: { id: "m1", foods: [{ id: "f1" }], recipeId: null, notes: null, reactionNote: null },
        item: itemAfter,
      } as never,
      { id: "s1", input: { babyId: "baby-1", servings: 1, servedAt } } as never,
      { hadAnyMeals: true } as never,
    );
    return tracked;
  }

  it("logs the meal with from_storage and the storage_serve entry point", () => {
    expect(serve({ ...ITEM, servingsLeft: 1 })).toEqual([
      [
        "meal_logged",
        {
          food_count: "1",
          recipe_kind: "none",
          from_storage: true,
          via: "storage_serve",
          leftovers_saved: false,
          has_notes: false,
          is_first_meal: false,
          backdated: "now",
          offline: false,
        },
      ],
    ]);
  });

  it("buckets the sheet's When field, now that a serve can be backdated (item 354)", () => {
    const servedAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(serve({ ...ITEM, servingsLeft: 1 }, servedAt)[0]![1]).toMatchObject({ backdated: "<1d" });
  });

  it("also closes the container when the serve emptied it", () => {
    const events = serve({ ...ITEM, status: "finished", servingsLeft: 0 });
    expect(events.map(([name]) => name)).toEqual(["meal_logged", "storage_item_closed"]);
    expect(events[1]![1]).toEqual({
      to: "finished",
      via: "serve_depleted",
      freshness_at_change: "use_soon",
      // Prepared on the 8th, served on the 13th.
      age_days_bucket: "4-7",
    });
  });

  it("reports a failed serve as a meal_save_failed, with no message", () => {
    const options = firstOptions(() => useStorageServe("baby-1"));
    options.onError!(new ApiError(500, "internal_error") as never);
    expect(tracked).toEqual([["meal_save_failed", { via: "storage_serve", kind: "5xx", offline: false }]]);
  });
});

describe("useStorageStatusChange — storage_item_closed", () => {
  function render() {
    h.store.i = 0;
    h.store.r = 0;
    return useStorageStatusChange();
  }

  it("reads `via` off the status being written, not off the button", () => {
    render().setStatus(ITEM as never, "discarded", true);
    mutateCalls[0]!.options!.onSuccess!({ ...ITEM, status: "discarded" } as never);
    expect(tracked).toEqual([
      [
        "storage_item_closed",
        { to: "discarded", via: "remove", freshness_at_change: "use_soon", age_days_bucket: "4-7" },
      ],
    ]);
  });

  it("counts a restore too — `to: active` is what a restore looks like", () => {
    render().setStatus({ ...ITEM, status: "finished" } as never, "active", false);
    mutateCalls[0]!.options!.onSuccess!({ ...ITEM, status: "active" } as never);
    expect(tracked[0]![1]).toMatchObject({ to: "active", via: "restore" });
  });

  it("tells an undo apart from the removal it reverses", () => {
    // Remove, which announces the undo banner...
    render().setStatus(ITEM as never, "finished", true);
    mutateCalls[0]!.options!.onSuccess!({ ...ITEM, status: "finished" } as never);
    tracked.length = 0;

    // ...then the parent taps Undo on that banner.
    render().undo();
    mutateCalls[1]!.options!.onSuccess!({ ...ITEM, status: "active" } as never);
    expect(tracked).toEqual([
      [
        "storage_item_closed",
        { to: "active", via: "undo", freshness_at_change: "use_soon", age_days_bucket: "4-7" },
      ],
    ]);
  });

  it("sends nothing about the container itself — no label, no food, no id", () => {
    render().setStatus(ITEM as never, "discarded", true);
    mutateCalls[0]!.options!.onSuccess!({ ...ITEM, status: "discarded" } as never);
    const json = JSON.stringify(tracked);
    expect(json).not.toContain("Leftovers");
    expect(json).not.toContain("oats");
    expect(json).not.toContain("Oats");
    expect(json).not.toContain("s1");
  });
});
