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
import {
  useCreateMeal,
  useMarkAllergenEstablished,
  useUndoAllergenEstablished,
  useUpdateMeal,
} from "./hooks.js";

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

/** A Log meal save in the plate shape (ledger 902): two fresh foods and a
 * fresh recipe. */
const INPUT: {
  items: Array<Record<string, unknown>>;
  servedAt: string;
  reactionNote: string | null;
  notes: string | null;
} = {
  items: [
    { kind: "food", foodId: "f1", rating: null },
    { kind: "food", foodId: "f2", rating: null },
  ],
  servedAt: "2026-09-13T12:00:00.000Z",
  reactionNote: null,
  notes: null,
};
/** The saved meal the server answers with: three foods counted as tried. */
const CREATED = { id: "m1", foods: [{ id: "f1" }, { id: "f2" }, { id: "f3" }], recipes: [], recipeId: null };

const CONTAINER = {
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

beforeEach(() => {
  tracked.length = 0;
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("window", { location: { pathname: "/log-meal", search: "" } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCreateMeal — meal_logged", () => {
  function succeed(
    overrides: Partial<typeof INPUT> = {},
    context?: { hadAnyMeals: boolean },
    created: Record<string, unknown> = {},
    usage: Record<string, unknown> = { leftoversSaved: true },
  ) {
    const options = optionsFor(() => useCreateMeal("baby-1", usage as never));
    options.onSuccess!(
      { ...CREATED, ...created } as never,
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
          // What the meal counts as tried (the saved meal), not the item count.
          food_count: "3",
          recipe_kind: "none",
          from_storage: false,
          via: "log_page",
          leftovers_saved: true,
          has_notes: false,
          is_first_meal: false,
          backdated: "now",
          offline: false,
          has_left_out: false,
        },
      ],
    ]);
    vi.useRealTimers();
  });

  it("derives `via` from the route the plate was opened at", () => {
    vi.stubGlobal("window", { location: { pathname: "/log-meal", search: "?food=sweet-potato-id" } });
    expect(succeed()[0]![1]).toMatchObject({ via: "food_page" });
    tracked.length = 0;
    vi.stubGlobal("window", { location: { pathname: "/log-meal", search: "?recipe=r1" } });
    expect(succeed()[0]![1]).toMatchObject({ via: "recipe_page" });
    expect(tracked[0]![1]).not.toHaveProperty("one_tap");
  });

  it("a planned meal served through the plate is via plan, not one tap (SPEC §6)", () => {
    vi.stubGlobal("window", { location: { pathname: "/plan/2026-10-14/slot-1", search: "?serve=1" } });
    expect(succeed()[0]![1]).toMatchObject({ via: "plan", one_tap: false });
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

  // Ledger 759 / SPEC §6: the kind reads the meal's distinct recipes — fresh
  // or inside a container, a recipe twice is one.
  it("reads the recipe kind off the saved meal's recipes", () => {
    const two = succeed({}, undefined, { recipes: [{ id: "r1" }, { id: "r2" }], recipeId: "r1" })[0]![1];
    expect(two).toMatchObject({ recipe_kind: "several", includes_basic: false });
    tracked.length = 0;
    expect(succeed({}, undefined, { recipes: [{ id: "r1" }], recipeId: "r1" })[0]![1]).toMatchObject({ recipe_kind: "catalog" });
    expect(succeed({}, undefined, { recipes: [{ id: "r1" }], recipeId: "r1" })[0]![1]).not.toHaveProperty("includes_basic");
  });

  // SPEC §6: a flag, never which ingredient.
  it("says whether a recipe left something out, never what", () => {
    const leftOut = { kind: "recipe", recipeId: "r1", leftOutFoodIds: ["f-cashew"], rating: null };
    const props = succeed({ items: [...INPUT.items, leftOut] })[0]![1];
    expect(props).toMatchObject({ has_left_out: true });
    expect(JSON.stringify(props)).not.toContain("f-cashew");
    tracked.length = 0;
    expect(succeed({ items: [{ ...leftOut, leftOutFoodIds: [] }] })[0]![1]).toMatchObject({ has_left_out: false });
  });
});

// Ledger 902: Serve is the plate page too (`/log-meal?storage=`), so a serve
// is a meal_logged with from_storage, and a container it empties is closed.
describe("useCreateMeal — a serve from storage", () => {
  const SERVE = { ...INPUT, items: [{ kind: "storage", storageItemId: "s1", servings: 2 }] };
  function serve(containers: Array<Record<string, unknown>>, items: Array<Record<string, unknown>> = SERVE.items) {
    vi.stubGlobal("window", { location: { pathname: "/log-meal", search: "?storage=s1" } });
    const options = optionsFor(() => useCreateMeal("baby-1", { leftoversSaved: false, containers } as never));
    options.onSuccess!({ ...CREATED, foods: [{ id: "f-oats" }] } as never, { ...SERVE, items } as never, {
      hadAnyMeals: true,
    } as never);
    return tracked;
  }

  it("logs the meal with from_storage and the storage_serve entry point", () => {
    vi.setSystemTime(new Date("2026-09-13T12:00:30.000Z"));
    expect(serve([{ ...CONTAINER, servingsLeft: 4 }])).toEqual([
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
          has_left_out: false,
        },
      ],
    ]);
    vi.useRealTimers();
  });

  it("also closes a container the serve emptied, in buckets only", () => {
    vi.setSystemTime(new Date("2026-09-13T12:00:00.000Z"));
    const events = serve([CONTAINER]); // 2 left, 2 served
    expect(events.map(([name]) => name)).toEqual(["meal_logged", "storage_item_closed"]);
    expect(events[1]![1]).toEqual({
      to: "finished",
      via: "serve_depleted",
      freshness_at_change: "use_soon",
      // Prepared on the 8th, served on the 13th.
      age_days_bucket: "4-7",
    });
    vi.useRealTimers();
  });

  // Ledger 760: one sitting, several containers — one meal event, and one
  // close for EACH container this save emptied (and none for the others).
  it("sends one close per container emptied, none for one with servings left, untracked or kept", () => {
    const containers = [
      CONTAINER,
      { ...CONTAINER, id: "s2", servingsLeft: 3 },
      { ...CONTAINER, id: "s3", servingsLeft: 1 },
      { ...CONTAINER, id: "s4", servingsTotal: null, servingsLeft: null },
      { ...CONTAINER, id: "s5", servingsLeft: 1 },
    ];
    const items = [
      { kind: "storage", storageItemId: "s1", servings: 2 },
      { kind: "storage", storageItemId: "s2", servings: 2 },
      { kind: "storage", storageItemId: "s3", servings: 1 },
      { kind: "storage", storageItemId: "s4", servings: 5 },
      // A container kept by an edit sends no servings: it takes nothing new.
      { kind: "storage", storageItemId: "s5" },
    ];
    expect(serve(containers, items).map(([name]) => name)).toEqual(["meal_logged", "storage_item_closed", "storage_item_closed"]);
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

describe("allergen_marked (item 365)", () => {
  it("fires on a mark, with the date reduced to a single backdated flag", () => {
    vi.setSystemTime(new Date("2026-09-13T12:00:00.000Z"));
    const mark = optionsFor(() => useMarkAllergenEstablished("baby-1"));
    // An untouched "When" is the sheet's default: the current minute.
    mark.onSuccess!(undefined as never, { allergenSlug: "peanut", establishedAt: "2026-09-13T12:00:00.000Z" } as never);

    expect(tracked).toEqual([["allergen_marked", { action: "mark", backdated: false }]]);
    // Never the allergen, never the date.
    expect(JSON.stringify(tracked)).not.toContain("peanut");
    expect(JSON.stringify(tracked)).not.toContain("2026-09");
    vi.useRealTimers();
  });

  // `backdated` answers "did the parent reach for the date picker", so the
  // cut is an hour, not a day: a mark scrolled back to this morning is the
  // picker earning its place exactly as much as one scrolled back to June.
  it("flags a mark set more than an hour before the tap, not only one past a day", () => {
    vi.setSystemTime(new Date("2026-09-13T12:00:00.000Z"));
    const mark = optionsFor(() => useMarkAllergenEstablished("baby-1"));
    mark.onSuccess!(undefined as never, { allergenSlug: "egg", establishedAt: "2026-09-13T08:00:00.000Z" } as never);
    mark.onSuccess!(undefined as never, { allergenSlug: "egg", establishedAt: "2026-06-01T09:00:00.000Z" } as never);

    expect(tracked.map(([, props]) => props)).toEqual([
      { action: "mark", backdated: true },
      { action: "mark", backdated: true },
    ]);
    vi.useRealTimers();
  });

  it("still reads an hour-old default-ish instant as now, inside the slack", () => {
    vi.setSystemTime(new Date("2026-09-13T12:00:00.000Z"));
    const mark = optionsFor(() => useMarkAllergenEstablished("baby-1"));
    mark.onSuccess!(undefined as never, { allergenSlug: "egg", establishedAt: "2026-09-13T11:00:00.000Z" } as never);

    expect(tracked[0]![1]).toEqual({ action: "mark", backdated: false });
    vi.useRealTimers();
  });

  it("fires on an undo too, which can never be backdated", () => {
    const undo = optionsFor(() => useUndoAllergenEstablished("baby-1"));
    undo.onSuccess!(undefined as never, "peanut" as never);

    expect(tracked).toEqual([["allergen_marked", { action: "undo", backdated: false }]]);
  });
});
