// Copy to… (ledger 904 step 4.2; 814, CD-Copy-Per-Day, CD-Copy-Warnings): the
// sheet's own state, without a DOM. The form is called as a plain function
// with React's useState as a store and the plan hooks mocked: which days and
// meals it offers, what starts ticked, the clash boxes and the All row, the
// dry run it asks for, the warnings box, and the Copy it sends.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CopyPlanResponse, PlanDay, PlannedMeal, StorageItem } from "@blw/shared";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  return {
    store,
    offline: false,
    weeks: [] as string[][],
    checks: [] as unknown[],
    check: { data: undefined as CopyPlanResponse | undefined, isError: false },
    copies: [] as Array<{ input: unknown; options: { onSuccess?: (result: CopyPlanResponse) => void } }>,
    copy: { isPending: false, isError: false },
    days: {} as Record<string, PlanDay>,
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
      return [
        store.states[i],
        (value: unknown) => {
          store.states[i] = typeof value === "function" ? (value as (previous: unknown) => unknown)(store.states[i]) : value;
        },
      ];
    },
  };
});

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), useState: h.useState }));
vi.mock("../../lib/online.js", () => ({ useIsOffline: () => h.offline }));
vi.mock("./hooks.js", () => ({
  usePlanWeeks: (_babyId: string, weekStarts: string[]) => {
    h.weeks.push(weekStarts);
    return (date: string) => h.days[date];
  },
  useCopyCheck: (_babyId: string, input: unknown) => {
    h.checks.push(input);
    return h.check;
  },
  useCopyPlan: () => ({
    mutate: (input: unknown, options: (typeof h.copies)[number]["options"]) => h.copies.push({ input, options }),
    get isPending() {
      return h.copy.isPending;
    },
    get isError() {
      return h.copy.isError;
    },
  }),
}));

import { Button } from "../../components/ui/Button.js";
import { CopyForm } from "./CopySheet.js";

interface El {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
}
function findAll(node: unknown, match: (el: El) => boolean, out: El[] = []): El[] {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, match, out);
    return out;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return out;
  const el = node as El;
  if (match(el)) out.push(el);
  findAll(el.props.children, match, out);
  return out;
}
const text = (node: unknown): string =>
  Array.isArray(node)
    ? node.map(text).join("")
    : typeof node === "string" || typeof node === "number"
      ? String(node)
      : node && typeof node === "object" && "props" in node
        ? text((node as El).props.children)
        : "";
const click = (el: El | undefined) => (el!.props.onClick as () => void)();
const byLabel = (tree: El, label: string) => findAll(tree, (el) => el.props["aria-label"] === label)[0];
const dayButtons = (tree: El) =>
  findAll(findAll(tree, (el) => el.props["aria-labelledby"] === "copy-days")[0], (el) => el.type === "button");
/** A day's row (by its header id) and its meal chips. */
const row = (tree: El, date: string) => findAll(tree, (el) => el.props["aria-labelledby"] === `copy-day-${date}`)[0];
const chips = (tree: El, date: string) => findAll(row(tree, date), (el) => el.type === "button" && "aria-pressed" in el.props);
const chip = (tree: El, date: string, name: string) => chips(tree, date).find((el) => text(el.props.children) === name);
const radioGroups = (tree: El) => findAll(tree, (el) => el.props.role === "radiogroup");
const radio = (group: El, label: string) => findAll(group, (el) => el.props.role === "radio" && text(el.props.children) === label)[0]!;
const pastLimit = (tree: El) => findAll(tree, (el) => el.props.id === "copy-past-limit");
const copyButton = (tree: El) => findAll(tree, (el) => el.type === Button)[0]!;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const MUFFINS = {
  id: id(30),
  label: null,
  recipeId: id(20),
  recipeTitle: "Broccoli Cheese Egg Muffins",
  foods: [],
  location: "fridge",
  quantityNote: null,
  status: "active",
  servingsLeft: 2,
  servingsTotal: 6,
  bestBy: "2026-10-15",
  expiresAt: "2026-10-30T00:00:00.000Z",
} as unknown as StorageItem;
const meal = (n: number, name: string, over: Partial<PlannedMeal> = {}): PlannedMeal => ({
  slotId: id(n),
  name,
  time: null,
  position: n,
  served: null,
  items: [],
  ...over,
});
const food = (n: number, name: string) => ({ kind: "food" as const, id: id(n), food: { id: id(n), slug: "x", name, category: "fruit" as const } });
const LUNCH = meal(51, "Lunch", { items: [{ kind: "storage", id: id(1), servings: 1, container: MUFFINS }, food(2, "Banana")] });
const day = (date: string, meals: PlannedMeal[]): PlanDay => ({ date, planned: true, meals });

let onCopied: Array<[number, string | undefined]> = [];
let props: Record<string, unknown> = {};
function render(over: Record<string, unknown> = {}): El {
  h.store.states = [];
  props = { babyId: "baby-1", date: "2026-10-14", today: "2026-10-14", meal: LUNCH, onCopied: (...args: [number, string]) => onCopied.push(args), ...over };
  return again();
}
function again(): El {
  h.store.i = 0;
  return (CopyForm as unknown as (p: unknown) => El)(props);
}

beforeEach(() => {
  h.offline = false;
  h.weeks.length = 0;
  h.checks.length = 0;
  h.check = { data: undefined, isError: false };
  h.copies.length = 0;
  h.copy = { isPending: false, isError: false };
  onCopied = [];
  h.days = {
    "2026-10-13": day("2026-10-13", [meal(40, "Lunch")]),
    "2026-10-14": day("2026-10-14", [meal(50, "Breakfast"), LUNCH, meal(52, "Dinner")]),
    "2026-10-15": day("2026-10-15", [meal(60, "Breakfast"), meal(61, "Lunch"), meal(62, "Dinner", { items: [food(3, "Salmon Oat Patties"), food(4, "Egg")] })]),
    "2026-10-16": day("2026-10-16", [
      meal(70, "Breakfast", { items: [food(5, "Overnight Oats with Chia & Pear")] }),
      meal(71, "Lunch", { served: { mealId: id(90), servedAt: "2026-10-16T12:00:00.000Z" } }),
    ]),
    "2026-10-17": day("2026-10-17", [meal(80, "Breakfast", { items: [food(6, "Apple Cinnamon Tahini Oatmeal")] }), meal(81, "Lunch")]),
    "2026-10-18": day("2026-10-18", [meal(85, "Lunch")]),
    "2026-10-21": day("2026-10-21", [meal(90, "Breakfast"), meal(91, "Lunch")]),
  };
});

describe("Copy to… (CD-Copy-Per-Day)", () => {
  it("shows the meal's plate, then the source's week: days more than 7 back off (936), nothing selected or asked yet", () => {
    const tree = render();
    expect(findAll(tree, (el) => el.type === "li").map((li) => text(li.props.children))).toEqual([
      "Broccoli Cheese Egg MuffinsFridge · 2 of 6 left",
      "Banana",
    ]);
    expect(h.weeks).toEqual([["2026-10-11"]]);
    expect(text(findAll(tree, (el) => el.props["aria-live"] === "polite")[0])).toBe("Oct 11 – 17");
    // Ledger 936: the past 7 days take a copy too, so ‹ reaches last week.
    expect(byLabel(tree, "Previous week")!.props.disabled).toBe(false);
    expect(dayButtons(tree).map((button) => [button.props["aria-label"], button.props.disabled, button.props["aria-pressed"]])).toEqual([
      ["Sunday, October 11", true, false], // no plan loaded for it here
      ["Monday, October 12", true, false], // nor for this one
      ["Tuesday, October 13", false, false],
      ["Wednesday, October 14", false, false],
      ["Thursday, October 15", false, false],
      ["Friday, October 16", false, false],
      ["Saturday, October 17", false, false],
    ]);
    expect(text(tree)).not.toContain("Meals");
    expect(h.checks).toEqual([null]);
    expect(copyButton(tree).props.disabled).toBe(true);
    // Ledger 956: this week has no days out of reach, so no limit line.
    expect(pastLimit(tree)).toEqual([]);
    expect(findAll(tree, (el) => el.props["aria-labelledby"] === "copy-days")[0]!.props["aria-describedby"]).toBeUndefined();
  });

  it("a past source opens on today's week; a later one on its own", () => {
    render({ date: "2026-10-07" });
    render({ date: "2026-10-21" });
    expect(h.weeks).toEqual([["2026-10-11"], ["2026-10-18"]]);
  });

  it("a selected day starts with its own Lunch ticked; the meal itself and a served one can't take it", () => {
    let tree = render();
    click(dayButtons(tree)[3]); // Wed 14, the source's day
    click(dayButtons(again())[4]); // Thu 15
    click(dayButtons(again())[5]); // Fri 16
    tree = again();
    expect(dayButtons(tree).map((button) => button.props["aria-pressed"])).toEqual([false, false, false, true, true, true, false]);
    expect(findAll(tree, (el) => typeof el.props.id === "string" && el.props.id.startsWith("copy-day-")).map((el) => text(el.props.children))).toEqual([
      "Wed 14",
      "Thu 15",
      "Fri 16",
    ]);
    expect(chips(tree, "2026-10-14").map((el) => [text(el.props.children), el.props["aria-pressed"], el.props.disabled])).toEqual([
      ["Breakfast", false, false],
      ["Lunch", false, true],
      ["Dinner", false, false],
    ]);
    expect(chips(tree, "2026-10-15").map((el) => [text(el.props.children), el.props["aria-pressed"]])).toEqual([
      ["Breakfast", false],
      ["Lunch", true],
      ["Dinner", false],
    ]);
    // Fri 16's Lunch is served: not ticked, and it can't be.
    expect(chips(tree, "2026-10-16").map((el) => [text(el.props.children), el.props["aria-pressed"], el.props.disabled])).toEqual([
      ["Breakfast", false, false],
      ["Lunch", false, true],
    ]);
    expect(h.checks.at(-1)).toEqual({
      source: { date: "2026-10-14", slotId: LUNCH.slotId },
      targets: [{ date: "2026-10-15", slotId: id(61), onClash: "keep" }],
    });
    expect(copyButton(tree).props.disabled).toBe(false);
  });

  it("a ticked meal with something planned asks Keep it / Replace it in its row, Keep it first", () => {
    render();
    click(dayButtons(again())[4]);
    click(chip(again(), "2026-10-15", "Dinner"));
    let tree = again();
    const [clash] = radioGroups(tree);
    expect(clash!.props["aria-label"]).toBe("Thu 15 Dinner");
    expect(text(clash)).toBe("Thu 15 already has a Dinner planned.Salmon Oat Patties, EggKeep itReplace it");
    expect(radio(clash!, "Keep it").props["aria-checked"]).toBe(true);
    expect(radio(clash!, "Replace it").props["aria-checked"]).toBe(false);
    // One clash: no footer box.
    expect(text(tree)).not.toContain("already planned.");
    click(radio(clash!, "Replace it"));
    tree = again();
    expect(radio(radioGroups(tree)[0]!, "Replace it").props["aria-checked"]).toBe(true);
    expect((h.checks.at(-1) as { targets: unknown[] }).targets).toEqual([
      { date: "2026-10-15", slotId: id(61), onClash: "keep" },
      { date: "2026-10-15", slotId: id(62), onClash: "replace" },
    ]);
    // Unticking every meal keeps the day's row, and asks nothing.
    click(chip(tree, "2026-10-15", "Lunch"));
    click(chip(again(), "2026-10-15", "Dinner"));
    tree = again();
    expect(row(tree, "2026-10-15")).toBeDefined();
    expect(radioGroups(tree)).toHaveLength(0);
    expect(h.checks.at(-1)).toBeNull();
    expect(copyButton(tree).props.disabled).toBe(true);
  });

  it("Copy is off while no ticked meal would be filled: every clash on Keep it and nothing empty (VERIFY-p4-c1 #4)", () => {
    render();
    click(dayButtons(again())[4]); // Thu 15: Lunch (empty) starts ticked
    click(chip(again(), "2026-10-15", "Dinner"));
    click(chip(again(), "2026-10-15", "Lunch"));
    let tree = again();
    expect((h.checks.at(-1) as { targets: unknown[] }).targets).toEqual([{ date: "2026-10-15", slotId: id(62), onClash: "keep" }]);
    expect(copyButton(tree).props.disabled).toBe(true);
    click(radio(radioGroups(tree)[0]!, "Replace it"));
    tree = again();
    expect(copyButton(tree).props.disabled).toBe(false);
    click(radio(radioGroups(tree)[0]!, "Keep it"));
    click(chip(again(), "2026-10-15", "Lunch"));
    expect(copyButton(again()).props.disabled).toBe(false);
  });

  it("two or more clashes add the pinned count and the All row, which answers them all; mixed answers light neither", () => {
    render();
    click(dayButtons(again())[4]);
    click(chip(again(), "2026-10-15", "Dinner"));
    click(dayButtons(again())[5]);
    click(chip(again(), "2026-10-16", "Breakfast"));
    click(dayButtons(again())[6]);
    click(chip(again(), "2026-10-17", "Breakfast"));
    let tree = again();
    // Each clash sits in its own day's row.
    expect(["2026-10-15", "2026-10-16", "2026-10-17"].map((date) => radioGroups(row(tree, date)!).map((group) => group.props["aria-label"]))).toEqual([
      ["Thu 15 Dinner"],
      ["Fri 16 Breakfast"],
      ["Sat 17 Breakfast"],
    ]);
    expect(text(tree)).toContain("3 of the selected meals are already planned.");
    const all = () => radioGroups(again()).find((group) => group.props["aria-label"] === "All 3 days")!;
    expect(radio(all(), "Keep it").props["aria-checked"]).toBe(true);
    click(radio(radioGroups(again())[1]!, "Replace it")); // Fri 16 Breakfast
    expect(radio(all(), "Keep it").props["aria-checked"]).toBe(false);
    expect(radio(all(), "Replace it").props["aria-checked"]).toBe(false);
    click(radio(all(), "Replace it"));
    tree = again();
    expect(radioGroups(tree).slice(0, 3).map((group) => radio(group, "Replace it").props["aria-checked"])).toEqual([true, true, true]);
    // Thu 15 Lunch and Sat 17 Lunch (ticked as the source's name) have nothing to replace.
    expect((h.checks.at(-1) as { targets: Array<{ slotId: string; onClash: string }> }).targets.map((target) => [target.slotId, target.onClash])).toEqual([
      [id(61), "keep"],
      [id(62), "replace"],
      [id(70), "replace"],
      [id(80), "replace"],
      [id(81), "keep"],
    ]);
    // Two clashes on one day: the All row counts meals.
    render();
    click(dayButtons(again())[4]);
    click(chip(again(), "2026-10-15", "Dinner"));
    h.days["2026-10-15"]!.meals[1]!.items = [food(7, "Pear")];
    expect(radioGroups(again()).map((group) => group.props["aria-label"])).toEqual(["Thu 15 Lunch", "Thu 15 Dinner", "All 2 meals"]);
  });

  it("the dry run's warnings sit in one calm box at the end; nothing blocks Copy", () => {
    render();
    click(dayButtons(again())[4]);
    h.check = {
      data: {
        filled: 1,
        skipped: [],
        days: [],
        warnings: [
          { kind: "may_run_out", storageItemId: MUFFINS.id, servingsLeft: 2, plannedTimes: 3, date: "2026-10-16" },
          { kind: "past_best_by", storageItemId: MUFFINS.id, date: "2026-10-16" },
        ],
      },
      isError: false,
    };
    const tree = again();
    const note = findAll(tree, (el) => el.props.role === "note")[0]!;
    expect(text(note)).toBe(
      "2 servings left, planned 3 timesBroccoli Cheese Egg Muffins may run out before Fri 16. You can still copy." +
        "Best by Thu, Oct 15Broccoli Cheese Egg Muffins will be past the Best by date on Fri 16. You can still copy.",
    );
    expect(copyButton(tree).props.disabled).toBe(false);
    // A failed dry run, or nothing chosen any more, shows no box.
    h.check.isError = true;
    expect(findAll(again(), (el) => el.props.role === "note")).toHaveLength(0);
    h.check.isError = false;
    click(dayButtons(again())[4]);
    expect(findAll(again(), (el) => el.props.role === "note")).toHaveLength(0);
  });

  it("offers the past 7 days, no further back; a past day keeps or replaces like any other (ledger 936)", () => {
    h.days["2026-10-06"] = day("2026-10-06", [meal(30, "Lunch")]);
    h.days["2026-10-07"] = day("2026-10-07", [meal(31, "Lunch")]);
    h.days["2026-10-13"] = day("2026-10-13", [meal(40, "Lunch", { items: [food(7, "Pear")] })]);
    render();
    click(byLabel(again(), "Previous week")!);
    let tree = again();
    expect(text(findAll(tree, (el) => el.props["aria-live"] === "polite")[0])).toBe("Oct 4 – 10");
    // 7 October is today-7: the earliest. ‹ stops here.
    expect(byLabel(tree, "Previous week")!.props.disabled).toBe(true);
    expect(dayButtons(tree).slice(0, 4).map((button) => [button.props["aria-label"], button.props.disabled])).toEqual([
      ["Sunday, October 4", true],
      ["Monday, October 5", true],
      ["Tuesday, October 6", true],
      ["Wednesday, October 7", false],
    ]);
    // Ledger 956: the week with days out of reach says how far back a copy goes,
    // and the day picker points at it.
    expect(pastLimit(tree).map((el) => [el.props.id, text(el.props.children)])).toEqual([["copy-past-limit", "You can copy up to 7 days back."]]);
    expect(findAll(tree, (el) => el.props["aria-labelledby"] === "copy-days")[0]!.props["aria-describedby"]).toBe("copy-past-limit");
    click(dayButtons(tree)[3]); // Wed 7: its Lunch starts ticked, like any day
    click(byLabel(again(), "Next week")!);
    click(dayButtons(again())[2]); // Tue 13: its Lunch has something planned
    tree = again();
    expect(text(tree)).toContain("Meals");
    // The past day's clash asks Keep it / Replace it as any other day does.
    const radios = findAll(tree, (el) => el.props.role === "radio");
    expect(radios.map((el) => [text(el.props.children), el.props["aria-checked"]])).toEqual([
      ["Keep it", true],
      ["Replace it", false],
    ]);
    click(radios[1]);
    again();
    expect((h.checks.at(-1) as { targets: unknown[] }).targets).toEqual([
      { date: "2026-10-07", slotId: id(31), onClash: "keep" },
      { date: "2026-10-13", slotId: id(40), onClash: "replace" },
    ]);
    expect(copyButton(again()).props.disabled).toBe(false);
    // Back on today's week the line is gone again.
    expect(pastLimit(again())).toEqual([]);
  });

  it("shows the limit line on the week where the 7 days start, also when that is a whole week (ledger 956)", () => {
    // Today Sunday 18 October: today-7 is Sunday 11, so last week has no day off,
    // but ‹ stops there; the line says why.
    h.days["2026-10-11"] = day("2026-10-11", [meal(38, "Lunch")]);
    h.days["2026-10-12"] = day("2026-10-12", [meal(39, "Lunch")]);
    let tree = render({ date: "2026-10-18", today: "2026-10-18" });
    expect(pastLimit(tree)).toEqual([]);
    click(byLabel(tree, "Previous week")!);
    tree = again();
    expect(byLabel(tree, "Previous week")!.props.disabled).toBe(true);
    expect(dayButtons(tree).map((button) => button.props.disabled)).toEqual([false, false, false, false, false, false, false]);
    expect(pastLimit(tree).map((el) => text(el.props.children))).toEqual(["You can copy up to 7 days back."]);
  });

  it("keeps days selected in another week as rows, and asks for their weeks too", () => {
    render();
    click(dayButtons(again())[4]); // Thu 15
    click(byLabel(again(), "Next week")!);
    const tree = again();
    expect(text(findAll(tree, (el) => el.props["aria-live"] === "polite")[0])).toBe("Oct 18 – 24");
    expect(byLabel(tree, "Previous week")!.props.disabled).toBe(false);
    click(dayButtons(tree)[3]); // Wed 21
    again();
    expect(h.weeks.at(-1)).toEqual(["2026-10-18", "2026-10-11", "2026-10-18"]);
    expect((h.checks.at(-1) as { targets: unknown[] }).targets).toEqual([
      { date: "2026-10-15", slotId: id(61), onClash: "keep" },
      { date: "2026-10-21", slotId: id(91), onClash: "keep" },
    ]);
  });

  it("Copy sends the source and targets, then reports how many got it and the first day that did", () => {
    render();
    click(dayButtons(again())[4]);
    click(dayButtons(again())[6]);
    click(chip(again(), "2026-10-17", "Breakfast"));
    click(copyButton(again()));
    expect(h.copies.map((call) => call.input)).toEqual([
      {
        source: { date: "2026-10-14", slotId: LUNCH.slotId },
        targets: [
          { date: "2026-10-15", slotId: id(61), onClash: "keep" },
          { date: "2026-10-17", slotId: id(80), onClash: "keep" },
          { date: "2026-10-17", slotId: id(81), onClash: "keep" },
        ],
      },
    ]);
    h.copies[0]!.options.onSuccess!({ filled: 2, skipped: [{ date: "2026-10-15", slotId: id(61), reason: "kept" }], warnings: [], days: [] });
    expect(onCopied).toEqual([[2, "2026-10-17"]]);
  });

  it("offline: no dry run, Copy off with You're offline. under it; in flight it reads Copying…; a failure says so", () => {
    h.offline = true;
    render();
    click(dayButtons(again())[4]);
    let tree = again();
    expect(h.checks.every((input) => input === null)).toBe(true);
    expect(copyButton(tree).props).toMatchObject({ disabled: true, "aria-describedby": "copy-offline" });
    expect(text(findAll(tree, (el) => el.props.role === "status")[0])).toBe("You're offline.");
    h.offline = false;
    h.copy.isPending = true;
    tree = again();
    expect(text(copyButton(tree).props.children)).toBe("Copying…");
    expect(copyButton(tree).props.disabled).toBe(true);
    h.copy = { isPending: false, isError: true };
    expect(text(findAll(again(), (el) => el.props.role === "alert")[0])).toBe("Couldn't copy that — try again.");
  });
});
