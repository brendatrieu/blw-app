import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { DailyMealsInput } from "@blw/shared";
import { fetchPlan, removePlannedMeal, saveDailyMeals } from "./api.js";
import { deviceTimeZone } from "./plan.js";
import { ApiError } from "../../lib/api.js";
import { track } from "../../lib/usage/track.js";
import { foodCountBucket } from "../../lib/usage/properties.js";

export const planKeys = {
  range: (babyId: string, from: string, to: string) => ["plan", babyId, from, to] as const,
};

/** A baby's plan from `from` to `to`, flags as of the device's today. */
export function usePlan(babyId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: planKeys.range(babyId ?? "", from, to),
    queryFn: () => fetchPlan(babyId!, from, to, deviceTimeZone()),
    enabled: Boolean(babyId),
  });
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
