import { z } from "zod";
import { parseCalendarDate } from "./babies.js";
import { PLATE_ITEMS_MAX, plateFoodSchema, plateItemInputSchema, plateKey, timeZoneSchema } from "./plate.js";
import { storageItemSchema, type StorageItem } from "./storage.js";
import type { MealItem } from "./tracking.js";

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

/** How far `timeZone`'s wall clock is ahead of UTC at the instant `at`, in ms. */
function zoneOffset(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(at));
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
  const wall = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return wall - Math.floor(at / 1000) * 1000;
}

/**
 * The instant a local wall-clock time names in `timeZone` (SPEC §3.4
 * `localInstant`; the start of a day is `"00:00"`). The zone's offsets a day
 * either side tell a DST change apart: in a repeated hour the earlier instant
 * wins, and a skipped hour moves forward by the gap (Temporal's
 * "compatible"), so 02:30 on a spring-forward night is 03:30.
 */
export function localInstant(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const wall = Date.UTC(year!, month! - 1, day!, Number(time.slice(0, 2)), Number(time.slice(3, 5)));
  const before = zoneOffset(wall - DAY_MS, timeZone);
  const valid = [before, zoneOffset(wall + DAY_MS, timeZone)]
    .map((offset) => wall - offset)
    .filter((at) => at + zoneOffset(at, timeZone) === wall);
  return new Date(valid.length > 0 ? Math.min(...valid) : wall - before);
}

/** When a past day's Serve prefills (SPEC §3.5): the planned time, or noon. */
export function plannedServedAt(date: string, time: string | null, timeZone: string): Date {
  return localInstant(date, time ?? "12:00", timeZone);
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

/** POST /api/babies/:babyId/plan/:date/meals ("+ Add a meal"): the new
 * meal and, from its Plan a meal page, what is on it, in one write. */
export const addPlannedMealInputSchema = z.object({
  name: planNameSchema,
  time: planTimeSchema.nullable().optional(),
  items: plannedItemsInputSchema.optional(),
});
export type AddPlannedMealInput = z.input<typeof addPlannedMealInputSchema>;

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
// Flags (SPEC §3.4): computed on every read, never stored
// ---------------------------------------------------------------------------

/**
 * What a planned container may need the parent to know. Only an UNSERVED
 * item on today or later carries any.
 * - `may_run_out`: counting every unserved use from today on, across all of
 *   the account's babies, in plan order, this one goes past what is left.
 * - `container_gone`: marked finished or discarded in Storage (instead of
 *   `may_run_out`; Serve still refuses it). Its own wording, by status.
 * - `past_best_by`: the day is after the container's Best by date.
 * - `past_use_within`: no Best by, and the storage window has run out by the
 *   meal's time (the start of the day when the meal has none).
 */
export const planFlagSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("may_run_out") }),
  z.object({ kind: z.literal("container_gone"), status: z.enum(["finished", "discarded"]) }),
  z.object({ kind: z.literal("past_best_by") }),
  z.object({ kind: z.literal("past_use_within") }),
]);
export type PlanFlag = z.infer<typeof planFlagSchema>;

/** One planned use of a container, as the flags read it. */
export interface PlanFlagUse {
  /** The planned item's id. */
  id: string;
  date: string;
  /** The planned meal's time, `HH:MM`, or null. */
  time: string | null;
  mealPosition: number;
  position: number;
  served: boolean;
  storageItemId: string;
  servings: number;
}
export type PlanFlagContainer = Pick<StorageItem, "id" | "status" | "servingsLeft" | "bestBy" | "expiresAt">;

/** Plan order: day, meal, item (and id, so two babies' meals never tie). */
const byPlanOrder = (a: PlanFlagUse, b: PlanFlagUse) =>
  (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
  a.mealPosition - b.mealPosition ||
  a.position - b.position ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Each counted use's flags, by planned item id (SPEC §3.4). `uses` should be
 * every container use of the account's plans, all babies, from `today` on;
 * past and served ones are skipped here anyway. A tracked container has
 * `servingsLeft` left, an untracked one never runs out. A container marked
 * finished or discarded has ONLY `container_gone` (chair, VERIFY-p3-c1 #7):
 * once it is gone, how long it keeps is beside the point.
 */
export function planFlags(
  uses: readonly PlanFlagUse[],
  containers: ReadonlyMap<string, PlanFlagContainer>,
  today: string,
  timeZone: string,
): Map<string, PlanFlag[]> {
  const flags = new Map<string, PlanFlag[]>();
  const planned = new Map<string, number>();
  for (const use of uses.filter((entry) => !entry.served && entry.date >= today).sort(byPlanOrder)) {
    const container = containers.get(use.storageItemId);
    if (!container) continue;
    if (container.status !== "active") {
      flags.set(use.id, [{ kind: "container_gone", status: container.status }]);
      continue;
    }
    const list: PlanFlag[] = [];
    if (container.servingsLeft !== null) {
      const total = (planned.get(container.id) ?? 0) + use.servings;
      planned.set(container.id, total);
      if (total > container.servingsLeft) list.push({ kind: "may_run_out" });
    }
    if (container.bestBy !== null) {
      // "Best by the 15th" means the 15th is fine (storage/freshness.ts).
      if (use.date > container.bestBy) list.push({ kind: "past_best_by" });
    } else if (localInstant(use.date, use.time ?? "00:00", timeZone).getTime() >= Date.parse(container.expiresAt)) {
      list.push({ kind: "past_use_within" });
    }
    flags.set(use.id, list);
  }
  return flags;
}

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
  z.object({
    kind: z.literal("storage"),
    id: uuid,
    servings: z.number().int(),
    container: storageItemSchema,
    /** Present on answers that know the caller's day (the plan GET, Copy and
     * Serve); absent on the echo of a plain plan write, which sends no `tz`.
     * Any write can move another day's flags, so the client refetches. */
    flags: z.array(planFlagSchema).optional(),
  }),
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

// ---------------------------------------------------------------------------
// Copy to… (SPEC §3.3; 805/808/814)
// ---------------------------------------------------------------------------

export const COPY_TARGETS_MAX = 50;

const slotRefSchema = z.object({ date: planDateSchema, slotId: uuid });

/**
 * POST /api/babies/:babyId/plan/copy. The source meal's items go to each
 * target in turn, in ONE transaction; a target that already has items keeps
 * them or has them replaced, as the parent chose per meal, and a served
 * target is never touched. Targets are today or later in `tz`. `dryRun`
 * writes nothing and answers what the copy would do, with its warnings.
 */
export const copyPlanInputSchema = z
  .object({
    source: slotRefSchema,
    targets: z
      .array(slotRefSchema.extend({ onClash: z.enum(["keep", "replace"]) }))
      .min(1)
      .max(COPY_TARGETS_MAX),
    dryRun: z.boolean().optional(),
    tz: timeZoneSchema,
  })
  .superRefine(({ source, targets }, ctx) => {
    const keys = targets.map((target) => `${target.date}/${target.slotId}`);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targets"], message: "Each meal can be a target once" });
    }
    if (keys.includes(`${source.date}/${source.slotId}`)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targets"], message: "A meal cannot be copied onto itself" });
    }
  });
export type CopyPlanInput = z.input<typeof copyPlanInputSchema>;

/** The sheet's box (PP-COPY round 5), one entry per container and kind; the
 * client names the container from the source meal it already shows. */
export const copyWarningSchema = z.discriminatedUnion("kind", [
  /** "{n} servings left, planned {m} times" / "may run out before {day}":
   * `date` is the first day a use goes past what is left. */
  z.object({
    kind: z.literal("may_run_out"),
    storageItemId: uuid,
    servingsLeft: z.number().int(),
    plannedTimes: z.number().int(),
    date: planDateSchema,
  }),
  /** "past the Best by date on {day}": the first copied day after it. */
  z.object({ kind: z.literal("past_best_by"), storageItemId: uuid, date: planDateSchema }),
  /** "{item} may not keep until {day}. You can still copy.": the first
   * copied meal the storage window does not reach (at that meal's time). */
  z.object({ kind: z.literal("past_use_within"), storageItemId: uuid, date: planDateSchema }),
  /** Marked finished or discarded in Storage; wording by status (§12). */
  z.object({ kind: z.literal("container_gone"), storageItemId: uuid, status: z.enum(["finished", "discarded"]) }),
  /** "{food} was deleted. You can still copy, then swap it out.": a custom
   * food deleted since it was planned (Serve would block it). */
  z.object({ kind: z.literal("food_deleted"), foodId: uuid }),
]);
export type CopyWarning = z.infer<typeof copyWarningSchema>;

export const copyPlanResponseSchema = z.object({
  /** Targets that got the copy ("Copied to {n} meals"). */
  filled: z.number().int(),
  skipped: z.array(slotRefSchema.extend({ reason: z.enum(["served", "kept"]) })),
  warnings: z.array(copyWarningSchema),
  /** Each target day as it now is; empty on a dry run. */
  days: z.array(planDaySchema),
});
export type CopyPlanResponse = z.infer<typeof copyPlanResponseSchema>;

/**
 * The warnings of a copy, read off the flags of the plan as it stands WITH
 * the copies (`copied` = the new planned item ids). Running out counts every
 * use of the container; Best by and use within speak only of the copies,
 * since a copy takes its target's day and time.
 */
export function copyWarnings(
  uses: readonly PlanFlagUse[],
  flags: ReadonlyMap<string, readonly PlanFlag[]>,
  copied: ReadonlySet<string>,
  containers: ReadonlyMap<string, PlanFlagContainer>,
): CopyWarning[] {
  const counted = uses.filter((use) => flags.has(use.id)).sort(byPlanOrder);
  const warnings: CopyWarning[] = [];
  for (const storageItemId of new Set(counted.filter((use) => copied.has(use.id)).map((use) => use.storageItemId))) {
    const container = containers.get(storageItemId);
    if (!container) continue;
    const mine = counted.filter((use) => use.storageItemId === storageItemId);
    const first = (kind: PlanFlag["kind"], copiesOnly: boolean) =>
      mine.find((use) => (!copiesOnly || copied.has(use.id)) && flags.get(use.id)!.some((flag) => flag.kind === kind))?.date;
    if (container.status !== "active") warnings.push({ kind: "container_gone", storageItemId, status: container.status });
    const runsOut = first("may_run_out", false);
    if (runsOut && container.servingsLeft !== null) {
      warnings.push({ kind: "may_run_out", storageItemId, servingsLeft: container.servingsLeft, plannedTimes: mine.length, date: runsOut });
    }
    const pastBestBy = first("past_best_by", true);
    if (pastBestBy) warnings.push({ kind: "past_best_by", storageItemId, date: pastBestBy });
    const pastUseWithin = first("past_use_within", true);
    if (pastUseWithin) warnings.push({ kind: "past_use_within", storageItemId, date: pastUseWithin });
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Serve a planned meal (SPEC §3.5)
// ---------------------------------------------------------------------------

/** POST /api/babies/:babyId/plan/:date/meals/:slotId/serve: one tap, TODAY
 * in `tz` only (else 400 `not_today`). A past day serves through the plate
 * (`plannedServedAt`); a future day has no Serve. */
export const servePlannedMealInputSchema = z.object({ tz: timeZoneSchema });
export type ServePlannedMealInput = z.input<typeof servePlannedMealInputSchema>;

/** 201: the logged meal and the day, now showing it served. */
export interface ServePlannedMealResponse {
  meal: MealItem;
  day: PlanDay;
}

/**
 * Why a one-tap Serve could not serve an item exactly as planned. The 409
 * `cannot_serve_as_planned` lists every one and writes nothing; the client
 * opens the plate with them flagged (pick 3). Nothing leaves the plan.
 * - `short`: fewer servings left than planned (`servingsLeft` says how many);
 * - `finished` / `discarded`: the container's status;
 * - `deleted`: a custom food deleted since it was planned;
 * - `nothing_counts`: every ingredient of the plate's recipes is left out
 *   (a recipe changed since it was planned).
 */
export const plannedServeBlockSchema = z.object({
  plannedItemId: uuid,
  reason: z.enum(["short", "finished", "discarded", "deleted", "nothing_counts"]),
  servingsLeft: z.number().int().nullable(),
});
export type PlannedServeBlock = z.infer<typeof plannedServeBlockSchema>;
export const cannotServeAsPlannedSchema = z.object({
  error: z.literal("cannot_serve_as_planned"),
  message: z.string(),
  blocked: z.array(plannedServeBlockSchema).min(1),
});
