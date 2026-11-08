import { describe, expect, it } from "vitest";
import { DAILY_MEALS_MAX, DEFAULT_DAILY_MEALS, copyPlanInputSchema, type PlanDay, type PlannedMeal, type StorageItem } from "@blw/shared";
import { NOTHING_COUNTS_MESSAGE } from "../plate/plate.js";
import {
  NAME_REQUIRED,
  addDays,
  allClashChoice,
  canCopyInto,
  copyClashes,
  copyRows,
  copyTargets,
  copyWarningNotes,
  firstCopiedDate,
  planDayLabel,
  planDaysAhead,
  setAllClashes,
  shortDay,
  toggleCopyDay,
  toggleCopySlot,
  validatePlanMeal,
  canAddDailyMeal,
  canRemoveDailyMeal,
  dailyMealErrors,
  dailyMealRows,
  dayHasPlan,
  dayName,
  dragTarget,
  flagNotes,
  mealTimeLabel,
  moveRow,
  clockParts,
  clockTime,
  nearestFiveMinutes,
  plannedLines,
  toDailyMealsInput,
  weekLabel,
  weekOf,
  localClock,
  todaysPlanIndex,
  todaysPlanPages,
  todaysPlanStep,
} from "./plan.js";
import { planFlagLine } from "./copy.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** Node's ICU puts a narrow no-break space before AM/PM. */
const plain = (text: string) => text.replace(/\u202f/g, " ");

describe("plan weeks (CD-Plan-Day: Monday first, ‹ › a week at a time)", () => {
  it("adds days across months, years and a DST change without drifting", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09"); // US spring forward
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02"); // US fall back
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-21", -7)).toBe("2026-10-14");
  });

  it("finds the Monday-to-Sunday week of any day", () => {
    const week = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];
    for (const day of week) expect(weekOf(day), day).toEqual(week);
    expect(weekOf("2026-10-26")[0]).toBe("2026-10-26");
    expect(weekOf("2027-01-01")).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
  });

  it("labels a week as the boards do, naming the second month only when it changes", () => {
    expect(weekLabel(weekOf("2026-10-14"))).toBe("Oct 12 – 18");
    expect(weekLabel(weekOf("2026-10-28"))).toBe("Oct 26 – Nov 1");
    expect(weekLabel(weekOf("2027-01-01"))).toBe("Dec 28 – Jan 3");
  });

  it("names a day button by its whole date, whatever the device's zone", () => {
    expect(dayName("2026-10-14")).toBe("Wednesday, October 14");
  });

  it("dots a day only when something is planned on it", () => {
    const meal = (items: unknown[]) => ({ slotId: id(1), name: "Lunch", time: null, position: 0, served: null, items }) as PlannedMeal;
    expect(dayHasPlan(undefined)).toBe(false);
    expect(dayHasPlan({ date: "2026-10-14", planned: false, meals: [meal([])] })).toBe(false);
    expect(dayHasPlan({ date: "2026-10-14", planned: true, meals: [meal([]), meal([{}])] })).toBe(true);
  });

  it("writes a meal's time in the app's own format", () => {
    expect(plain(mealTimeLabel("07:30"))).toBe("7:30 AM");
    expect(plain(mealTimeLabel("12:00"))).toBe("12:00 PM");
    expect(plain(mealTimeLabel("00:05"))).toBe("12:05 AM");
    expect(plain(mealTimeLabel("17:30"))).toBe("5:30 PM");
  });
});

const EGG = { id: id(1), slug: "egg", name: "Egg", category: "protein" as const };
const MASH = { id: id(2), slug: "my-mash", name: "My mash", category: "veg" as const, deleted: true };
const container = (over: Partial<StorageItem>): StorageItem =>
  ({
    id: id(30),
    label: null,
    recipeId: null,
    recipeTitle: null,
    foods: [
      { id: id(3), slug: "broccoli", name: "Broccoli" },
      { id: id(4), slug: "carrot", name: "Carrot" },
    ],
    status: "active",
    location: "fridge",
    quantityNote: null,
    servingsLeft: 2,
    servingsTotal: 6,
    bestBy: null,
    ...over,
  }) as StorageItem;

const MEAL: Pick<PlannedMeal, "items"> = {
  items: [
    { kind: "recipe", id: id(10), recipe: { id: id(20), title: "Salmon Oat Patties" }, leftOut: [] },
    { kind: "food", id: id(11), food: EGG },
    { kind: "food", id: id(12), food: MASH },
    { kind: "storage", id: id(13), servings: 1, container: container({}), flags: [{ kind: "may_run_out" }, { kind: "past_use_within" }] },
    { kind: "storage", id: id(14), servings: 1, container: container({ id: id(31), recipeTitle: "Broccoli Cheese Egg Muffins", foods: [] }), flags: [] },
    { kind: "storage", id: id(15), servings: 1, container: container({ id: id(32), label: "Soup", foods: [], status: "finished" }), flags: [{ kind: "container_gone", status: "finished" }] },
    // A plan write's echo carries no flags.
    { kind: "storage", id: id(16), servings: 1, container: container({ id: id(33) }) },
  ],
};

describe("a planned meal's card lines and flags (CD-Plan-Day, CD-Plan-After-Copy)", () => {
  it("one line per item in plan order: a recipe's pot, a food's plate, a container under Storage's name and where it is", () => {
    const detail = "Fridge · 2 of 6 left";
    expect(plannedLines(MEAL)).toEqual([
      { key: id(10), name: "Salmon Oat Patties", plates: [{ emoji: "🍲", tint: "neutral" }] },
      { key: id(11), name: "Egg", deleted: undefined, plates: [{ emoji: "🥚", tint: "dairy" }] },
      { key: id(12), name: "My mash", deleted: true, plates: [expect.objectContaining({ tint: "veg" })] },
      {
        key: id(13),
        name: "Broccoli, Carrot",
        plates: [expect.objectContaining({ emoji: "🥦" }), expect.objectContaining({ emoji: "🥕" })],
        detail,
      },
      { key: id(14), name: "Broccoli Cheese Egg Muffins", plates: [{ emoji: "🍲", tint: "neutral" }], detail },
      { key: id(15), name: "Soup", plates: [{ emoji: "📝", tint: "neutral" }], detail },
      { key: id(16), name: "Broccoli, Carrot", plates: expect.any(Array), detail },
    ]);
  });

  it("a flag box per flagged container: its name, then one line per flag; none for an unflagged or flag-less one", () => {
    expect(flagNotes(MEAL)).toEqual([
      { key: id(13), name: "Broccoli, Carrot", lines: ["May run out before this day.", "May not keep until this day."] },
      { key: id(15), name: "Soup", lines: ["Marked finished in Storage."] },
    ]);
  });

  it("says each flag in PP-COPY's words", () => {
    expect(planFlagLine({ kind: "may_run_out" })).toBe("May run out before this day.");
    expect(planFlagLine({ kind: "past_best_by" })).toBe("Past the Best by date on this day.");
    expect(planFlagLine({ kind: "past_use_within" })).toBe("May not keep until this day.");
    expect(planFlagLine({ kind: "container_gone", status: "discarded" })).toBe("Marked discarded in Storage.");
  });
});

describe("Daily meals list edits (804, CD-Daily-Meals)", () => {
  const rows = dailyMealRows(DEFAULT_DAILY_MEALS);

  it("starts from the saved list, each row keyed by its meal", () => {
    expect(rows.map((row) => [row.key === row.id, row.name, row.time])).toEqual([
      [true, "Breakfast", null],
      [true, "Lunch", null],
      [true, "Dinner", null],
      [true, "Snack", null],
    ]);
  });

  it("moves a row up or down, clamped, and hands back the same list when nothing moves", () => {
    const names = (list: typeof rows) => list.map((row) => row.name);
    expect(names(moveRow(rows, 3, 0))).toEqual(["Snack", "Breakfast", "Lunch", "Dinner"]);
    expect(names(moveRow(rows, 0, 2))).toEqual(["Lunch", "Dinner", "Breakfast", "Snack"]);
    expect(names(moveRow(rows, 1, 99))).toEqual(["Breakfast", "Dinner", "Snack", "Lunch"]);
    expect(moveRow(rows, 1, 1)).toBe(rows);
    expect(moveRow(rows, 0, -1)).toBe(rows);
    expect(moveRow(rows, -1, 2)).toBe(rows);
    expect(names(rows)).toEqual(["Breakfast", "Lunch", "Dinner", "Snack"]);
  });

  it("drops a dragged row where the pointer is, the first or last row past either end", () => {
    const boxes = [
      { top: 100, bottom: 152 },
      { top: 152, bottom: 204 },
      { top: 204, bottom: 256 },
    ];
    expect(dragTarget(40, boxes)).toBe(0);
    expect(dragTarget(151, boxes)).toBe(0);
    expect(dragTarget(152, boxes)).toBe(1);
    expect(dragTarget(230, boxes)).toBe(2);
    expect(dragTarget(900, boxes)).toBe(2);
  });

  it("allows 1 to 12 meals", () => {
    expect(canRemoveDailyMeal(rows.slice(0, 1))).toBe(false);
    expect(canRemoveDailyMeal(rows.slice(0, 2))).toBe(true);
    expect(canAddDailyMeal(Array.from({ length: DAILY_MEALS_MAX - 1 }))).toBe(true);
    expect(canAddDailyMeal(Array.from({ length: DAILY_MEALS_MAX }))).toBe(false);
  });

  it("needs a name on every row, a blank one included", () => {
    const edited = [...rows, { key: "added-1", name: "   ", time: null }];
    expect(dailyMealErrors(rows)).toEqual({});
    expect(dailyMealErrors(edited)).toEqual({ "added-1": NAME_REQUIRED });
    expect(NAME_REQUIRED).toBe("Name is required");
  });

  it("saves kept meals by id and new ones without, names trimmed, times as set", () => {
    const edited = [{ ...rows[0]!, name: "  Brekkie ", time: "07:30" }, rows[3]!, { key: "added-1", name: "Bedtime snack", time: null }];
    expect(toDailyMealsInput(edited)).toEqual({
      meals: [
        { id: DEFAULT_DAILY_MEALS[0]!.id, name: "Brekkie", time: "07:30" },
        { id: DEFAULT_DAILY_MEALS[3]!.id, name: "Snack", time: null },
        { name: "Bedtime snack", time: null },
      ],
    });
  });
});

describe("Plan a meal (CD-Plan-Meal)", () => {
  it("names the read-only Day: Today, Yesterday, else the short date", () => {
    expect(planDayLabel("2026-10-14", "2026-10-14")).toBe("Today");
    expect(planDayLabel("2026-10-13", "2026-10-14")).toBe("Yesterday");
    expect(planDayLabel("2026-10-15", "2026-10-14")).toBe("Thu, Oct 15");
    expect(planDayLabel("2027-01-01", "2026-12-31")).toBe("Fri, Jan 1");
  });

  it("needs a name; nothing planned is fine; a plate where nothing counts is not", () => {
    expect(validatePlanMeal({ name: "Lunch" })).toEqual({});
    expect(validatePlanMeal({ name: "  " })).toEqual({ name: NAME_REQUIRED });
    expect(validatePlanMeal({ name: "Lunch", nothingCounts: true })).toEqual({ items: NOTHING_COUNTS_MESSAGE });
  });

  it("says how far ahead a saved day is, never the date (plan_saved.days_ahead)", () => {
    const today = "2026-10-30";
    expect(["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-06", "2026-11-07"].map((date) => planDaysAhead(date, today))).toEqual([
      "past",
      "0",
      "1",
      "2-7",
      "2-7",
      "8+",
    ]);
  });
});

describe("Copy to… (814, CD-Copy-Per-Day)", () => {
  const meal = (n: number, name: string, over: Partial<PlannedMeal> = {}): PlannedMeal => ({
    slotId: id(n),
    name,
    time: null,
    position: n,
    served: null,
    items: [],
    ...over,
  });
  const food = (n: number, name: string) => ({ kind: "food" as const, id: id(n), food: { ...EGG, id: id(n), name } });
  const SOURCE = { date: "2026-10-14", slotId: id(51), name: "Lunch" };
  const days: Record<string, PlanDay> = {
    // The source's own day: its Lunch can't take the copy, its Dinner can.
    "2026-10-14": { date: "2026-10-14", planned: true, meals: [meal(51, "Lunch", { items: [food(1, "Egg")] }), meal(52, "Dinner")] },
    "2026-10-15": {
      date: "2026-10-15",
      planned: true,
      meals: [meal(60, "Breakfast"), meal(61, "Lunch"), meal(62, "Dinner", { items: [food(2, "Salmon Oat Patties"), food(3, "Egg")] })],
    },
    "2026-10-16": {
      date: "2026-10-16",
      planned: true,
      meals: [meal(70, "Breakfast", { items: [food(4, "Overnight Oats")] }), meal(71, "Lunch", { served: { mealId: id(90), servedAt: "x" } })],
    },
    // A virtual day: the daily meals.
    "2026-10-21": { date: "2026-10-21", planned: false, meals: [meal(80, "Breakfast"), meal(81, "Lunch")] },
  };
  const dayOf = (date: string) => days[date];

  it("a selected day starts with the meal named like the source ticked, unless that is the source or served", () => {
    let selection = toggleCopyDay({}, days["2026-10-15"]!, SOURCE);
    expect(selection).toEqual({ "2026-10-15": [id(61)] });
    selection = toggleCopyDay(selection, days["2026-10-14"]!, SOURCE);
    selection = toggleCopyDay(selection, days["2026-10-16"]!, SOURCE);
    selection = toggleCopyDay(selection, days["2026-10-21"]!, SOURCE);
    expect(selection).toEqual({ "2026-10-15": [id(61)], "2026-10-14": [], "2026-10-16": [], "2026-10-21": [id(81)] });
    // Tapped again, a day goes, whatever was ticked on it.
    expect(toggleCopyDay(selection, days["2026-10-15"]!, SOURCE)).toEqual({ "2026-10-14": [], "2026-10-16": [], "2026-10-21": [id(81)] });
    expect(canCopyInto(SOURCE, "2026-10-14", days["2026-10-14"]!.meals[0]!)).toBe(false);
    expect(canCopyInto(SOURCE, "2026-10-15", days["2026-10-15"]!.meals[1]!)).toBe(true);
    expect(canCopyInto(SOURCE, "2026-10-16", days["2026-10-16"]!.meals[1]!)).toBe(false);
  });

  it("chips tick and untick; unticking the last keeps the day's row; rows go in date order", () => {
    let selection = toggleCopySlot({ "2026-10-21": [id(81)] }, "2026-10-21", id(81));
    expect(selection).toEqual({ "2026-10-21": [] });
    selection = toggleCopySlot({ ...selection, "2026-10-15": [id(61)] }, "2026-10-15", id(62));
    expect(copyRows(selection, dayOf).map((row) => [row.date, row.ticked])).toEqual([
      ["2026-10-15", [id(61), id(62)]],
      ["2026-10-21", []],
    ]);
  });

  it("targets every ticked meal that can take it, in day and meal order, Keep it unless Replace it was picked", () => {
    const selection = { "2026-10-21": [id(81)], "2026-10-15": [id(62), id(61)], "2026-10-16": [id(71), id(70)], "2026-10-14": [id(51), id(52)] };
    const targets = copyTargets(selection, dayOf, SOURCE, { [`2026-10-15/${id(62)}`]: "replace" });
    expect(targets).toEqual([
      { date: "2026-10-14", slotId: id(52), onClash: "keep" },
      { date: "2026-10-15", slotId: id(61), onClash: "keep" },
      { date: "2026-10-15", slotId: id(62), onClash: "replace" },
      { date: "2026-10-16", slotId: id(70), onClash: "keep" },
      { date: "2026-10-21", slotId: id(81), onClash: "keep" },
    ]);
    expect(copyPlanInputSchema.safeParse({ source: SOURCE, targets, tz: "UTC" }).success).toBe(true);
    // A ticked meal no longer on its day (removed elsewhere) is dropped.
    expect(copyTargets({ "2026-10-15": [id(99)] }, dayOf, SOURCE, {})).toEqual([]);
  });

  it("a clash is a target with something planned: named, with what is there now", () => {
    const selection = { "2026-10-15": [id(61), id(62)], "2026-10-16": [id(70), id(71)] };
    const clashes = copyClashes(selection, dayOf, SOURCE);
    expect(clashes).toEqual([
      { date: "2026-10-15", slotId: id(62), name: "Dinner", planned: "Salmon Oat Patties, Egg" },
      { date: "2026-10-16", slotId: id(70), name: "Breakfast", planned: "Overnight Oats" },
    ]);
    expect(allClashChoice(clashes, {})).toBe("keep");
    const mixed = { [`2026-10-16/${id(70)}`]: "replace" as const };
    expect(allClashChoice(clashes, mixed)).toBeNull();
    const all = setAllClashes(clashes, mixed, "replace");
    expect(allClashChoice(clashes, all)).toBe("replace");
    // The All row answers the clashes only; Lunch had nothing to replace.
    expect(copyTargets(selection, dayOf, SOURCE, all).map((target) => target.onClash)).toEqual(["keep", "replace", "replace"]);
  });

  it("after a Copy the plan shows the first day that got it, else the first target", () => {
    const targets = [
      { date: "2026-10-15", slotId: id(62), onClash: "keep" as const },
      { date: "2026-10-16", slotId: id(70), onClash: "replace" as const },
    ];
    expect(firstCopiedDate(targets, { skipped: [{ date: "2026-10-15", slotId: id(62), reason: "kept" }] })).toBe("2026-10-16");
    expect(firstCopiedDate(targets, { skipped: [] })).toBe("2026-10-15");
    expect(firstCopiedDate(targets, { skipped: targets.map((target) => ({ ...target, reason: "kept" as const })) })).toBe("2026-10-15");
    expect(firstCopiedDate([], { skipped: [] })).toBeUndefined();
    expect(shortDay("2026-10-15")).toBe("Thu 15");
  });

  it("words the dry run's warnings with the source's names and Storage's own headings", () => {
    const muffins = container({ id: id(31), recipeTitle: "Broccoli Cheese Egg Muffins", foods: [], bestBy: "2026-10-15" });
    const veg = container({ expiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString() });
    const source = {
      items: [
        { kind: "storage" as const, id: id(40), servings: 1, container: muffins },
        { kind: "storage" as const, id: id(41), servings: 1, container: veg },
        { kind: "food" as const, id: id(42), food: MASH },
      ],
    };
    const notes = copyWarningNotes(
      [
        { kind: "may_run_out", storageItemId: muffins.id, servingsLeft: 2, plannedTimes: 3, date: "2026-10-16" },
        { kind: "past_best_by", storageItemId: muffins.id, date: "2026-10-16" },
        { kind: "past_use_within", storageItemId: veg.id, date: "2026-10-15" },
        { kind: "container_gone", storageItemId: veg.id, status: "discarded" },
        { kind: "food_deleted", foodId: MASH.id },
        // Not on this meal (a stale answer): nothing to say.
        { kind: "past_best_by", storageItemId: id(99), date: "2026-10-16" },
      ],
      source,
    );
    expect(notes.map(({ heading, line }) => [heading, line])).toEqual([
      ["2 servings left, planned 3 times", "Broccoli Cheese Egg Muffins may run out before Fri 16. You can still copy."],
      [expect.stringMatching(/^Best by Thu, Oct 15$/), "Broccoli Cheese Egg Muffins will be past the Best by date on Fri 16. You can still copy."],
      [expect.stringMatching(/^Use within (23|24)h$/), "Broccoli, Carrot may not keep until Thu 15. You can still copy."],
      [null, "Broccoli, Carrot was discarded. You can still copy, then swap it out."],
      [null, "My mash was deleted. You can still copy, then swap it out."],
    ]);
    expect(new Set(notes.map((note) => note.key)).size).toBe(notes.length);
  });
});

// SPEC §5 + chair §4.3: Home's Up next card (CD-Home-Today, CD-After-Serve,
// CD-Home-Today-Done, and ledger 948's empty page in place of CD-Home-No-Plan).
describe("Up next (the plan card) on Home", () => {
  const item = { kind: "food" as const, id: id(9), food: { id: id(3), slug: "egg", name: "Egg", category: "protein" as const, emoji: null } };
  const meal = (n: number, over: Partial<PlannedMeal> = {}): PlannedMeal => ({
    slotId: id(n),
    name: `Meal ${n}`,
    time: null,
    position: n,
    served: null,
    items: [item],
    ...over,
  });
  const day = (meals: PlannedMeal[], planned = true): PlanDay => ({ date: "2026-10-14", planned, meals });
  const served = { mealId: id(90), servedAt: "2026-10-14T11:42:00.000Z" };

  it("pages through today's meals with something planned, in order; a day that only follows Daily meals with nothing planned is the empty page, no day is no card", () => {
    const names = (pages: ReturnType<typeof todaysPlanPages>) => pages.map((page) => (typeof page === "string" ? page : page.name));
    expect(names(todaysPlanPages(day([meal(1), meal(2, { items: [] }), meal(3)], false)))).toEqual(["Meal 1", "Meal 3"]);
    // Ledger 948: a loaded day with nothing planned is the one empty page (Plan today); no day is still no card.
    expect(todaysPlanPages(day([meal(1, { items: [] }), meal(2, { items: [] })], false))).toEqual(["empty"]);
    expect(todaysPlanPages(day([], false))).toEqual(["empty"]);
    expect(todaysPlanPages(undefined)).toEqual([]);
    // Everything served: a last page says so.
    expect(todaysPlanPages(day([meal(1, { served }), meal(2, { served })])).at(-1)).toBe("done");
    expect(todaysPlanPages(day([meal(1, { served }), meal(2)]))).not.toContain("done");
  });

  it("a saved day (ledger 927) pages through every meal, empty ones too, in order; the done page waits only for the meals with food", () => {
    const names = (pages: ReturnType<typeof todaysPlanPages>) => pages.map((page) => (typeof page === "string" ? page : page.name));
    expect(names(todaysPlanPages(day([meal(1), meal(2, { items: [] }), meal(3)])))).toEqual(["Meal 1", "Meal 2", "Meal 3"]);
    expect(names(todaysPlanPages(day([meal(1, { items: [] }), meal(2, { items: [] })])))).toEqual(["Meal 1", "Meal 2"]);
    // A saved day with no meals at all: the one empty page (ledger 948).
    expect(todaysPlanPages(day([]))).toEqual(["empty"]);
    // Every meal with food served: done, though an empty one is unserved.
    expect(names(todaysPlanPages(day([meal(1, { served }), meal(2, { items: [] }), meal(3, { served })])))).toEqual([
      "Meal 1",
      "Meal 2",
      "Meal 3",
      "done",
    ]);
    expect(todaysPlanPages(day([meal(1, { served }), meal(2, { items: [] }), meal(3)]))).not.toContain("done");
    // An all-empty day has no done page.
    expect(todaysPlanPages(day([meal(1, { items: [] })]))).not.toContain("done");
  });

  it("a saved day opens as before while any meal has food (the next one with food); only an all-empty day opens on the next of them all (ledger 927)", () => {
    const empty = { items: [] };
    // Mixed: the empty 07:00 Meal 1 is not "next"; the next with food is.
    const mixed = todaysPlanPages(day([meal(1, { ...empty, time: "07:00" }), meal(2, { time: "07:30" }), meal(3, { ...empty }), meal(4, { time: "12:00" })]));
    expect(todaysPlanIndex(mixed, null, "06:00")).toBe(1);
    expect(todaysPlanIndex(mixed, null, "09:31")).toBe(3);
    // Same meal as the food-only pages would open on.
    const before = todaysPlanPages(day([meal(1, { ...empty, time: "07:00" }), meal(2, { time: "07:30" }), meal(3, { ...empty }), meal(4, { time: "12:00" })], false));
    for (const now of ["06:00", "09:31", "23:59"]) {
      const opened = mixed[todaysPlanIndex(mixed, null, now)];
      expect([now, typeof opened === "string" ? opened : opened!.slotId]).toEqual([now, (before[todaysPlanIndex(before, null, now)] as PlannedMeal).slotId]);
    }
    // Every meal with food served: the done page, not an empty meal.
    const served1 = todaysPlanPages(day([meal(1, { served }), meal(2, empty)]));
    expect(served1[todaysPlanIndex(served1, null, "08:00")]).toBe("done");
    // All empty: nextPlannedMeal over every meal.
    const allEmpty = todaysPlanPages(day([meal(1, { ...empty, time: "07:00" }), meal(2, { ...empty, time: "12:00" }), meal(3, empty)]));
    expect(todaysPlanIndex(allEmpty, null, "06:00")).toBe(0);
    expect(todaysPlanIndex(allEmpty, null, "09:01")).toBe(1);
    expect(todaysPlanIndex(allEmpty, null, "14:01")).toBe(2);
  });

  it("the empty page (ledger 948) is the only page: it opens on it, and ‹ › go nowhere", () => {
    for (const pages of [todaysPlanPages(day([meal(1, { items: [] })], false)), todaysPlanPages(day([]))]) {
      expect(pages).toEqual(["empty"]);
      for (const now of ["00:00", "12:00", "23:59"]) expect(todaysPlanIndex(pages, null, now)).toBe(0);
      expect(todaysPlanIndex(pages, "empty", "12:00")).toBe(0);
      expect(todaysPlanIndex(pages, id(1), "12:00")).toBe(0);
      expect(todaysPlanStep(pages, 0, 1)).toBeNull();
      expect(todaysPlanStep(pages, 0, -1)).toBeNull();
    }
    // Food today: the meal pages, no empty page.
    expect(todaysPlanPages(day([meal(1)], false))).not.toContain("empty");
    expect(todaysPlanPages(day([meal(1, { served })]))).toEqual([meal(1, { served }), "done"]);
  });

  it("opens on the next meal: the first unserved, a timed one skipped once 2 h past while a later one waits", () => {
    const pages = todaysPlanPages(day([meal(1, { served, time: "07:30" }), meal(2, { time: "07:30" }), meal(3, { time: "12:00" })]));
    expect(todaysPlanIndex(pages, null, "08:00")).toBe(1);
    expect(todaysPlanIndex(pages, null, "09:31")).toBe(2);
    // Times never reorder; the last unserved stays next however late.
    expect(todaysPlanIndex(pages, null, "23:59")).toBe(2);
    // All served: the done page.
    const done = todaysPlanPages(day([meal(1, { served })]));
    expect(todaysPlanIndex(done, null, "12:00")).toBe(1);
  });

  it("keeps the page the parent paged to or served while it is there; ‹ › step by key, nothing past either end", () => {
    const pages = todaysPlanPages(day([meal(1), meal(2), meal(3)]));
    expect(todaysPlanIndex(pages, id(3), "08:00")).toBe(2);
    expect(todaysPlanIndex(pages, id(99), "08:00")).toBe(0);
    expect(todaysPlanStep(pages, 0, 1)).toBe(id(2));
    expect(todaysPlanStep(pages, 0, -1)).toBeNull();
    expect(todaysPlanStep(pages, 2, 1)).toBeNull();
    const done = todaysPlanPages(day([meal(1, { served })]));
    expect(todaysPlanStep(done, 0, 1)).toBe("done");
    expect(todaysPlanIndex(done, "done", "08:00")).toBe(1);
    expect(todaysPlanStep(done, 1, -1)).toBe(id(1));
  });

  it("reads the wall clock as HH:MM", () => {
    expect(localClock(new Date(2026, 9, 14, 7, 5))).toBe("07:05");
    expect(localClock(new Date(2026, 9, 14, 23, 59))).toBe("23:59");
  });
});

describe("the Time sheet's clock (ledger 926)", () => {
  it("rounds to the nearest 5-minute step, never past 23:55 (whole minutes never sit on a half step)", () => {
    const cases: Array<[string, string]> = [
      ["09:39", "09:40"],
      ["09:37", "09:35"],
      ["09:38", "09:40"],
      ["09:40", "09:40"],
      ["00:00", "00:00"],
      ["00:02", "00:00"],
      ["11:58", "12:00"],
      ["12:57", "12:55"],
      ["23:52", "23:50"],
      ["23:53", "23:55"],
      ["23:58", "23:55"],
      ["23:59", "23:55"],
    ];
    for (const [time, step] of cases) expect([time, nearestFiveMinutes(time)]).toEqual([time, step]);
  });

  it("splits HH:MM into Hour / Minute / AM-PM on its step and joins it back", () => {
    expect(clockParts("09:39")).toEqual({ hour12: 9, minute: 40, meridiem: "AM" });
    expect(clockParts("00:01")).toEqual({ hour12: 12, minute: 0, meridiem: "AM" });
    expect(clockParts("12:30")).toEqual({ hour12: 12, minute: 30, meridiem: "PM" });
    expect(clockParts("23:58")).toEqual({ hour12: 11, minute: 55, meridiem: "PM" });
    expect(clockTime({ hour12: 12, minute: 0, meridiem: "AM" })).toBe("00:00");
    expect(clockTime({ hour12: 12, minute: 5, meridiem: "PM" })).toBe("12:05");
    expect(clockTime({ hour12: 7, minute: 30, meridiem: "PM" })).toBe("19:30");
    for (let minutes = 0; minutes < 24 * 60; minutes += 5) {
      const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      expect(clockTime(clockParts(time))).toBe(time);
    }
  });
});
