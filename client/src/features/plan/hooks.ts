import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { CopyPlanInput, DailyMealsInput, PlanDay, PlannedItemInput } from "@blw/shared";
import { addPlannedMeal, copyPlan, fetchPlan, removePlannedMeal, saveDailyMeals, updatePlannedMeal } from "./api.js";
import { addDays, deviceTimeZone, planDaysAhead } from "./plan.js";
import { ApiError } from "../../lib/api.js";
import { track } from "../../lib/usage/track.js";
import { foodCountBucket } from "../../lib/usage/properties.js";
import { refetchChangedRecipe } from "../tracking/hooks.js";

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

/** Several Monday-to-Sunday weeks at once (the Copy sheet's selected days
 * may sit in weeks the strip isn't showing), as one lookup by date. The
 * same cache entries the Meal plan reads. */
export function usePlanWeeks(babyId: string | undefined, mondays: readonly string[]): (date: string) => PlanDay | undefined {
  const weeks = useQueries({ queries: [...new Set(mondays)].map((monday) => planQuery(babyId, monday, addDays(monday, 6))) });
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
