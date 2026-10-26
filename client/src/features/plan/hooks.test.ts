// The plan hooks (ledger 904, SPEC §5): what each asks the API for, the
// cache key, the refetch after every write (write echoes carry no flags),
// and the one analytics event. `useQuery`/`useMutation` are recorders, so the
// real `queryFn`/`mutationFn`/callbacks run as plain functions.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  queries: [] as Array<Record<string, unknown>>,
  mutations: [] as Array<Record<string, (...args: never[]) => unknown>>,
  invalidated: [] as unknown[],
  calls: [] as Array<[string, unknown[]]>,
  tracked: [] as Array<[string, unknown]>,
  removeImpl: (async () => ({})) as (...args: unknown[]) => Promise<unknown>,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: Record<string, unknown>) => {
    h.queries.push(options);
    return {};
  },
  useMutation: (options: Record<string, (...args: never[]) => unknown>) => {
    h.mutations.push(options);
    return {};
  },
  useQueryClient: () => ({
    invalidateQueries: (filters: { queryKey: unknown }) => {
      h.invalidated.push(filters.queryKey);
      return Promise.resolve();
    },
  }),
}));
vi.mock("../../lib/api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api.js")>();
  const record = (name: string) => async (...args: unknown[]) => {
    h.calls.push([name, args]);
    return {};
  };
  return { ...actual, apiGet: record("GET"), apiPut: record("PUT"), apiDelete: (...args: unknown[]) => h.removeImpl(...args) };
});
vi.mock("../../lib/usage/track.js", () => ({ track: (name: string, props: unknown) => h.tracked.push([name, props]) }));
vi.mock("./plan.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./plan.js")>()),
  deviceTimeZone: () => "America/Toronto",
}));

import { ApiError } from "../../lib/api.js";
import { isPlanChanged, planKeys, usePlan, useRemovePlannedMeal, useSaveDailyMeals } from "./hooks.js";

const BABY = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  h.queries.length = 0;
  h.mutations.length = 0;
  h.invalidated.length = 0;
  h.calls.length = 0;
  h.tracked.length = 0;
  h.removeImpl = async (...args: unknown[]) => {
    h.calls.push(["DELETE", args]);
    return {};
  };
});

describe("usePlan", () => {
  it("is keyed [\"plan\", babyId, from, to] and asks for that range in the device's zone", async () => {
    usePlan(BABY, "2026-10-12", "2026-10-18");
    const query = h.queries[0]!;
    expect(query.queryKey).toEqual(["plan", BABY, "2026-10-12", "2026-10-18"]);
    expect(planKeys.range(BABY, "a", "b")).toEqual(["plan", BABY, "a", "b"]);
    expect(query.enabled).toBe(true);
    await (query.queryFn as () => Promise<unknown>)();
    expect(h.calls).toEqual([["GET", [`/api/babies/${BABY}/plan?from=2026-10-12&to=2026-10-18&tz=America%2FToronto`]]]);
  });

  it("waits for a baby", () => {
    usePlan(undefined, "2026-10-12", "2026-10-18");
    expect(h.queries[0]!.enabled).toBe(false);
  });
});

describe("useSaveDailyMeals", () => {
  it("PUTs the list, says how many and whether any has a time (never names), and refetches every plan", async () => {
    useSaveDailyMeals(BABY);
    const options = h.mutations[0]!;
    const input = { meals: [{ name: "Breakfast", time: "07:30" }] };
    await (options.mutationFn as (input: unknown) => Promise<unknown>)(input);
    expect(h.calls).toEqual([["PUT", [`/api/babies/${BABY}/daily-meals`, input]]]);

    const meal = (n: number, time: string | null) => ({ id: `id-${n}`, name: `Secret ${n}`, time });
    (options.onSuccess as (data: unknown) => void)({ dailyMeals: [meal(1, null), meal(2, "12:00"), meal(3, null)] });
    (options.onSuccess as (data: unknown) => void)({ dailyMeals: Array.from({ length: 7 }, (_, n) => meal(n, null)) });
    expect(h.tracked).toEqual([
      ["daily_meals_saved", { meal_count: "3", has_times: true }],
      ["daily_meals_saved", { meal_count: "6+", has_times: false }],
    ]);
    expect(JSON.stringify(h.tracked)).not.toContain("Secret");

    (options.onSettled as () => void)();
    expect(h.invalidated).toEqual([["plan"]]);
  });
});

describe("useRemovePlannedMeal", () => {
  const remove = () => {
    useRemovePlannedMeal(BABY);
    return h.mutations[0]!;
  };

  it("DELETEs that day's meal and refetches every plan, done or not", async () => {
    const options = remove();
    await (options.mutationFn as (v: unknown) => Promise<unknown>)({ date: "2026-10-14", slotId: "slot-1" });
    expect(h.calls).toEqual([["DELETE", [`/api/babies/${BABY}/plan/2026-10-14/meals/slot-1`]]]);
    (options.onSettled as () => void)();
    expect(h.invalidated).toEqual([["plan"]]);
  });

  it("a 409 plan_changed (already off that day) is done; any other failure is an error", async () => {
    const options = remove();
    const run = () => (options.mutationFn as (v: unknown) => Promise<unknown>)({ date: "2026-10-14", slotId: "slot-1" });
    h.removeImpl = async () => {
      throw new ApiError(409, "plan_changed", { error: "plan_changed", message: "…" });
    };
    await expect(run()).resolves.toBeUndefined();
    for (const error of [new ApiError(409, "conflict", { error: "conflict" }), new ApiError(500, "boom"), new TypeError("offline")]) {
      h.removeImpl = async () => {
        throw error;
      };
      await expect(run()).rejects.toBe(error);
    }
    expect(isPlanChanged(new ApiError(404, "plan_changed", { error: "plan_changed" }))).toBe(false);
  });
});
