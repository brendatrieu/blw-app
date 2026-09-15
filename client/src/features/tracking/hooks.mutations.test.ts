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
vi.mock("./api.js", () => ({
  createMeal: async () => ({}),
  updateMeal: async () => ({}),
  deleteMeal: async () => ({}),
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

import { useMarkAllergenEstablished, useUndoAllergenEstablished } from "./hooks.js";

const fakeQueryClient = {
  getQueryData: () => undefined,
  getQueriesData: () => [],
  setQueryData: () => {},
  invalidateQueries: () => Promise.resolve(),
} as never;

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
