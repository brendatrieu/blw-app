import { describe, expect, it } from "vitest";
import {
  DEFAULT_DAILY_MEALS,
  NEXT_MEAL_GRACE_MIN,
  addPlannedMealInputSchema,
  copyPlanInputSchema,
  copyWarnings,
  dailyMealsInputSchema,
  localDate,
  localInstant,
  nextPlannedMeal,
  planDates,
  planFlags,
  planQuerySchema,
  plannedItemsInputSchema,
  plannedServedAt,
  updatePlannedMealInputSchema,
  type PlanFlagContainer,
  type PlanFlagUse,
} from "./planning.js";
import { createPlateMealInputSchema } from "./tracking.js";

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

  it("+ Add a meal takes a name, and may bring its time and items by the same rules (step 4.2)", () => {
    expect(addPlannedMealInputSchema.safeParse({ name: "Tea" }).success).toBe(true);
    expect(addPlannedMealInputSchema.safeParse({ name: "Tea", time: "15:30", items: [{ kind: "food", foodId: id(1) }] }).success).toBe(true);
    expect(addPlannedMealInputSchema.safeParse({ name: " ", items: [] }).success).toBe(false);
    const twice = [{ kind: "food", foodId: id(1) }, { kind: "food", foodId: id(1) }];
    expect(addPlannedMealInputSchema.safeParse({ name: "Tea", items: twice }).success).toBe(false);
    expect(addPlannedMealInputSchema.safeParse({ name: "Tea", items: [{ kind: "storage", storageItemId: id(1) }] }).success).toBe(false);
  });
});

describe("localInstant and plannedServedAt (SPEC §3.4-3.5)", () => {
  const iso = (date: string, time: string, tz: string) => localInstant(date, time, tz).toISOString();

  it("reads the wall clock in the caller's zone, with the offset of THAT day", () => {
    expect(iso("2026-07-01", "12:00", "Asia/Kolkata")).toBe("2026-07-01T06:30:00.000Z");
    expect(iso("2026-11-02", "00:00", "Pacific/Kiritimati")).toBe("2026-11-01T10:00:00.000Z");
    // Los Angeles leaves PDT at 02:00 on 2026-11-01: a Dinner at 17:30 that
    // day is UTC-8, not the UTC-7 of the morning before.
    expect(iso("2026-10-31", "17:30", "America/Los_Angeles")).toBe("2026-11-01T00:30:00.000Z");
    expect(iso("2026-11-01", "17:30", "America/Los_Angeles")).toBe("2026-11-02T01:30:00.000Z");
  });

  it("a repeated hour takes the earlier instant; a skipped hour moves forward", () => {
    expect(iso("2026-11-01", "01:30", "America/Los_Angeles")).toBe("2026-11-01T08:30:00.000Z"); // PDT, not PST
    expect(iso("2026-10-25", "02:30", "Europe/Berlin")).toBe("2026-10-25T00:30:00.000Z"); // CEST, not CET
    expect(iso("2026-03-08", "02:30", "America/Los_Angeles")).toBe("2026-03-08T10:30:00.000Z"); // 03:30 PDT
    expect(iso("2026-03-29", "02:30", "Europe/Berlin")).toBe("2026-03-29T01:30:00.000Z"); // 03:30 CEST
    // Chile springs forward at midnight: the day starts at 01:00.
    expect(iso("2026-09-06", "00:00", "America/Santiago")).toBe("2026-09-06T04:00:00.000Z");
  });

  it("a past day's Serve prefills the planned time, else noon", () => {
    expect(plannedServedAt("2026-10-20", "07:45", "Europe/London").toISOString()).toBe("2026-10-20T06:45:00.000Z");
    expect(plannedServedAt("2026-10-27", null, "Europe/London").toISOString()).toBe("2026-10-27T12:00:00.000Z");
  });
});

describe("planFlags (SPEC §3.4)", () => {
  const TZ = "America/Los_Angeles";
  const TODAY = "2026-10-31";
  let next = 0;
  const use = (storageItemId: string, date: string, more: Partial<PlanFlagUse> = {}): PlanFlagUse => ({
    id: id(100 + next++),
    date,
    time: null,
    mealPosition: 0,
    position: 0,
    served: false,
    storageItemId,
    servings: 1,
    ...more,
  });
  const box = (n: number, more: Partial<PlanFlagContainer> = {}): PlanFlagContainer => ({
    id: id(n),
    status: "active",
    servingsLeft: null,
    bestBy: null,
    expiresAt: "2027-01-01T00:00:00.000Z",
    ...more,
  });
  const run = (uses: PlanFlagUse[], containers: PlanFlagContainer[]) =>
    planFlags(uses, new Map(containers.map((c) => [c.id, c])), TODAY, TZ);
  const kinds = (flags: Map<string, unknown[]>, u: PlanFlagUse) => (flags.get(u.id) as { kind: string }[] | undefined)?.map((f) => f.kind);

  it("may run out: a running total in plan order, across meals and babies, untracked never", () => {
    const muffins = box(1, { servingsLeft: 3 });
    // Two babies' meals interleave by day, then meal position, then item.
    const a = use(muffins.id, "2026-11-02", { mealPosition: 2, servings: 2 });
    const b = use(muffins.id, "2026-11-02", { mealPosition: 0 });
    const c = use(muffins.id, "2026-11-01", { mealPosition: 3 });
    const untracked = use(box(2).id, "2026-11-01", { servings: 99 });
    const flags = run([a, b, c, untracked], [muffins, box(2)]);
    expect(kinds(flags, c)).toEqual([]); // 1 of 3
    expect(kinds(flags, b)).toEqual([]); // 2 of 3
    expect(kinds(flags, a)).toEqual(["may_run_out"]); // 4 of 3
    expect(kinds(flags, untracked)).toEqual([]);
  });

  it("a finished or discarded container is its own flag, not may run out, and uses no servings", () => {
    const flags = run(
      [use(id(1), "2026-11-01", { servings: 5 }), use(id(2), "2026-11-01")],
      [box(1, { status: "finished", servingsLeft: 0 }), box(2, { status: "discarded", servingsLeft: 4 })],
    );
    expect([...flags.values()]).toEqual([[{ kind: "container_gone", status: "finished" }], [{ kind: "container_gone", status: "discarded" }]]);
  });

  it("a gone container shows ONLY the gone flag, past its Best by or its window too", () => {
    const flags = run(
      [use(id(1), "2026-11-05"), use(id(2), "2026-11-05")],
      [
        box(1, { status: "finished", servingsLeft: 0, bestBy: "2026-11-01" }),
        box(2, { status: "discarded", servingsLeft: 4, bestBy: null, expiresAt: "2026-10-01T00:00:00.000Z" }),
      ],
    );
    expect([...flags.values()]).toEqual([[{ kind: "container_gone", status: "finished" }], [{ kind: "container_gone", status: "discarded" }]]);
  });

  it("Best by is calendar days (the day itself is fine) and wins over the window", () => {
    const pear = box(1, { bestBy: "2026-11-02", expiresAt: "2026-10-01T00:00:00.000Z" });
    const onTheDay = use(pear.id, "2026-11-02", { time: "23:00" });
    const after = use(pear.id, "2026-11-03");
    const flags = run([onTheDay, after], [pear]);
    expect(kinds(flags, onTheDay)).toEqual([]);
    expect(kinds(flags, after)).toEqual(["past_best_by"]);
  });

  it("use within is checked at the meal's time, else at the start of its day, in the caller's zone", () => {
    // The window ends 2026-11-02 19:00 UTC = 11:00 PST (after the DST change).
    const soup = box(1, { expiresAt: "2026-11-02T19:00:00.000Z" });
    const brunch = use(soup.id, "2026-11-02", { time: "10:59" });
    const lunch = use(soup.id, "2026-11-02", { time: "11:00" });
    const untimed = use(soup.id, "2026-11-02");
    const nextDay = use(soup.id, "2026-11-03");
    const flags = run([brunch, lunch, untimed, nextDay], [soup]);
    expect(kinds(flags, brunch)).toEqual([]);
    expect(kinds(flags, lunch)).toEqual(["past_use_within"]);
    expect(kinds(flags, untimed)).toEqual([]);
    expect(kinds(flags, nextDay)).toEqual(["past_use_within"]);
    // With the morning's PDT offset, 11:00 would be 18:00 UTC and not flag.
    expect(planFlags([lunch], new Map([[soup.id, soup]]), TODAY, "Europe/London").get(lunch.id)).toEqual([]);
  });

  it("past and served meals carry no flags and use no servings", () => {
    const last = box(1, { servingsLeft: 1, expiresAt: "2026-01-01T00:00:00.000Z" });
    const yesterday = use(last.id, "2026-10-30");
    const served = use(last.id, "2026-10-31", { served: true });
    const today = use(last.id, "2026-10-31");
    const flags = run([yesterday, served, today], [last]);
    expect(flags.has(yesterday.id)).toBe(false);
    expect(flags.has(served.id)).toBe(false);
    expect(kinds(flags, today)).toEqual(["past_use_within"]);
  });
});

describe("Copy to… (SPEC §3.3)", () => {
  const slot = (n: number, date = "2026-11-02") => ({ date, slotId: id(n) });

  it("takes 1-50 distinct targets, never the source, and needs tz", () => {
    const ok = (body: unknown) => copyPlanInputSchema.safeParse(body).success;
    const base = { source: slot(1), tz: "Europe/London" };
    expect(ok({ ...base, targets: [{ ...slot(2), onClash: "keep" }] })).toBe(true);
    expect(ok({ ...base, targets: [] })).toBe(false);
    expect(ok({ ...base, targets: Array.from({ length: 51 }, (_, i) => ({ ...slot(i + 2), onClash: "keep" })) })).toBe(false);
    expect(ok({ ...base, targets: [{ ...slot(1), onClash: "replace" }] })).toBe(false);
    expect(ok({ ...base, targets: [{ ...slot(2), onClash: "keep" }, { ...slot(2), onClash: "replace" }] })).toBe(false);
    // The same slot id on another day is another meal.
    expect(ok({ ...base, targets: [{ ...slot(1, "2026-11-03"), onClash: "keep" }] })).toBe(true);
    expect(ok({ source: slot(1), targets: [{ ...slot(2), onClash: "keep" }] })).toBe(false);
    expect(ok({ ...base, targets: [{ ...slot(2), onClash: "merge" }] })).toBe(false);
  });

  it("warns once per container and kind: running out over every use, Best by and use within over the copies", () => {
    const uses: PlanFlagUse[] = [
      { id: id(11), date: "2026-11-01", time: null, mealPosition: 0, position: 0, served: false, storageItemId: id(1), servings: 1 },
      { id: id(12), date: "2026-11-04", time: null, mealPosition: 0, position: 0, served: false, storageItemId: id(1), servings: 1 },
      { id: id(13), date: "2026-11-02", time: null, mealPosition: 0, position: 0, served: false, storageItemId: id(1), servings: 1 },
      { id: id(14), date: "2026-11-03", time: null, mealPosition: 0, position: 0, served: false, storageItemId: id(1), servings: 1 },
      { id: id(15), date: "2026-11-02", time: null, mealPosition: 0, position: 1, served: false, storageItemId: id(2), servings: 1 },
    ];
    const containers = new Map<string, PlanFlagContainer>([
      [id(1), { id: id(1), status: "active", servingsLeft: 2, bestBy: "2026-11-02", expiresAt: "2026-11-03T00:00:00.000Z" }],
      [id(2), { id: id(2), status: "finished", servingsLeft: 0, bestBy: null, expiresAt: "2026-10-01T00:00:00.000Z" }],
    ]);
    const flags = planFlags(uses, containers, "2026-10-31", "UTC");
    // 11 was already planned; 12, 13, 14 and 15 are the copies.
    const warnings = copyWarnings(uses, flags, new Set([id(12), id(13), id(14), id(15)]), containers);
    expect(warnings).toEqual([
      { kind: "may_run_out", storageItemId: id(1), servingsLeft: 2, plannedTimes: 4, date: "2026-11-03" },
      { kind: "past_best_by", storageItemId: id(1), date: "2026-11-03" },
      // A gone container is ONLY the gone line, though its window has passed.
      { kind: "container_gone", storageItemId: id(2), status: "finished" },
    ]);
    // No copy of a container, no warning about it.
    expect(copyWarnings(uses, flags, new Set([id(15)]), containers).map((w) => w.storageItemId)).toEqual([id(2)]);
    // Only 12 (the 4th) is a copy: running out still counts the 3rd, which
    // was planned already, but Best by speaks of the copy's day only.
    expect(copyWarnings(uses, flags, new Set([id(12)]), containers)).toEqual([
      { kind: "may_run_out", storageItemId: id(1), servingsLeft: 2, plannedTimes: 4, date: "2026-11-03" },
      { kind: "past_best_by", storageItemId: id(1), date: "2026-11-04" },
    ]);
  });
});

describe("a plate that serves a planned meal (SPEC §3.5)", () => {
  it("needs the caller's tz with plannedMealId", () => {
    const items = [{ kind: "food", foodId: id(1) }];
    expect(createPlateMealInputSchema.safeParse({ items }).success).toBe(true);
    expect(createPlateMealInputSchema.safeParse({ items, plannedMealId: id(2) }).success).toBe(false);
    expect(createPlateMealInputSchema.safeParse({ items, plannedMealId: id(2), tz: "Mars/Base" }).success).toBe(false);
    expect(createPlateMealInputSchema.safeParse({ items, plannedMealId: id(2), tz: "Europe/London" }).success).toBe(true);
  });
});
