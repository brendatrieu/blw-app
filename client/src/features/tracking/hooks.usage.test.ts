// Call-site pins for the meal events (item 320). The mutation hooks are
// driven as plain functions with `useMutation` replaced by a recorder, so the
// real `onSuccess`/`onError` bodies run and what they send can be read back.
// Harness idiom ported from the handler suites.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captured: Array<Record<string, (...args: never[]) => unknown>> = [];

vi.mock("@tanstack/react-query", () => ({
  useMutation: (options: Record<string, (...args: never[]) => unknown>) => {
    captured.push(options);
    return { mutate: () => {}, isPending: false, isError: false };
  },
  useQueryClient: () => fakeQueryClient,
}));

vi.mock("../../components/ui/Celebration.js", () => ({
  useCelebration: () => ({ celebrate: () => {} }),
}));

// The celebration path re-fetches allergen progress; nothing here is about that.
vi.mock("./api.js", () => ({
  createMeal: async () => ({}),
  updateMeal: async () => ({}),
  deleteMeal: async () => ({}),
  fetchMeals: async () => ({ items: [] }),
  fetchAllergenProgress: async () => ({ items: [] }),
  fetchAllergenDetail: async () => ({}),
  putAllergenOverride: async () => ({}),
  deleteAllergenOverride: async () => ({}),
  fetchFavorites: async () => ({ items: [] }),
  putFavorite: async () => ({}),
  deleteFavorite: async () => ({}),
}));

const tracked: Array<[string, Record<string, unknown>]> = [];
vi.mock("../../lib/usage/track.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, track: (...args: unknown[]) => tracked.push(args as [string, Record<string, unknown>]) };
});

import { ApiError } from "../../lib/api.js";
import { useCreateMeal, useUpdateMeal } from "./hooks.js";

const fakeQueryClient = {
  getQueryData: () => undefined,
  getQueriesData: () => [],
  setQueryData: () => {},
  invalidateQueries: () => Promise.resolve(),
} as never;

type Options = Record<string, (...args: never[]) => unknown>;

function optionsFor(create: () => unknown): Options {
  captured.length = 0;
  create();
  return captured[0]!;
}

const INPUT: {
  foodIds: string[];
  recipeId: string | null;
  servedAt: string;
  reactionNote: string | null;
  notes: string | null;
} = {
  foodIds: ["f1", "f2", "f3"],
  recipeId: null,
  servedAt: "2026-09-13T12:00:00.000Z",
  reactionNote: null,
  notes: null,
};

beforeEach(() => {
  tracked.length = 0;
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("window", { location: { pathname: "/log-meal", search: "" } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCreateMeal — meal_logged", () => {
  function succeed(overrides: Partial<typeof INPUT> = {}, context?: { hadAnyMeals: boolean }) {
    const options = optionsFor(() => useCreateMeal("baby-1", { leftoversSaved: true }));
    options.onSuccess!(
      { id: "m1" } as never,
      { ...INPUT, ...overrides } as never,
      (context ?? { hadAnyMeals: true, previousProgress: undefined }) as never,
    );
    return tracked;
  }

  it("fires once, on success, with buckets rather than numbers", () => {
    vi.setSystemTime(new Date("2026-09-13T12:00:30.000Z"));
    expect(succeed()).toEqual([
      [
        "meal_logged",
        {
          food_count: "3",
          recipe_kind: "none",
          from_storage: false,
          via: "log_page",
          leftovers_saved: true,
          has_notes: false,
          is_first_meal: false,
          backdated: "now",
          offline: false,
        },
      ],
    ]);
    vi.useRealTimers();
  });

  it("derives `via` from the route the form was opened at", () => {
    vi.stubGlobal("window", { location: { pathname: "/log-meal", search: "?food=sweet-potato-id" } });
    expect(succeed()[0]![1]).toMatchObject({ via: "food_page" });
    tracked.length = 0;
    vi.stubGlobal("window", { location: { pathname: "/log-meal", search: "?recipe=r1" } });
    expect(succeed()[0]![1]).toMatchObject({ via: "recipe_page" });
  });

  it("says whether a note exists, never what it says", () => {
    const props = succeed({ notes: "Priya loved it", reactionNote: null })[0]![1];
    expect(props).toMatchObject({ has_notes: true });
    expect(JSON.stringify(props)).not.toContain("Priya");
  });

  it("reads is_first_meal off the celebration snapshot the mutation already took", () => {
    expect(succeed({}, { hadAnyMeals: false })[0]![1]).toMatchObject({ is_first_meal: true });
  });

  it("buckets a backdated serve time", () => {
    vi.setSystemTime(new Date("2026-09-14T12:00:00.000Z"));
    expect(succeed()[0]![1]).toMatchObject({ backdated: "1d+" });
    vi.useRealTimers();
  });

  it("records offline saves as offline", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(succeed()[0]![1]).toMatchObject({ offline: true });
  });
});

describe("meal_save_failed", () => {
  it("separates a 5xx, a 4xx and a dead network — and sends no message", () => {
    const create = optionsFor(() => useCreateMeal("baby-1", { leftoversSaved: false }));
    create.onError!(new ApiError(503, "unavailable") as never);
    create.onError!(new ApiError(400, "invalid_request") as never);
    create.onError!(new TypeError("Failed to fetch") as never);
    expect(tracked.map(([, props]) => props.kind)).toEqual(["5xx", "4xx", "network"]);
    expect(tracked.every(([name]) => name === "meal_save_failed")).toBe(true);
    expect(JSON.stringify(tracked)).not.toContain("invalid_request");
  });

  it("is the only event an EDIT can produce — an edit is not a new meal", () => {
    const update = optionsFor(() => useUpdateMeal("baby-1"));
    update.onSuccess!({ id: "m1", foods: [] } as never);
    expect(tracked).toEqual([]);
    update.onError!(new ApiError(500, "internal_error") as never);
    expect(tracked.map(([name]) => name)).toEqual(["meal_save_failed"]);
  });
});
