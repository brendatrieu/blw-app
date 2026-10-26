import { describe, expect, it } from "vitest";
import { DAILY_MEALS_MAX, DEFAULT_DAILY_MEALS, type PlannedMeal, type StorageItem } from "@blw/shared";
import {
  NAME_REQUIRED,
  addDays,
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
  plannedLines,
  toDailyMealsInput,
  weekLabel,
  weekOf,
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
  it("one line per item in plan order: a recipe's pot, a food's plate, a container under Storage's name", () => {
    expect(plannedLines(MEAL)).toEqual([
      { key: id(10), name: "Salmon Oat Patties", plates: [{ emoji: "🍲", tint: "neutral" }] },
      { key: id(11), name: "Egg", deleted: undefined, plates: [{ emoji: "🥚", tint: "dairy" }] },
      { key: id(12), name: "My mash", deleted: true, plates: [expect.objectContaining({ tint: "veg" })] },
      { key: id(13), name: "Broccoli, Carrot", plates: [expect.objectContaining({ emoji: "🥦" }), expect.objectContaining({ emoji: "🥕" })] },
      { key: id(14), name: "Broccoli Cheese Egg Muffins", plates: [{ emoji: "🍲", tint: "neutral" }] },
      { key: id(15), name: "Soup", plates: [{ emoji: "📝", tint: "neutral" }] },
      { key: id(16), name: "Broccoli, Carrot", plates: expect.any(Array) },
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
