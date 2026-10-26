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
  weekData: {} as Record<string, unknown>,
}));

vi.mock("@tanstack/react-query", () => ({
  keepPreviousData: "keepPreviousData",
  useQuery: (options: Record<string, unknown>) => {
    h.queries.push(options);
    return {};
  },
  useQueries: ({ queries }: { queries: Array<Record<string, unknown>> }) => {
    h.queries.push(...queries);
    return queries.map((query) => ({ data: h.weekData[(query.queryKey as string[])[2]!] }));
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
  return {
    ...actual,
    apiGet: record("GET"),
    apiPut: record("PUT"),
    apiPost: record("POST"),
    apiDelete: (...args: unknown[]) => h.removeImpl(...args),
  };
});
vi.mock("../../lib/usage/track.js", () => ({ track: (name: string, props: unknown) => h.tracked.push([name, props]) }));
vi.mock("./plan.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./plan.js")>()),
  deviceTimeZone: () => "America/Toronto",
}));

import { ApiError } from "../../lib/api.js";
import { PLATE_NOT_AN_INGREDIENT } from "@blw/shared";
import {
  isPlanChanged,
  planKeys,
  servedMealId,
  useCopyCheck,
  useCopyPlan,
  usePlan,
  usePlanWeeks,
  useRemovePlannedMeal,
  useSaveDailyMeals,
  useSavePlannedMeal,
} from "./hooks.js";

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

describe("usePlanWeeks", () => {
  it("reads each week once, with usePlan's own keys, and finds a day in any of them", () => {
    h.weekData = {
      "2026-10-12": { days: [{ date: "2026-10-14", meals: [] }] },
      "2026-10-19": { days: [{ date: "2026-10-21", meals: [] }] },
    };
    const dayOf = usePlanWeeks(BABY, ["2026-10-12", "2026-10-19", "2026-10-12"]);
    expect(h.queries.map((query) => query.queryKey)).toEqual([
      ["plan", BABY, "2026-10-12", "2026-10-18"],
      ["plan", BABY, "2026-10-19", "2026-10-25"],
    ]);
    expect(dayOf("2026-10-21")).toEqual({ date: "2026-10-21", meals: [] });
    expect(dayOf("2026-10-28")).toBeUndefined();
  });
});

describe("useSavePlannedMeal (Plan a meal)", () => {
  const save = () => {
    useSavePlannedMeal(BABY);
    return h.mutations[0]!;
  };
  const input = { name: "Lunch", time: "12:00", items: [{ kind: "storage", storageItemId: "c1", servings: 1 }, { kind: "food", foodId: "f1" }] };

  it("PUTs a meal's name, time and items; a new meal is POSTed with them; every plan refetches", async () => {
    const options = save();
    await (options.mutationFn as (v: unknown) => Promise<unknown>)({ date: "2026-10-14", slotId: "slot-1", today: "2026-10-14", input });
    await (options.mutationFn as (v: unknown) => Promise<unknown>)({ date: "2026-10-14", slotId: null, today: "2026-10-14", input });
    expect(h.calls).toEqual([
      ["PUT", [`/api/babies/${BABY}/plan/2026-10-14/meals/slot-1`, input]],
      ["POST", [`/api/babies/${BABY}/plan/2026-10-14/meals`, input]],
    ]);
    (options.onSettled as () => void)();
    expect(h.invalidated).toEqual([["plan"]]);
  });

  it("plan_saved: how many things, whether a container, how far ahead; none for a meal saved empty; never names", () => {
    const options = save();
    const success = (variables: unknown) => (options.onSuccess as (data: unknown, v: unknown) => void)({}, variables);
    success({ date: "2026-10-16", slotId: "s", today: "2026-10-14", input });
    success({ date: "2026-10-13", slotId: "s", today: "2026-10-14", input: { ...input, items: [{ kind: "food", foodId: "f1" }] } });
    success({ date: "2026-10-14", slotId: "s", today: "2026-10-14", input: { ...input, items: [] } });
    expect(h.tracked).toEqual([
      ["plan_saved", { item_count: "2", has_storage: true, days_ahead: "2-7" }],
      ["plan_saved", { item_count: "1", has_storage: false, days_ahead: "past" }],
    ]);
    expect(JSON.stringify(h.tracked)).not.toContain("Lunch");
  });

  it("a stale leave-out refetches that recipe; other failures don't", () => {
    const options = save();
    const fail = (error: unknown) => (options.onError as (e: unknown) => void)(error);
    fail(new ApiError(400, "invalid_request", { details: { leftOutFoodIds: PLATE_NOT_AN_INGREDIENT, recipeId: "r1", foodIds: ["f1"] } }));
    fail(new ApiError(400, "invalid_request", { details: { items: "x" } }));
    expect(h.invalidated).toEqual([["recipe", "r1"]]);
  });

  it("reads the 409 that says the meal was served meanwhile", () => {
    expect(servedMealId(new ApiError(409, "already_served", { error: "already_served", mealId: "m1" }))).toBe("m1");
    expect(servedMealId(new ApiError(409, "plan_changed", { error: "plan_changed" }))).toBeNull();
    expect(servedMealId(new ApiError(400, "already_served", { error: "already_served", mealId: "m1" }))).toBeNull();
    expect(servedMealId(new TypeError("offline"))).toBeNull();
  });
});

describe("Copy to…", () => {
  const body = { source: { date: "2026-10-14", slotId: "s0" }, targets: [{ date: "2026-10-15", slotId: "s1", onClash: "keep" as const }] };

  it("the dry run: keyed by what is chosen (not a persisted plan key), off with nothing chosen, keeps the last answer", async () => {
    useCopyCheck(BABY, body);
    useCopyCheck(BABY, null);
    const [on, off] = h.queries;
    expect(on!.queryKey).toEqual(["planCopyCheck", BABY, body]);
    expect(on).toMatchObject({ enabled: true, placeholderData: "keepPreviousData", retry: false });
    expect(off!.enabled).toBe(false);
    await (on!.queryFn as () => Promise<unknown>)();
    expect(h.calls).toEqual([["POST", [`/api/babies/${BABY}/plan/copy`, { ...body, dryRun: true, tz: "America/Toronto" }]]]);
  });

  it("the copy: POSTs with the zone, says how many targets, whether any was Replace it and whether it warned; refetches", async () => {
    useCopyPlan(BABY);
    const options = h.mutations[0]!;
    await (options.mutationFn as (v: unknown) => Promise<unknown>)(body);
    expect(h.calls).toEqual([["POST", [`/api/babies/${BABY}/plan/copy`, { ...body, tz: "America/Toronto" }]]]);
    const success = (result: unknown, input: unknown) => (options.onSuccess as (r: unknown, i: unknown) => void)(result, input);
    success({ warnings: [] }, body);
    const three = { ...body, targets: [...body.targets, { ...body.targets[0]!, slotId: "s2", onClash: "replace" }, { ...body.targets[0]!, slotId: "s3" }] };
    success({ warnings: [{ kind: "food_deleted", foodId: "f" }] }, three);
    expect(h.tracked).toEqual([
      ["plan_copied", { target_count: "1", replaced: false, warned: false }],
      ["plan_copied", { target_count: "3", replaced: true, warned: true }],
    ]);
    (options.onSettled as () => void)();
    expect(h.invalidated).toEqual([["plan"]]);
  });
});
