import { describe, expect, it } from "vitest";
import {
  DEFAULT_DAILY_MEALS,
  NEXT_MEAL_GRACE_MIN,
  dailyMealsInputSchema,
  localDate,
  nextPlannedMeal,
  planDates,
  planQuerySchema,
  plannedItemsInputSchema,
  updatePlannedMealInputSchema,
} from "./planning.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("nextPlannedMeal (SPEC §4.3, chair Q8)", () => {
  const meal = (position: number, time: string | null, served = false) => ({
    position,
    time,
    served: served ? { mealId: id(position) } : null,
  });
  const at = (meals: ReturnType<typeof meal>[], now: string) => nextPlannedMeal(meals, now)?.position ?? null;

  it("is the first unserved meal by position, whatever the times say", () => {
    // Times never reorder: Snack (position 1) at 07:00 does not jump Breakfast.
    expect(at([meal(0, "08:00"), meal(1, "07:00")], "06:00")).toBe(0);
    expect(at([meal(1, null), meal(0, null, true), meal(2, null)], "12:00")).toBe(1);
  });

  it(`skips a timed meal more than ${NEXT_MEAL_GRACE_MIN} min past while a later one is unserved`, () => {
    const day = [meal(0, "07:30"), meal(1, "12:00"), meal(2, "17:30")];
    expect(at(day, "09:30")).toBe(0); // exactly 120 min: still next
    expect(at(day, "09:31")).toBe(1);
    expect(at(day, "16:00")).toBe(2);
    // The last unserved meal is next however late it is.
    expect(at(day, "23:59")).toBe(2);
  });

  it("never skips an untimed meal, and is null once everything is served", () => {
    expect(at([meal(0, "07:00"), meal(1, null), meal(2, "18:00")], "11:00")).toBe(1);
    expect(at([meal(0, "07:00", true), meal(1, null, true)], "11:00")).toBe(null);
    expect(at([], "11:00")).toBe(null);
  });
});

describe("localDate and planDates", () => {
  it("names the caller's day, across a DST change and the date line", () => {
    // 2026-03-08 07:30 UTC is 23:30 on the 7th in Los Angeles (PST, before
    // the 10:00 UTC switch) and already the 8th in UTC.
    expect(localDate(new Date("2026-03-08T07:30:00Z"), "America/Los_Angeles")).toBe("2026-03-07");
    expect(localDate(new Date("2026-03-08T07:30:00Z"), "UTC")).toBe("2026-03-08");
    // After the switch (PDT, UTC-7) 06:30 UTC on the 9th is still the 8th.
    expect(localDate(new Date("2026-03-09T06:30:00Z"), "America/Los_Angeles")).toBe("2026-03-08");
    expect(localDate(new Date("2026-10-26T11:00:00Z"), "Pacific/Kiritimati")).toBe("2026-10-27");
  });

  it("lists every day in a range, both ends included, over month and DST edges", () => {
    expect(planDates("2026-02-27", "2026-03-02")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
    expect(planDates("2026-03-07", "2026-03-09")).toEqual(["2026-03-07", "2026-03-08", "2026-03-09"]);
    expect(planDates("2026-03-02", "2026-03-01")).toEqual([]);
  });
});

describe("plan schemas", () => {
  const query = (from: string, to: string, tz = "Europe/London") => planQuerySchema.safeParse({ from, to, tz }).success;

  it("GET needs a real range of 1-31 days and an IANA zone", () => {
    expect(query("2026-10-26", "2026-10-26")).toBe(true);
    expect(query("2026-10-01", "2026-10-31")).toBe(true);
    expect(query("2026-10-01", "2026-11-01")).toBe(false);
    expect(query("2026-10-27", "2026-10-26")).toBe(false);
    expect(query("2026-02-30", "2026-03-01")).toBe(false);
    expect(query("2026-10-26", "2026-10-26", "Mars/Olympus")).toBe(false);
    expect(planQuerySchema.safeParse({ from: "2026-10-26", to: "2026-10-26" }).success).toBe(false);
  });

  it("daily meals: 1-12, names 1-40, HH:MM times, ids at most once", () => {
    const ok = (meals: unknown) => dailyMealsInputSchema.safeParse({ meals }).success;
    expect(ok(DEFAULT_DAILY_MEALS)).toBe(true);
    expect(ok([{ name: "Second breakfast", time: "09:15" }])).toBe(true);
    expect(ok([])).toBe(false);
    expect(ok(Array.from({ length: 13 }, (_, i) => ({ name: `Meal ${i}` })))).toBe(false);
    expect(ok([{ name: " " }])).toBe(false);
    expect(ok([{ name: "x".repeat(41) }])).toBe(false);
    expect(ok([{ name: "Late", time: "24:00" }])).toBe(false);
    expect(ok([{ name: "Late", time: "7:30" }])).toBe(false);
    expect(ok([{ id: id(1), name: "A" }, { id: id(1), name: "B" }])).toBe(false);
    expect(new Set(DEFAULT_DAILY_MEALS.map((meal) => meal.id)).size).toBe(4);
    expect(DEFAULT_DAILY_MEALS.map((meal) => meal.name)).toEqual(["Breakfast", "Lunch", "Dinner", "Snack"]);
  });

  it("planned items are the plate's shapes without stars, servings required on a container", () => {
    const ok = (items: unknown) => plannedItemsInputSchema.safeParse(items).success;
    expect(ok([])).toBe(true);
    expect(
      ok([
        { kind: "food", foodId: id(1) },
        { kind: "recipe", recipeId: id(2), leftOutFoodIds: [id(3)] },
        { kind: "storage", storageItemId: id(4), servings: 2 },
      ]),
    ).toBe(true);
    expect(ok([{ kind: "storage", storageItemId: id(4) }])).toBe(false);
    expect(ok([{ kind: "storage", storageItemId: id(4), servings: 100 }])).toBe(false);
    expect(ok([{ kind: "food", foodId: id(1) }, { kind: "food", foodId: id(1) }])).toBe(false);
    // A fresh food beside a container is two items (799).
    expect(ok([{ kind: "food", foodId: id(1) }, { kind: "storage", storageItemId: id(1), servings: 1 }])).toBe(true);
    // Stars are dropped, not stored.
    const parsed = plannedItemsInputSchema.parse([{ kind: "food", foodId: id(1), rating: 5, id: id(9) }]);
    expect(parsed).toEqual([{ kind: "food", foodId: id(1) }]);
  });

  it("a meal update must change something; time null clears it", () => {
    expect(updatePlannedMealInputSchema.safeParse({}).success).toBe(false);
    expect(updatePlannedMealInputSchema.safeParse({ time: null }).success).toBe(true);
    expect(updatePlannedMealInputSchema.safeParse({ items: [] }).success).toBe(true);
    expect(updatePlannedMealInputSchema.safeParse({ name: "Tea" }).success).toBe(true);
  });
});
