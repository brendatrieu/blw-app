// Serving a planned meal from its card (ledger 904, SPEC §3.5, §6): today's
// one tap (the request, meal_logged via "plan" with one_tap, the shared
// new-meal aftermath) and where each answer leads (a blocked list opens the
// plate flagged, already served opens that meal, a past day opens the plate).
// `useMutation` is a recorder, so the real callbacks run as plain functions.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MealItem, PlannedMeal, StorageItem } from "@blw/shared";

const h = vi.hoisted(() => ({
  options: [] as Array<Record<string, (...args: never[]) => unknown>>,
  mutation: { isPending: false, isError: false, error: null as unknown, variables: undefined as unknown },
  mutates: [] as Array<{ variables: unknown; options: { onError?: (error: unknown) => void } }>,
  navigated: [] as string[],
  calls: [] as Array<[string, unknown[]]>,
  tracked: [] as Array<[string, unknown]>,
  after: [] as unknown[][],
  invalidated: [] as unknown[],
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useMutation: (options: Record<string, (...args: never[]) => unknown>) => {
    h.options.push(options);
    return {
      ...h.mutation,
      mutate: (variables: unknown, options: { onError?: (error: unknown) => void } = {}) => h.mutates.push({ variables, options }),
    };
  },
  useQueryClient: () => ({ getQueryData: () => undefined, getQueriesData: () => [] }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => (to: string) => h.navigated.push(to) }));
vi.mock("../../components/ui/Celebration.js", () => ({ useCelebration: () => ({ celebrate: () => {} }) }));
vi.mock("../../lib/api.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api.js")>()),
  apiPost: async (...args: unknown[]) => {
    h.calls.push(["POST", args]);
    return {};
  },
}));
vi.mock("../../lib/usage/track.js", () => ({ track: (name: string, props: unknown) => h.tracked.push([name, props]) }));
vi.mock("../tracking/hooks.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  snapshotMealCelebrationContext: () => ({ hadAnyMeals: true, previousProgress: undefined }),
  afterNewMeal: (...args: unknown[]) => h.after.push(args),
  invalidateAfterNewMeal: (_client: unknown, babyId: unknown) => h.invalidated.push(babyId),
}));
vi.mock("./plan.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./plan.js")>()),
  deviceTimeZone: () => "America/Toronto",
}));

import { ApiError } from "../../lib/api.js";
import { cannotServeAsPlanned, isNotToday, planServePath, useOneTapServe, useServePlannedMeal } from "./hooks.js";

const BABY = "22222222-2222-4222-8222-222222222222";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const MUFFINS = {
  id: id(20),
  status: "active",
  servingsTotal: 6,
  servingsLeft: 2,
  preparedAt: "2026-10-12T10:00:00.000Z",
  expiresAt: "2026-10-16T10:00:00.000Z",
  bestBy: null,
} as StorageItem;
const LUNCH: PlannedMeal = {
  slotId: id(51),
  name: "Lunch",
  time: "12:00",
  position: 1,
  served: null,
  items: [
    { kind: "storage", id: id(60), servings: 2, container: MUFFINS },
    { kind: "food", id: id(61), food: { id: id(3), slug: "egg", name: "Egg", category: "protein", emoji: null } },
  ],
};
const SERVED: MealItem = {
  id: id(90),
  babyId: BABY,
  servedAt: "2026-10-14T16:00:00.000Z",
  reactionNote: null,
  notes: null,
  recipeId: id(11),
  recipeTitle: "Egg Muffins",
  foods: [{ id: id(3), slug: "egg", name: "Egg", category: "protein" }],
  items: [
    { kind: "storage", storageItemId: MUFFINS.id, label: null, location: "fridge", servings: 2, parts: [] },
    { kind: "recipe", id: id(91), recipe: { id: id(12), title: "Pasta" }, leftOut: [{ id: id(5), slug: "cashews", name: "Cashews" }], inferred: false, rating: null },
  ],
} as unknown as MealItem;
const blocked = new ApiError(409, "cannot_serve_as_planned", { error: "cannot_serve_as_planned", blocked: [] });
const served = new ApiError(409, "already_served", { error: "already_served", mealId: id(90) });
const notToday = new ApiError(400, "not_today", { error: "not_today", today: "2026-10-15" });

beforeEach(() => {
  h.options.length = 0;
  h.mutates.length = 0;
  h.navigated.length = 0;
  h.calls.length = 0;
  h.tracked.length = 0;
  h.after.length = 0;
  h.invalidated.length = 0;
  h.mutation = { isPending: false, isError: false, error: null, variables: undefined };
});

describe("useServePlannedMeal (today's one tap)", () => {
  it("POSTs the meal's serve with the device's zone, and measures meal_logged via plan, one_tap, read off the logged meal", async () => {
    useServePlannedMeal(BABY);
    const options = h.options[0]!;
    await (options.mutationFn as (v: unknown) => Promise<unknown>)({ date: "2026-10-14", meal: LUNCH });
    expect(h.calls).toEqual([["POST", [`/api/babies/${BABY}/plan/2026-10-14/meals/${id(51)}/serve`, { tz: "America/Toronto" }]]]);

    const context = (options.onMutate as () => unknown)();
    (options.onSuccess as (r: unknown, v: unknown, c: unknown) => void)({ meal: SERVED, day: {} }, { date: "2026-10-14", meal: LUNCH }, context);
    expect(h.tracked).toEqual([
      [
        "meal_logged",
        {
          food_count: "1",
          recipe_kind: "catalog",
          from_storage: true,
          via: "plan",
          one_tap: true,
          leftovers_saved: false,
          has_notes: false,
          is_first_meal: false,
          backdated: "now",
          offline: false,
          has_left_out: true,
        },
      ],
    ]);
    // The new-meal aftermath, with the container this serve empties (2 of 2).
    expect(h.after).toHaveLength(1);
    expect(h.after[0]![1]).toBe(BABY);
    expect(h.after[0]![2]).toBe(SERVED);
    expect(h.after[0]![3]).toEqual([MUFFINS]);
    (options.onSettled as () => void)();
    expect(h.invalidated).toEqual([BABY]);
  });

  it("the answers the card handles (blocked, already served, not today) are the flow, not failures; anything else is measured as one (VERIFY-p4-c1 #3)", () => {
    useServePlannedMeal(BABY);
    const onError = h.options[0]!.onError as (error: unknown) => void;
    onError(blocked);
    onError(served);
    onError(notToday);
    expect(h.tracked).toEqual([]);
    onError(new ApiError(500, "boom"));
    expect(h.tracked).toEqual([["meal_save_failed", { via: "plan", kind: "5xx", offline: false }]]);
  });

  it("refuses to run with no baby", () => {
    useServePlannedMeal(undefined);
    expect(() => (h.options[0]!.mutationFn as (v: unknown) => unknown)({ date: "2026-10-14", meal: LUNCH })).toThrow();
  });
});

describe("useOneTapServe (a card's Serve)", () => {
  it("today: one tap; a blocked answer opens the plate flagged, already served opens that meal's Edit (966), not_today just refetches", () => {
    const oneTap = useOneTapServe(BABY);
    oneTap.serve("2026-10-14", "2026-10-14", LUNCH);
    expect(h.mutates.map((call) => call.variables)).toEqual([{ date: "2026-10-14", meal: LUNCH }]);
    const onError = h.mutates[0]!.options.onError!;
    onError(blocked);
    onError(served);
    onError(notToday);
    onError(new ApiError(500, "boom"));
    expect(h.navigated).toEqual([`/plan/2026-10-14/${id(51)}?serve=1`, `/log-meal?edit=${id(90)}`]);
  });

  it("an earlier day opens the plate, with no one tap; a later day is never asked (no Serve there)", () => {
    useOneTapServe(BABY).serve("2026-10-13", "2026-10-14", LUNCH);
    expect(h.mutates).toEqual([]);
    expect(h.navigated).toEqual([planServePath("2026-10-13", id(51))]);
    expect(planServePath("2026-10-13", id(51))).toBe(`/plan/2026-10-13/${id(51)}?serve=1`);
  });

  it("names the meal in flight, and the one whose tap failed for a reason the card should say (not the handled ones)", () => {
    h.mutation = { isPending: true, isError: false, error: null, variables: { date: "2026-10-14", meal: LUNCH } };
    expect(useOneTapServe(BABY)).toMatchObject({ pendingSlot: id(51), failedSlot: null });
    for (const error of [blocked, served, notToday]) {
      h.mutation = { isPending: false, isError: true, error, variables: { date: "2026-10-14", meal: LUNCH } };
      expect(useOneTapServe(BABY).failedSlot).toBeNull();
    }
    h.mutation = { isPending: false, isError: true, error: new ApiError(500, "boom"), variables: { date: "2026-10-14", meal: LUNCH } };
    expect(useOneTapServe(BABY)).toMatchObject({ pendingSlot: null, failedSlot: id(51) });
  });

  it("reads the server's answers by their codes only", () => {
    expect(cannotServeAsPlanned(blocked)).toBe(true);
    expect(cannotServeAsPlanned(served)).toBe(false);
    expect(cannotServeAsPlanned(new ApiError(400, "cannot_serve_as_planned", { error: "cannot_serve_as_planned" }))).toBe(false);
    expect(isNotToday(notToday)).toBe(true);
    expect(isNotToday(blocked)).toBe(false);
    expect(isNotToday(new Error("not_today"))).toBe(false);
  });
});
