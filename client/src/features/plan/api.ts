import type { DailyMealsInput, DailyMealsResponse, PlanDay, PlanResponse } from "@blw/shared";
import { apiDelete, apiGet, apiPut } from "../../lib/api.js";

const base = (babyId: string) => `/api/babies/${encodeURIComponent(babyId)}`;

/** GET a baby's plan, `from` to `to` (both included), flags as of `tz`'s today. */
export function fetchPlan(babyId: string, from: string, to: string, tz: string): Promise<PlanResponse> {
  const query = new URLSearchParams({ from, to, tz });
  return apiGet<PlanResponse>(`${base(babyId)}/plan?${query.toString()}`);
}

/** PUT the Daily meals list; only days nothing was planned on follow it. */
export function saveDailyMeals(babyId: string, input: DailyMealsInput): Promise<DailyMealsResponse> {
  return apiPut<DailyMealsResponse>(`${base(babyId)}/daily-meals`, input);
}

/** ⋮ Remove: one meal off one day (a meal logged from it stays logged). */
export function removePlannedMeal(babyId: string, date: string, slotId: string): Promise<PlanDay> {
  return apiDelete<PlanDay>(`${base(babyId)}/plan/${date}/meals/${slotId}`);
}
