// The meal plan's rules as plain data (ledger 904, SPEC §5): which week a day
// sits in, how a planned meal reads on its card, and the Daily meals list
// edits. The plan screens only render this and call the hooks, so a native
// shell can say and do the same.
import {
  DAILY_MEALS_MAX,
  type DailyMeal,
  type DailyMealsInput,
  type PlanDay,
  type PlannedItem,
  type PlannedMeal,
} from "@blw/shared";
import { foodPlate, type Plate } from "../catalog/foodEmoji.js";
import { storageItemCluster } from "../storage/components/StorageItemCard.js";
import { storageItemTitle } from "../storage/format.js";
import { RECIPE_PLATE } from "../plate/plate.js";
import { planFlagLine } from "./copy.js";

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

/** The Monday-to-Sunday week holding `date` (the boards' M T W T F S S). */
export function weekOf(date: string): string[] {
  const monday = addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
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

/** The strip's weekday initials, Monday first. */
export const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;

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

/** One line of a planned meal's card (CD-Plan-Day): its plate and name. */
export interface PlannedLine {
  key: string;
  name: string;
  deleted?: boolean | undefined;
  plates: Plate[];
}

/** The card's lines, in plan order: a food, a recipe, a container under
 * Storage's own name. */
export function plannedLines(meal: Pick<PlannedMeal, "items">): PlannedLine[] {
  return meal.items.map((item): PlannedLine => {
    if (item.kind === "food") return { key: item.id, name: item.food.name, deleted: item.food.deleted, plates: [foodPlate(item.food)] };
    if (item.kind === "recipe") return { key: item.id, name: item.recipe.title, plates: [RECIPE_PLATE] };
    return { key: item.id, name: storageItemTitle(item.container), plates: storageItemCluster(item.container).plates };
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
