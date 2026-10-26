// What each allergen mutation actually ASKS THE API FOR (items 364/365).
//
// The seam between the hook and `./api.js` was the one link in the chain
// nobody watched: `hooks.usage.test.ts` mocks the api module and asserts only
// what `track()` receives, and the sheet's handler suite mocks the hook. A
// build whose `mutationFn` dropped `{ establishedAt }` therefore passed
// client typecheck and all 1793 client tests (verify-1, mutation #9) while
// throwing away every backdated mark — the server reads an absent body as
// "now", so the row looked right and the maintenance countdown restarted
// today.
//
// Harness idiom from `hooks.usage.test.ts`: `useMutation` is replaced by a
// recorder, so the real `mutationFn` runs as a plain function and the
// arguments it forwards can be read back.
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const apiCalls: Array<[string, unknown[]]> = [];
let deleteMealImpl: (...args: unknown[]) => Promise<unknown> = async () => undefined;
vi.mock("./api.js", () => ({
  createMeal: async () => ({}),
  updateMeal: async () => ({}),
  deleteMeal: (...args: unknown[]) => deleteMealImpl(...args),
  fetchMeals: async () => ({ items: [] }),
  fetchAllergenProgress: async () => ({ items: [] }),
  fetchAllergenDetail: async () => ({}),
  putAllergenOverride: async (...args: unknown[]) => {
    apiCalls.push(["putAllergenOverride", args]);
  },
  deleteAllergenOverride: async (...args: unknown[]) => {
    apiCalls.push(["deleteAllergenOverride", args]);
  },
  fetchFavorites: async () => ({ items: [] }),
  putFavorite: async () => ({}),
  deleteFavorite: async () => ({}),
}));

import { PLATE_NOT_AN_INGREDIENT } from "@blw/shared";
import { ApiError } from "../../lib/api.js";
import {
  trackingKeys,
  useCreateMeal,
  useDeleteMeal,
  useMarkAllergenEstablished,
  useUndoAllergenEstablished,
  useUpdateMeal,
} from "./hooks.js";

const fakeQueryClient = {
  getQueryData: () => undefined,
  getQueriesData: () => [],
  setQueryData: () => {},
  invalidateQueries: (filters: { queryKey: unknown }) => {
    invalidated.push(filters.queryKey);
    return Promise.resolve();
  },
} as never;
const invalidated: unknown[] = [];

const BABY_ID = "22222222-2222-2222-2222-222222222222";
const MARKED_IN_MARCH = "2026-03-04T08:15:00.000Z";

type MutationFn = (variables: never) => Promise<unknown>;

function mutationFnFor(create: () => unknown): MutationFn {
  captured.length = 0;
  create();
  return captured[0]!.mutationFn as unknown as MutationFn;
}

beforeEach(() => {
  apiCalls.length = 0;
});

describe("useMarkAllergenEstablished", () => {
  it("forwards the parent's instant to the override PUT — dropping it would restart the countdown at now", async () => {
    const mutationFn = mutationFnFor(() => useMarkAllergenEstablished(BABY_ID));
    await mutationFn({ allergenSlug: "peanut", establishedAt: MARKED_IN_MARCH } as never);

    expect(apiCalls).toEqual([
      ["putAllergenOverride", [BABY_ID, "peanut", { establishedAt: MARKED_IN_MARCH }]],
    ]);
  });

  it("sends the date it was given rather than re-deriving one", async () => {
    vi.setSystemTime(new Date("2026-09-15T12:00:00.000Z"));
    const mutationFn = mutationFnFor(() => useMarkAllergenEstablished(BABY_ID));
    await mutationFn({ allergenSlug: "egg", establishedAt: MARKED_IN_MARCH } as never);
    vi.useRealTimers();

    const [, args] = apiCalls[0]!;
    expect(args[2]).toEqual({ establishedAt: MARKED_IN_MARCH });
    expect(JSON.stringify(args[2])).not.toContain("2026-09-15");
  });

  it("writes nothing at all when there is no active baby", () => {
    const mutationFn = mutationFnFor(() => useMarkAllergenEstablished(undefined));
    expect(() => mutationFn({ allergenSlug: "peanut", establishedAt: MARKED_IN_MARCH } as never)).toThrow(
      /no active baby/,
    );
    expect(apiCalls).toEqual([]);
  });
});

describe("useUndoAllergenEstablished", () => {
  it("DELETEs this baby's override for the slug it was handed", async () => {
    const mutationFn = mutationFnFor(() => useUndoAllergenEstablished(BABY_ID));
    await mutationFn("peanut" as never);

    expect(apiCalls).toEqual([["deleteAllergenOverride", [BABY_ID, "peanut"]]]);
  });

  it("writes nothing at all when there is no active baby", () => {
    const mutationFn = mutationFnFor(() => useUndoAllergenEstablished(undefined));
    expect(() => mutationFn("peanut" as never)).toThrow(/no active baby/);
    expect(apiCalls).toEqual([]);
  });
});

// Item 581: a logged, edited or deleted meal can change the baby's averages
// and graphs, so each one refreshes the ratings (the prefix covers history).
describe("meal mutations refresh the baby's ratings", () => {
  it.each([
    ["useCreateMeal", () => useCreateMeal(BABY_ID)],
    ["useUpdateMeal", () => useUpdateMeal(BABY_ID)],
    ["useDeleteMeal", () => useDeleteMeal(BABY_ID)],
  ])("%s invalidates the ratings on settle", (_name, create) => {
    captured.length = 0;
    create();
    invalidated.length = 0;
    (captured[0]!.onSettled as () => void)();

    expect(invalidated).toContainEqual(trackingKeys.ratings(BABY_ID));
  });
});

// Ledger 760/902: every meal write can move servings — a serve takes them, an
// edit resizes or removes a container, a delete gives them back — and (Phase
// 4) serve or un-serve a planned meal, so storage and the plan refresh too.
describe("meal writes refresh storage and the plan (ledgers 760, 902)", () => {
  it.each([
    ["useCreateMeal", () => useCreateMeal(BABY_ID)],
    ["useUpdateMeal", () => useUpdateMeal(BABY_ID)],
    ["useDeleteMeal", () => useDeleteMeal(BABY_ID)],
  ])("%s invalidates every storage view and the plan on settle", (_name, create) => {
    captured.length = 0;
    create();
    invalidated.length = 0;
    (captured[0]!.onSettled as () => void)();
    expect(invalidated).toContainEqual(["storage"]);
    expect(invalidated).toContainEqual(["plan"]);
  });
});

describe("useDeleteMeal treats a meal that is already gone as deleted (ledger 760)", () => {
  it("resolves on a 404 (double-tapped Undo, or deleted elsewhere first)", async () => {
    deleteMealImpl = async () => {
      throw new ApiError(404, "not_found");
    };
    try {
      await expect(mutationFnFor(() => useDeleteMeal(BABY_ID))("meal-1" as never)).resolves.toBeUndefined();
    } finally {
      deleteMealImpl = async () => undefined;
    }
  });

  it("still fails on anything else, so a real failure rolls the list back", async () => {
    deleteMealImpl = async () => {
      throw new ApiError(500, "internal_error");
    };
    try {
      await expect(mutationFnFor(() => useDeleteMeal(BABY_ID))("meal-1" as never)).rejects.toMatchObject({ status: 500 });
      deleteMealImpl = async () => {
        throw new TypeError("Failed to fetch");
      };
      await expect(mutationFnFor(() => useDeleteMeal(BABY_ID))("meal-1" as never)).rejects.toBeInstanceOf(TypeError);
    } finally {
      deleteMealImpl = async () => undefined;
    }
  });
});

// VERIFY-p3-c1 #6: a save refused because the recipe lost a left-out
// ingredient on another device refetches THAT recipe, so its Ingredients
// panel shows what it holds now. Any other failure refetches no recipe.
describe("a stale leave-out refetches its recipe", () => {
  const stale = new ApiError(400, "invalid_request", {
    error: "invalid_request",
    details: { leftOutFoodIds: PLATE_NOT_AN_INGREDIENT, recipeId: "recipe-1", foodIds: ["food-1"] },
  });
  const onErrorOf = (create: () => unknown) => {
    captured.length = 0;
    create();
    return captured[0]!.onError as unknown as (error: unknown) => void;
  };

  it("on Log meal and on Edit", () => {
    for (const create of [() => useCreateMeal(BABY_ID), () => useUpdateMeal(BABY_ID)]) {
      invalidated.length = 0;
      onErrorOf(create)(stale);
      expect(invalidated).toEqual([["recipe", "recipe-1"]]);
      invalidated.length = 0;
      onErrorOf(create)(new ApiError(400, "invalid_request", { details: { items: "x" } }));
      expect(invalidated).toEqual([]);
    }
  });
});
