import type {
  AddPlannedMealInput,
  CopyPlanInput,
  CopyPlanResponse,
  DailyMealsInput,
  DailyMealsResponse,
  PlanDay,
  PlanResponse,
  UpdatePlannedMealInput,
} from "@blw/shared";
import { apiDelete, apiGet, apiPost, apiPut } from "../../lib/api.js";

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

/** Plan a meal's Save: its name, time and items (the one rename, 810). */
export function updatePlannedMeal(babyId: string, date: string, slotId: string, input: UpdatePlannedMealInput): Promise<PlanDay> {
  return apiPut<PlanDay>(`${base(babyId)}/plan/${date}/meals/${slotId}`, input);
}

/** "+ Add a meal": a new meal on that day, with what is on it. */
export function addPlannedMeal(babyId: string, date: string, input: AddPlannedMealInput): Promise<PlanDay> {
  return apiPost<PlanDay>(`${base(babyId)}/plan/${date}/meals`, input);
}

/** ⋮ Remove: one meal off one day (a meal logged from it stays logged). */
export function removePlannedMeal(babyId: string, date: string, slotId: string): Promise<PlanDay> {
  return apiDelete<PlanDay>(`${base(babyId)}/plan/${date}/meals/${slotId}`);
}

/** Copy to… (`dryRun` asks only what it would do, with its warnings). */
export function copyPlan(babyId: string, input: CopyPlanInput): Promise<CopyPlanResponse> {
  return apiPost<CopyPlanResponse>(`${base(babyId)}/plan/copy`, input);
}
