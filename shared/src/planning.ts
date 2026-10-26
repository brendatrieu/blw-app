import { z } from "zod";
import { parseCalendarDate } from "./babies.js";
import { PLATE_ITEMS_MAX, plateFoodSchema, plateItemInputSchema, plateKey } from "./plate.js";
import { storageItemSchema } from "./storage.js";

/**
 * Ledger 903 (plan SPEC §3, §4.2-4.3): meal planning, per baby. A plan day
 * holds meals (Breakfast, Lunch, …), each holding planned items in the
 * plate's shapes. A day nobody has written to is VIRTUAL: it shows the
 * baby's current daily meals, and each meal's `slotId` is the daily meal's
 * id. The first write materializes it; from then on a meal's `slotId` is its
 * own row id, and the daily meal's id still finds it.
 */

export const DAILY_MEALS_MAX = 12;
export const PLAN_NAME_MAX = 40;
/** GET /plan answers at most this many days (a month view at most). */
export const PLAN_RANGE_DAYS_MAX = 31;

const uuid = z.string().uuid();
const DAY_MS = 24 * 60 * 60 * 1000;

/** A local calendar day, `YYYY-MM-DD`, that exists (no 2026-02-30). */
export const planDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD")
  .refine((value) => parseCalendarDate(value) !== null, "not a real date");

/** A local wall-clock time, `HH:MM` (24 h). */
export const planTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "a time as HH:MM");

export const planNameSchema = z.string().trim().min(1).max(PLAN_NAME_MAX);

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The caller's IANA zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`).
 * Required wherever "today" matters; the server never assumes one. */
export const timeZoneSchema = z.string().min(1).max(64).refine(isTimeZone, "an IANA time zone");

/** The calendar day `at` falls on in `timeZone`, as `YYYY-MM-DD`. */
export function localDate(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Every day from `from` to `to`, both included (calendar arithmetic only). */
export function planDates(from: string, to: string): string[] {
  const start = parseCalendarDate(from);
  const end = parseCalendarDate(to);
  if (start === null || end === null) return [];
  const dates: string[] = [];
  for (let ms = start; ms <= end; ms += DAY_MS) dates.push(new Date(ms).toISOString().slice(0, 10));
  return dates;
}

// ---------------------------------------------------------------------------
// Daily meals
// ---------------------------------------------------------------------------

export const dailyMealSchema = z.object({ id: uuid, name: z.string(), time: planTimeSchema.nullable() });
export type DailyMeal = z.infer<typeof dailyMealSchema>;

/** What a baby's plan days start with until the parent edits Daily meals
 * (chair §10.3). Fixed ids, so a virtual day's slots stay the same. */
export const DEFAULT_DAILY_MEALS: readonly DailyMeal[] = [
  { id: "e29e493f-0a61-48b1-ac7b-771c3c47da5a", name: "Breakfast", time: null },
  { id: "c6477e79-7467-4d42-bd88-7a224f4b166c", name: "Lunch", time: null },
  { id: "41416c50-03e2-4d44-8754-159bceb71cb4", name: "Dinner", time: null },
  { id: "59f47f6c-df49-489b-8298-37fe60953704", name: "Snack", time: null },
];

/** PUT /api/babies/:babyId/daily-meals. A kept meal sends its id; the server
 * mints one for a new meal. Only virtual days change (804). */
export const dailyMealsInputSchema = z.object({
  meals: z
    .array(z.object({ id: uuid.optional(), name: planNameSchema, time: planTimeSchema.nullable().optional() }))
    .min(1)
    .max(DAILY_MEALS_MAX)
    .refine((meals) => {
      const ids = meals.flatMap((meal) => (meal.id ? [meal.id] : []));
      return new Set(ids).size === ids.length;
    }, "Each daily meal can be sent once"),
});
export type DailyMealsInput = z.input<typeof dailyMealsInputSchema>;

export const dailyMealsResponseSchema = z.object({ dailyMeals: z.array(dailyMealSchema) });
export type DailyMealsResponse = z.infer<typeof dailyMealsResponseSchema>;

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/** GET /api/babies/:babyId/plan?from&to&tz */
export const planQuerySchema = z
  .object({ from: planDateSchema, to: planDateSchema, tz: timeZoneSchema })
  .superRefine(({ from, to }, ctx) => {
    const start = parseCalendarDate(from);
    const end = parseCalendarDate(to);
    if (start === null || end === null) return;
    const days = (end - start) / DAY_MS + 1;
    if (days < 1 || days > PLAN_RANGE_DAYS_MAX) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: `from 1 to ${PLAN_RANGE_DAYS_MAX} days, not before from` });
    }
  });
export type PlanQuery = z.infer<typeof planQuerySchema>;

export const planDateParamsSchema = z.object({ babyId: uuid, date: planDateSchema });
export const planSlotParamsSchema = z.object({ babyId: uuid, date: planDateSchema, slotId: uuid });

/** POST /api/babies/:babyId/plan/:date/meals ("+ Add a meal"). */
export const addPlannedMealInputSchema = z.object({
  name: planNameSchema,
  time: planTimeSchema.nullable().optional(),
});
export type AddPlannedMealInput = z.input<typeof addPlannedMealInputSchema>;

const [plateFood, plateRecipe, plateStorage] = plateItemInputSchema.options;

/** A planned item is a plate item without stars (SPEC §4.3). A recipe's
 * `leftOutFoodIds` is intent, checked against its current ingredients; a
 * container always says how many servings it will take. */
export const plannedItemInputSchema = z.discriminatedUnion("kind", [
  plateFood.omit({ id: true, rating: true }),
  plateRecipe.omit({ id: true, rating: true }),
  plateStorage.omit({ ratings: true }).required({ servings: true }),
]);
export type PlannedItemInput = z.infer<typeof plannedItemInputSchema>;

/** A planned meal's whole list; empty clears it. The plate's identity rule
 * (799) holds: each food, recipe and container at most once. */
export const plannedItemsInputSchema = z
  .array(plannedItemInputSchema)
  .max(PLATE_ITEMS_MAX)
  .refine((items) => new Set(items.map(plateKey)).size === items.length, "Each food, recipe and container can be on the plate once");

/** PUT /api/babies/:babyId/plan/:date/meals/:slotId. `name` is the one
 * rename (810); `time: null` clears it; `items` on a served meal is a 409. */
export const updatePlannedMealInputSchema = z
  .object({
    name: planNameSchema.optional(),
    time: planTimeSchema.nullable().optional(),
    items: plannedItemsInputSchema.optional(),
  })
  .refine((body) => body.name !== undefined || body.time !== undefined || body.items !== undefined, "Nothing to change");
export type UpdatePlannedMealInput = z.input<typeof updatePlannedMealInputSchema>;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const plannedItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("food"), id: uuid, food: plateFoodSchema }),
  z.object({
    kind: z.literal("recipe"),
    id: uuid,
    recipe: z.object({ id: uuid, title: z.string() }),
    /** The planned leave-outs that are still ingredients of the recipe. */
    leftOut: z.array(plateFoodSchema),
  }),
  z.object({ kind: z.literal("storage"), id: uuid, servings: z.number().int(), container: storageItemSchema }),
]);
export type PlannedItem = z.infer<typeof plannedItemSchema>;

export const plannedMealSchema = z.object({
  /** The row id, or on a virtual day the daily meal's id. Writes take either. */
  slotId: uuid,
  name: z.string(),
  time: planTimeSchema.nullable(),
  position: z.number().int(),
  served: z.object({ mealId: uuid, servedAt: z.string() }).nullable(),
  items: z.array(plannedItemSchema),
});
export type PlannedMeal = z.infer<typeof plannedMealSchema>;

export const planDaySchema = z.object({
  date: planDateSchema,
  /** False for a virtual day: its meals are the daily meals, nothing stored. */
  planned: z.boolean(),
  meals: z.array(plannedMealSchema),
});
export type PlanDay = z.infer<typeof planDaySchema>;

export const planResponseSchema = z.object({
  /** The caller's today, in the `tz` it sent. */
  today: planDateSchema,
  dailyMeals: z.array(dailyMealSchema),
  days: z.array(planDaySchema),
});
export type PlanResponse = z.infer<typeof planResponseSchema>;

// ---------------------------------------------------------------------------
// Today's plan
// ---------------------------------------------------------------------------

/** ponytail: calibration knob, not a rule of nature. How long after its time a
 * timed meal stops being "next" (chair decision on Q8). */
export const NEXT_MEAL_GRACE_MIN = 120;

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * Which of today's meals Today's plan opens on (SPEC §4.3): the first
 * unserved meal in the parent's order, skipping a TIMED meal once more than
 * NEXT_MEAL_GRACE_MIN minutes have passed since its time, as long as a later
 * unserved meal exists. Times never reorder meals. `nowLocal` is the local
 * wall-clock time, `HH:MM`. Null when everything is served.
 */
export function nextPlannedMeal<T extends { position: number; time: string | null; served: unknown }>(
  meals: readonly T[],
  nowLocal: string,
): T | null {
  const open = meals.filter((meal) => !meal.served).sort((a, b) => a.position - b.position);
  const now = minutes(nowLocal);
  return (
    open.find((meal, index) => meal.time === null || now - minutes(meal.time) <= NEXT_MEAL_GRACE_MIN || index === open.length - 1) ??
    null
  );
}
