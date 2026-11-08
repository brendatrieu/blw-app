import { keepPreviousData, useIsMutating, useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { CopyPlanInput, DailyMealsInput, PlanDay, PlannedItemInput, PlannedMeal } from "@blw/shared";
import { addPlannedMeal, copyPlan, fetchPlan, removePlannedMeal, reorderPlanDay, saveDailyMeals, servePlannedMeal, updatePlannedMeal } from "./api.js";
import { addDays, deviceTimeZone, planDaysAhead } from "./plan.js";
import { useCelebration } from "../../components/ui/Celebration.js";
import { ApiError } from "../../lib/api.js";
import { track } from "../../lib/usage/track.js";
import { failureKind, foodCountBucket, isOffline, mealRecipeKindProps } from "../../lib/usage/properties.js";
import { containersEmptiedBy, mealEditHref } from "../plate/plate.js";
import {
  afterNewMeal,
  invalidateAfterNewMeal,
  refetchChangedRecipe,
  snapshotMealCelebrationContext,
} from "../tracking/hooks.js";

export const planKeys = {
  range: (babyId: string, from: string, to: string) => ["plan", babyId, from, to] as const,
};

const planQuery = (babyId: string | undefined, from: string, to: string) => ({
  queryKey: planKeys.range(babyId ?? "", from, to),
  queryFn: () => fetchPlan(babyId!, from, to, deviceTimeZone()),
  enabled: Boolean(babyId),
});

/** A baby's plan from `from` to `to`, flags as of the device's today. */
export function usePlan(babyId: string | undefined, from: string, to: string) {
  return useQuery(planQuery(babyId, from, to));
}

/** Several weeks at once, each named by its first day (the Copy sheet's selected days
 * may sit in weeks the strip isn't showing), as one lookup by date. The
 * same cache entries the Meal plan reads. */
export function usePlanWeeks(babyId: string | undefined, weekStarts: readonly string[]): (date: string) => PlanDay | undefined {
  const weeks = useQueries({ queries: [...new Set(weekStarts)].map((start) => planQuery(babyId, start, addDays(start, 6))) });
  return (date) => {
    for (const week of weeks) {
      const day = week.data?.days.find((entry) => entry.date === date);
      if (day) return day;
    }
    return undefined;
  };
}

/** Every cached plan range: a plan write can move another day's flags (a
 * container's running total), and its echo carries no flags (BUILD-3.1). */
function refetchPlans(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["plan"] });
}

export function useSaveDailyMeals(babyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DailyMealsInput) => saveDailyMeals(babyId, input),
    onSuccess: ({ dailyMeals }) => {
      // How many and whether any has a time; never the names.
      track("daily_meals_saved", {
        meal_count: foodCountBucket(dailyMeals.length),
        has_times: dailyMeals.some((meal) => meal.time !== null),
      });
    },
    onSettled: () => refetchPlans(queryClient),
  });
}

/** The 409 a plan write gets when its meal is no longer on that day. */
export function isPlanChanged(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && (error.body as { error?: unknown } | undefined)?.error === "plan_changed";
}

export function useRemovePlannedMeal(babyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // 409 plan_changed: that meal is no longer on the day (removed on another
    // device), which is the outcome asked for, so it is done, not an error.
    mutationFn: ({ date, slotId }: { date: string; slotId: string }) =>
      removePlannedMeal(babyId, date, slotId).catch((error: unknown) => {
        if (isPlanChanged(error)) return undefined;
        throw error;
      }),
    onSettled: () => refetchPlans(queryClient),
  });
}

const REORDER_KEY = ["planReorder"] as const;

/**
 * ⋮ Move up / Move down (909): the day's meals in their new order. It stays
 * pending until the plan has refetched, and `busy` holds every card's Move
 * until then, so the next move is worked out from the order as saved. A 409
 * plan_changed (the day changed elsewhere) fails like any other ("try again")
 * once the refetch shows the day as it is now.
 */
export function useReorderPlanDay(babyId: string) {
  const queryClient = useQueryClient();
  const busy = useIsMutating({ mutationKey: REORDER_KEY }) > 0;
  const mutation = useMutation({
    mutationKey: REORDER_KEY,
    mutationFn: ({ date, slotIds }: { date: string; slotIds: string[] }) => reorderPlanDay(babyId, date, { slotIds }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["plan"] }),
  });
  return { ...mutation, busy };
}

/** The 409 a plan write gets once its meal is served (`items` can't change). */
export function servedMealId(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const body = error.body as { error?: unknown; mealId?: unknown } | undefined;
  return body?.error === "already_served" && typeof body.mealId === "string" ? body.mealId : null;
}

export interface SavePlannedMealVariables {
  date: string;
  /** The meal's slot, or null for a meal "+ Add a meal" makes now. */
  slotId: string | null;
  /** The caller's today, for `days_ahead`. */
  today: string;
  input: { name: string; time: string | null; items: PlannedItemInput[] };
}

/** Plan a meal's Save: PUT the meal, or POST a new one with its items. */
export function useSavePlannedMeal(babyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ date, slotId, input }: SavePlannedMealVariables) =>
      slotId ? updatePlannedMeal(babyId, date, slotId, input) : addPlannedMeal(babyId, date, input),
    onSuccess: (_day, { date, today, input }) => {
      // How many things and whether a container; never which, never the date.
      if (input.items.length === 0) return;
      track("plan_saved", {
        item_count: foodCountBucket(input.items.length),
        has_storage: input.items.some((item) => item.kind === "storage"),
        days_ahead: planDaysAhead(date, today),
      });
    },
    onError: (error) => refetchChangedRecipe(queryClient, error),
    onSettled: () => refetchPlans(queryClient),
  });
}

/** Copy to…'s dry run while the parent chooses: what the copy would warn
 * about. Writes nothing; the last answer stays up while the next loads. */
export function useCopyCheck(babyId: string, input: Omit<CopyPlanInput, "tz" | "dryRun"> | null) {
  return useQuery({
    queryKey: ["planCopyCheck", babyId, input] as const,
    queryFn: () => copyPlan(babyId, { ...input!, dryRun: true, tz: deviceTimeZone() }),
    enabled: input !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/** Copy to…, for real. */
export function useCopyPlan(babyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<CopyPlanInput, "tz" | "dryRun">) => copyPlan(babyId, { ...input, tz: deviceTimeZone() }),
    onSuccess: (result, input) => {
      track("plan_copied", {
        target_count: foodCountBucket(input.targets.length),
        replaced: input.targets.some((target) => target.onClash === "replace"),
        warned: result.warnings.length > 0,
      });
    },
    onSettled: () => refetchPlans(queryClient),
  });
}

// ---------------------------------------------------------------------------
// Serve (SPEC §3.5)
// ---------------------------------------------------------------------------

/** The 409 a one-tap Serve gets when something can't be served exactly as
 * planned (run out, discarded, a deleted food): nothing was logged, and the
 * plate opens with it flagged. */
export function cannotServeAsPlanned(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && (error.body as { error?: unknown } | undefined)?.error === "cannot_serve_as_planned";
}

/** Where a planned meal is served through the plate: a past day's Serve,
 * and today's after a blocked one tap (`/plan/:date/:slotId?serve=1`). */
export const planServePath = (date: string, slotId: string): string => `/plan/${date}/${slotId}?serve=1`;

export interface ServePlannedMealVariables {
  date: string;
  meal: PlannedMeal;
}

/**
 * Today's one-tap Serve. A new meal like any other once it lands
 * (`afterNewMeal`), measured as `meal_logged` via "plan", `one_tap`: the
 * plan's own route answers with the meal, so the props are read off it.
 */
export function useServePlannedMeal(babyId: string | undefined) {
  const queryClient = useQueryClient();
  const { celebrate } = useCelebration();
  return useMutation({
    mutationFn: ({ date, meal }: ServePlannedMealVariables) => {
      if (!babyId) throw new Error("useServePlannedMeal called with no active baby");
      return servePlannedMeal(babyId, date, meal.slotId, deviceTimeZone());
    },
    onMutate: () => snapshotMealCelebrationContext(queryClient, babyId),
    onSuccess: ({ meal: created }, { meal }, context) => {
      const items = created.items ?? [];
      track("meal_logged", {
        food_count: foodCountBucket(created.foods.length),
        ...mealRecipeKindProps(queryClient, created.recipes?.map((recipe) => recipe.id) ?? (created.recipeId ? [created.recipeId] : [])),
        from_storage: items.some((item) => item.kind === "storage"),
        via: "plan",
        one_tap: true,
        leftovers_saved: false,
        has_notes: false,
        is_first_meal: context?.hadAnyMeals !== true,
        backdated: "now",
        offline: isOffline(),
        has_left_out: items.some((item) => item.kind === "recipe" && item.leftOut.length > 0),
      });
      // What it emptied, read off the plan as the card showed it.
      const planned = meal.items.flatMap((item) => (item.kind === "storage" ? [item] : []));
      const emptied = containersEmptiedBy(
        planned.map((item) => ({ kind: "storage" as const, storageItemId: item.container.id, servings: item.servings })),
        planned.map((item) => item.container),
      );
      afterNewMeal(queryClient, babyId, created, emptied, context, celebrate);
    },
    onError: (error) => {
      // The answers the card handles are the flow, not failures: a blocked
      // one tap opens the plate, an already served meal opens that meal, and
      // a day that is no longer today refetches (VERIFY-p4-c1 #3).
      if (!cannotServeAsPlanned(error) && servedMealId(error) === null && !isNotToday(error)) track("meal_save_failed", { via: "plan", kind: failureKind(error), offline: isOffline() });
    },
    onSettled: () => invalidateAfterNewMeal(queryClient, babyId),
  });
}

/**
 * Serve on a planned meal's card (the plan and Home's Up next card):
 * - today, one tap; when something can't be served as planned, the plate
 *   opens with it flagged; a meal already served elsewhere opens that
 *   meal's Edit (ledger 966);
 *   a page left open past midnight just refetches (`not_today`), and the
 *   day then offers the past-day Serve;
 * - an earlier day, the plate prefilled from the plan (When = its time);
 * - a later day has no Serve (`canServe`).
 * `failedSlot` is the meal whose one tap failed otherwise ("try again").
 */
export function useOneTapServe(babyId: string | undefined) {
  const serve = useServePlannedMeal(babyId);
  const navigate = useNavigate();
  const error = serve.error;
  const handled = cannotServeAsPlanned(error) || servedMealId(error) !== null || isNotToday(error);
  return {
    pendingSlot: serve.isPending ? (serve.variables?.meal.slotId ?? null) : null,
    failedSlot: serve.isError && !handled ? (serve.variables?.meal.slotId ?? null) : null,
    serve: (date: string, today: string, meal: PlannedMeal) => {
      if (date < today) {
        navigate(planServePath(date, meal.slotId));
        return;
      }
      serve.mutate(
        { date, meal },
        {
          onError: (failure) => {
            if (cannotServeAsPlanned(failure)) navigate(planServePath(date, meal.slotId));
            const served = servedMealId(failure);
            if (served) navigate(mealEditHref(served));
          },
        },
      );
    },
  };
}

/** The 400 a one tap gets once its day is no longer today (SPEC §3.5 step 0). */
export function isNotToday(error: unknown): boolean {
  return error instanceof ApiError && error.status === 400 && (error.body as { error?: unknown } | undefined)?.error === "not_today";
}
