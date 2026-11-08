// The meal plan's rules as plain data (ledger 904, SPEC §5): which week a day
// sits in, how a planned meal reads on its card, and the Daily meals list
// edits. The plan screens only render this and call the hooks, so a native
// shell can say and do the same.
import {
  DAILY_MEALS_MAX,
  nextPlannedMeal,
  type CopyPlanInput,
  type CopyPlanResponse,
  type CopyWarning,
  type DailyMeal,
  type DailyMealsInput,
  type PlanDay,
  type PlannedItem,
  type PlannedMeal,
} from "@blw/shared";
import { foodPlate, type Plate } from "../catalog/foodEmoji.js";
import { storageItemCluster } from "../storage/components/StorageItemCard.js";
import { bestByLabel, countdownLabel, servePartHint, storageItemTitle } from "../storage/format.js";
import { NOTHING_COUNTS_MESSAGE, RECIPE_PLATE, mealEditHref } from "../plate/plate.js";
import type { FormErrors } from "../../lib/forms.js";
import {
  containerGoneCopyWarning,
  foodDeletedCopyWarning,
  mayRunOutCopyWarning,
  pastBestByCopyWarning,
  pastUseWithinCopyWarning,
  planFlagLine,
  servingsLeftHeading,
} from "./copy.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The device's IANA zone: what every plan read and write sends as `tz`. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** A `YYYY-MM-DD` day `n` days later (or earlier). Calendar arithmetic in UTC,
 * so no zone or DST ever moves it. */
export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** The Sunday-to-Saturday week holding `date` (ledger 969: S M T W T F S). */
export function weekOf(date: string): string[] {
  const start = addDays(date, -new Date(`${date}T00:00:00Z`).getUTCDay());
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

const utc = (date: string) => new Date(`${date}T00:00:00Z`);
const month = (date: string) => utc(date).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
export const dayOfMonth = (date: string): number => utc(date).getUTCDate();

/** The week's label (PP-COPY round 3): "Oct 12 – 18", or "Oct 26 – Nov 1"
 * across a month. */
export function weekLabel(week: readonly string[]): string {
  const first = week[0]!;
  const last = week[week.length - 1]!;
  const end = month(first) === month(last) ? `${dayOfMonth(last)}` : `${month(last)} ${dayOfMonth(last)}`;
  return `${month(first)} ${dayOfMonth(first)} – ${end}`;
}

/** The strip's weekday initials, Sunday first (ledger 969). */
export const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"] as const;

/** A day button's accessible name: the whole date ("Wednesday, October 14"). */
export function dayName(date: string): string {
  return utc(date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

/** Whether the strip shows a dot under the day: anything planned on it. */
export function dayHasPlan(day: PlanDay | undefined): boolean {
  return Boolean(day?.meals.some((meal) => meal.items.length > 0));
}

/** A meal's optional time, `HH:MM`, in the app's own format ("7:30 AM"). */
export function mealTimeLabel(time: string): string {
  return new Date(2000, 0, 1, Number(time.slice(0, 2)), Number(time.slice(3, 5))).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** What the Time sheet's wheel shows (ledger 926): Hour 1-12, Minute in
 * 5-minute steps, AM or PM. */
export interface ClockParts {
  hour12: number;
  minute: number;
  meridiem: "AM" | "PM";
}

/** `HH:MM` on the nearest 5-minute step (09:39 -> 09:40, 09:37 -> 09:35),
 * never past 23:55, so it never wraps to the next day (23:58 -> 23:55). */
export function nearestFiveMinutes(time: string): string {
  const minutes = Math.min(Math.round((Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))) / 5) * 5, 23 * 60 + 55);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** The wheel's parts for `HH:MM`, on its nearest 5-minute step. */
export function clockParts(time: string): ClockParts {
  const stepped = nearestFiveMinutes(time);
  const hour24 = Number(stepped.slice(0, 2));
  return { hour12: hour24 % 12 || 12, minute: Number(stepped.slice(3, 5)), meridiem: hour24 < 12 ? "AM" : "PM" };
}

/** Back to `HH:MM` (12 AM is 00, 12 PM is 12). */
export function clockTime(parts: ClockParts): string {
  const hour24 = (parts.hour12 % 12) + (parts.meridiem === "PM" ? 12 : 0);
  return `${String(hour24).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

/** One line of a planned meal's card (CD-Plan-Day): its plate and name. */
export interface PlannedLine {
  key: string;
  name: string;
  deleted?: boolean | undefined;
  plates: Plate[];
  /** A container's "Fridge · 2 of 6 left" (the Copy sheet's plate shows it). */
  detail?: string;
}

/** The card's lines, in plan order: a food, a recipe, a container under
 * Storage's own name. */
export function plannedLines(meal: Pick<PlannedMeal, "items">): PlannedLine[] {
  return meal.items.map((item): PlannedLine => {
    if (item.kind === "food") return { key: item.id, name: item.food.name, deleted: item.food.deleted, plates: [foodPlate(item.food)] };
    if (item.kind === "recipe") return { key: item.id, name: item.recipe.title, plates: [RECIPE_PLATE] };
    return {
      key: item.id,
      name: storageItemTitle(item.container),
      plates: storageItemCluster(item.container).plates,
      detail: servePartHint(item.container),
    };
  });
}

/** One container's flag box (PP-NOTES round 5, decision 7): its name, then
 * one short line per flag. */
export interface FlagNote {
  key: string;
  name: string;
  lines: string[];
}

/** The flag boxes under a planned meal, one per flagged container. */
export function flagNotes(meal: Pick<PlannedMeal, "items">): FlagNote[] {
  return meal.items.flatMap((item: PlannedItem) =>
    item.kind === "storage" && item.flags && item.flags.length > 0
      ? [{ key: item.id, name: storageItemTitle(item.container), lines: item.flags.map(planFlagLine) }]
      : [],
  );
}

// ---------------------------------------------------------------------------
// Daily meals (804, CD-Daily-Meals)
// ---------------------------------------------------------------------------

/** One row of the Daily meals list. `key` is the row's identity on screen;
 * `id` is the saved meal's (absent on a row added here). */
export interface DailyMealRow {
  key: string;
  id?: string;
  name: string;
  time: string | null;
}

export function dailyMealRows(meals: readonly DailyMeal[]): DailyMealRow[] {
  return meals.map((meal) => ({ key: meal.id, id: meal.id, name: meal.name, time: meal.time }));
}

/** The list with the row at `from` moved to `to` (clamped to the list); the
 * same list when nothing moves, so a drag that stays put renders nothing. */
export function moveRow<T>(rows: T[], from: number, to: number): T[] {
  const target = Math.max(0, Math.min(rows.length - 1, to));
  if (from === target || from < 0 || from >= rows.length) return rows;
  const next = [...rows];
  const [row] = next.splice(from, 1);
  next.splice(target, 0, row!);
  return next;
}

/** Where a dragged row belongs: the index of the row whose box holds the
 * pointer, the first or last row past either end. `rows` are the rows'
 * current tops and bottoms, in list order. */
export function dragTarget(pointerY: number, rows: readonly { top: number; bottom: number }[]): number {
  const index = rows.findIndex((row) => pointerY < row.bottom);
  return index === -1 ? rows.length - 1 : index;
}

export const canAddDailyMeal = (rows: readonly unknown[]): boolean => rows.length < DAILY_MEALS_MAX;
export const canRemoveDailyMeal = (rows: readonly unknown[]): boolean => rows.length > 1;

/** The app's own words for an empty name (CustomFoodForm). */
export const NAME_REQUIRED = "Name is required";

/** Each row with a problem, by key: every meal needs a name. */
export function dailyMealErrors(rows: readonly DailyMealRow[]): Record<string, string> {
  return Object.fromEntries(rows.filter((row) => row.name.trim() === "").map((row) => [row.key, NAME_REQUIRED]));
}

/** PUT /daily-meals: kept meals send their id; a time only when set. */
export function toDailyMealsInput(rows: readonly DailyMealRow[]): DailyMealsInput {
  return {
    meals: rows.map((row) => ({
      ...(row.id ? { id: row.id } : {}),
      name: row.name.trim(),
      time: row.time,
    })),
  };
}

/** Ledger 940: whether the Daily meals form differs from the list it opened
 * with, as Save would send it (a name typed and typed back is no change). */
export function dailyMealsChanged(loaded: readonly DailyMeal[], rows: readonly DailyMealRow[]): boolean {
  return JSON.stringify(toDailyMealsInput(rows)) !== JSON.stringify(toDailyMealsInput(dailyMealRows(loaded)));
}

// ---------------------------------------------------------------------------
// Plan a meal (CD-Plan-Meal)
// ---------------------------------------------------------------------------

/** The slot id of Plan a meal opened from "+ Add a meal": a meal not made yet. */
export const NEW_PLANNED_MEAL = "new";

/** A plan card's ⋮ Edit (ledger 954) and its tap (968): an unserved meal
 * opens Plan a meal; a served one opens the logged meal's Edit (the Food
 * log's ⋮ Edit, Add more closed). */
export function planMealEditHref(date: string, meal: Pick<PlannedMeal, "slotId" | "served">): string {
  return meal.served ? mealEditHref(meal.served.mealId) : `/plan/${date}/${meal.slotId}`;
}

/** The read-only Day field (Q7): "Today", "Yesterday", else "Thu, Oct 15". */
export function planDayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  return utc(date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** Plan a meal's own rules: a name (it is the one rename, 810), and, when
 * something is planned, at least one food that counts. Nothing planned is
 * fine: that clears the meal. */
export function validatePlanMeal(values: { name: string; nothingCounts?: boolean }): FormErrors<"name" | "items"> {
  const errors: FormErrors<"name" | "items"> = {};
  if (values.name.trim() === "") errors.name = NAME_REQUIRED;
  if (values.nothingCounts) errors.items = NOTHING_COUNTS_MESSAGE;
  return errors;
}

/** `plan_saved.days_ahead`: how far the day is from today, never the date. */
export function planDaysAhead(date: string, today: string): "past" | "0" | "1" | "2-7" | "8+" {
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
  if (days < 0) return "past";
  if (days <= 1) return days === 0 ? "0" : "1";
  return days <= 7 ? "2-7" : "8+";
}

// ---------------------------------------------------------------------------
// Copy to… (814, CD-Copy-Per-Day, CD-Copy-Warnings)
// ---------------------------------------------------------------------------

/** A day as the Copy sheet names it: "Thu 15". */
export function shortDay(date: string): string {
  return `${utc(date).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" })} ${dayOfMonth(date)}`;
}

/** What is being copied: the source meal's day, slot and name. */
export interface CopySource {
  date: string;
  slotId: string;
  name: string;
}

/** Each selected day (any week) and the meals ticked on it, by slot id. */
export type CopySelection = Readonly<Record<string, readonly string[]>>;
/** Keep it / Replace it per clashing meal, by `copyKey`; absent = Keep it. */
export type CopyChoices = Readonly<Record<string, "keep" | "replace">>;
export const copyKey = (date: string, slotId: string): string => `${date}/${slotId}`;

/** A meal can take the copy unless it is the source or served (never replaced). */
export function canCopyInto(source: CopySource, date: string, meal: Pick<PlannedMeal, "slotId" | "served">): boolean {
  return meal.served === null && !(date === source.date && meal.slotId === source.slotId);
}

/** A day tapped on or off the sheet's strip. A newly selected day starts with
 * the meal named like the source ticked, if it has one (814). */
export function toggleCopyDay(selection: CopySelection, day: PlanDay, source: CopySource): CopySelection {
  if (day.date in selection) {
    const { [day.date]: _dropped, ...rest } = selection;
    return rest;
  }
  const match = day.meals.find((meal) => meal.name === source.name && canCopyInto(source, day.date, meal));
  return { ...selection, [day.date]: match ? [match.slotId] : [] };
}

/** A meal chip tapped. Unticking the last one keeps the day's row (814). */
export function toggleCopySlot(selection: CopySelection, date: string, slotId: string): CopySelection {
  const ticked = selection[date] ?? [];
  return { ...selection, [date]: ticked.includes(slotId) ? ticked.filter((id) => id !== slotId) : [...ticked, slotId] };
}

/** The selected days in date order, with what the plan holds for each. */
export function copyRows(selection: CopySelection, dayOf: (date: string) => PlanDay | undefined) {
  return Object.keys(selection)
    .sort()
    .map((date) => ({ date, day: dayOf(date), ticked: selection[date] ?? [] }));
}

/** A ticked meal that already has something planned (and isn't served). */
export interface CopyClash {
  date: string;
  slotId: string;
  name: string;
  /** What is planned there now, for the clash box. */
  planned: string;
}

/** The ticked meals that may take the copy, each with its Keep it / Replace it. */
export function copyTargets(
  selection: CopySelection,
  dayOf: (date: string) => PlanDay | undefined,
  source: CopySource,
  choices: CopyChoices,
): CopyPlanInput["targets"] {
  return copyRows(selection, dayOf).flatMap(({ date, day, ticked }) =>
    (day?.meals ?? [])
      .filter((meal) => ticked.includes(meal.slotId) && canCopyInto(source, date, meal))
      .map((meal) => ({ date, slotId: meal.slotId, onClash: choices[copyKey(date, meal.slotId)] ?? "keep" })),
  );
}

/** The targets that already have something planned, in day and meal order. */
export function copyClashes(
  selection: CopySelection,
  dayOf: (date: string) => PlanDay | undefined,
  source: CopySource,
): CopyClash[] {
  return copyTargets(selection, dayOf, source, {}).flatMap(({ date, slotId }) => {
    const meal = dayOf(date)?.meals.find((entry) => entry.slotId === slotId);
    if (!meal || meal.items.length === 0) return [];
    return [{ date, slotId, name: meal.name, planned: plannedLines(meal).map((line) => line.name).join(", ") }];
  });
}

/** Whether a Copy would fill any meal: an empty one, or a clash set to
 * Replace it. With every clash on Keep it and nothing empty, Copy stays off,
 * never "Copied to 0 meals" (VERIFY-p4-c1 #4). */
export function copyFillsAny(targets: CopyPlanInput["targets"], clashes: readonly CopyClash[]): boolean {
  const clashed = new Set(clashes.map((clash) => copyKey(clash.date, clash.slotId)));
  return targets.some((target) => target.onClash === "replace" || !clashed.has(copyKey(target.date, target.slotId)));
}

/** The All row's answer: everyone's, or null when they differ. */
export function allClashChoice(clashes: readonly CopyClash[], choices: CopyChoices): "keep" | "replace" | null {
  const picked = new Set(clashes.map((clash) => choices[copyKey(clash.date, clash.slotId)] ?? "keep"));
  return picked.size === 1 ? [...picked][0]! : null;
}

/** Every clash set to one answer by the All row. */
export function setAllClashes(clashes: readonly CopyClash[], choices: CopyChoices, choice: "keep" | "replace"): CopyChoices {
  return { ...choices, ...Object.fromEntries(clashes.map((clash) => [copyKey(clash.date, clash.slotId), choice])) };
}

/** Which day the plan opens on after a Copy: the first it copied to (else
 * the first target, when every one was kept or served). */
export function firstCopiedDate(targets: CopyPlanInput["targets"], result: Pick<CopyPlanResponse, "skipped">): string | undefined {
  const skipped = new Set(result.skipped.map((entry) => copyKey(entry.date, entry.slotId)));
  return (targets.find((target) => !skipped.has(copyKey(target.date, target.slotId))) ?? targets[0])?.date;
}

/** One line of the sheet's warnings box: Storage's own heading, then what may
 * happen on which day. Nothing in it blocks the copy. */
export interface CopyWarningNote {
  key: string;
  heading: string | null;
  line: string;
}

/** The dry run's warnings, worded with the source meal's own names. */
export function copyWarningNotes(warnings: readonly CopyWarning[], source: Pick<PlannedMeal, "items">): CopyWarningNote[] {
  return warnings.flatMap((warning, index): CopyWarningNote[] => {
    const key = `${warning.kind}-${index}`;
    if (warning.kind === "food_deleted") {
      const food = source.items.find((item) => item.kind === "food" && item.food.id === warning.foodId);
      return food?.kind === "food" ? [{ key, heading: null, line: foodDeletedCopyWarning(food.food.name) }] : [];
    }
    const found = source.items.find((item) => item.kind === "storage" && item.container.id === warning.storageItemId);
    if (found?.kind !== "storage") return [];
    const { container } = found;
    const item = storageItemTitle(container);
    switch (warning.kind) {
      case "container_gone":
        return [{ key, heading: null, line: containerGoneCopyWarning(item, warning.status) }];
      case "may_run_out":
        return [
          {
            key,
            heading: servingsLeftHeading(warning.servingsLeft, warning.plannedTimes),
            line: mayRunOutCopyWarning(item, shortDay(warning.date)),
          },
        ];
      case "past_best_by":
        return [
          {
            key,
            heading: container.bestBy ? bestByLabel(container.bestBy) : null,
            line: pastBestByCopyWarning(item, shortDay(warning.date)),
          },
        ];
      case "past_use_within":
        return [{ key, heading: countdownLabel(container.expiresAt), line: pastUseWithinCopyWarning(item, shortDay(warning.date)) }];
    }
  });
}

// ---------------------------------------------------------------------------
// Up next (the plan card) on Home (CD-Home-Today, CD-After-Serve, CD-Home-Today-Done)
// ---------------------------------------------------------------------------

/** One page of the card: a meal, the "everything is served" page, or the
 * "nothing planned for today" page (ledger 948). */
export type TodayPage = PlannedMeal | "done" | "empty";

/** The card's pages, in the parent's order: today's meals with something
 * planned; on a saved day (`planned`), every meal, an empty one offering
 * Plan this meal (ledger 927). Then, once every meal with food is served,
 * the done page. A loaded day with none of those (it only follows Daily
 * meals, or is saved with no meals at all) is the one empty page, Plan
 * today (ledger 948). No day (the plan not loaded, failed, or an older
 * server without days): no pages, so no card. */
export function todaysPlanPages(day: PlanDay | undefined): TodayPage[] {
  if (!day) return [];
  const food = day.meals.filter((meal) => meal.items.length > 0);
  const meals = day.planned ? day.meals : food;
  if (meals.length === 0) return ["empty"];
  return food.length > 0 && food.every((meal) => meal.served) ? [...meals, "done"] : meals;
}

const pageKey = (page: TodayPage): string => (typeof page === "string" ? page : page.slotId);

/**
 * Which page shows: the one the parent paged to (or just served) while it is
 * still there; else the next meal with food (`nextPlannedMeal`, chair §4.3),
 * or, when no meal has food, the next of them all (ledger 927); else, all
 * served, the done page (or the empty page, then the only one). `nowLocal` is the wall clock, `HH:MM`.
 */
export function todaysPlanIndex(pages: readonly TodayPage[], picked: string | null, nowLocal: string): number {
  const at = picked === null ? -1 : pages.findIndex((page) => pageKey(page) === picked);
  if (at >= 0) return at;
  const meals = pages.filter((page): page is PlannedMeal => typeof page !== "string");
  const food = meals.filter((meal) => meal.items.length > 0);
  const next = nextPlannedMeal(food.length > 0 ? food : meals, nowLocal);
  return next ? pages.indexOf(next) : pages.length - 1;
}

/** What ‹ or › lands on, by its key (null at either end). */
export function todaysPlanStep(pages: readonly TodayPage[], index: number, step: -1 | 1): string | null {
  const page = pages[index + step];
  return page === undefined ? null : pageKey(page);
}

/** The device's wall clock as `HH:MM` (what `nextPlannedMeal` reads). */
export function localClock(now: Date = new Date()): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}
