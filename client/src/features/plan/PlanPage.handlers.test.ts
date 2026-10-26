// The meal plan page (ledger 904, CD-Plan-Day): which week it asks for, the
// strip, ‹ ›, Today, the selected day's meals and the Daily meals sheet;
// step 4.2: "+ Add a meal", ⋮ Copy to… and "Copied to {n} meals".
// Called as a plain function with its hooks mocked (node env, no DOM); the
// day is pinned with fake timers in UTC.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanResponse } from "@blw/shared";

const h = vi.hoisted(() => ({
  search: new URLSearchParams(),
  setSearch: [] as Array<[unknown, unknown]>,
  sets: [] as unknown[],
  open: false,
  // useState after the first (Daily meals open): Copy's meal, then the count.
  i: 0,
  states: [] as unknown[],
  baby: { activeBaby: { id: "baby-1" } as { id: string } | null, isLoading: false },
  plan: { data: undefined as PlanResponse | undefined, isLoading: false, isError: false },
  planArgs: [] as unknown[][],
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useState: (init: unknown) => {
    const i = h.i++;
    if (i === 0) return [h.open, (value: unknown) => h.sets.push(value)];
    if (!(i in h.states)) h.states[i] = init;
    return [h.states[i], (value: unknown) => (h.states[i] = value)];
  },
}));
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSearchParams: () => [h.search, (next: unknown, options: unknown) => h.setSearch.push([next, options])],
}));
vi.mock("../../components/ui/BackButton.js", () => ({ BackButton: () => null }));
vi.mock("../babies/useActiveBaby.js", () => ({ useActiveBaby: () => h.baby }));
vi.mock("./hooks.js", () => ({
  usePlan: (...args: unknown[]) => {
    h.planArgs.push(args);
    return h.plan;
  },
}));
vi.mock("./plan.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./plan.js")>()),
  deviceTimeZone: () => "UTC",
}));

import { EmptyState } from "../../components/ui/EmptyState.js";
import { PageHeader } from "../../components/ui/PageHeader.js";
import { SkeletonList } from "../../components/ui/Skeleton.js";
import { CopySheet } from "./CopySheet.js";
import { DailyMealsSheet } from "./DailyMealsSheet.js";
import { PlanMealCard } from "./PlanMealCard.js";
import { PlanPage } from "./PlanPage.js";

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
  Array.isArray(node) ? node.map(text).join("") : typeof node === "string" || typeof node === "number" ? String(node) : node && typeof node === "object" && "props" in node ? text((node as El).props.children) : "";
const byLabel = (tree: unknown, label: string) => findAll(tree, (el) => el.props["aria-label"] === label)[0];
const buttons = (tree: unknown) => findAll(tree, (el) => el.type === "button");
const byText = (tree: unknown, label: string) => buttons(tree).find((el) => text(el.props.children).trim() === label);
const dayButtons = (tree: unknown) => findAll(findAll(tree, (el) => el.props.role === "group")[0], (el) => el.type === "button");
const click = (el: El | undefined) => (el!.props.onClick as () => void)();
/** The header's Daily meals pill: PageHeader's `action`. */
const dailyMeals = (tree: unknown) => findAll(tree, (el) => el.type === PageHeader)[0]!.props.action as El;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const meal = (n: number, name: string, items: unknown[] = []) => ({ slotId: id(n), name, time: null, position: n, served: null, items });
const week = (from: string, planned: string[]): PlanResponse => ({
  today: "2026-10-14",
  dailyMeals: [{ id: id(1), name: "Breakfast", time: "07:30" }],
  days: Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.parse(`${from}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10);
    return {
      date,
      planned: planned.includes(date),
      meals: [meal(1, "Breakfast", planned.includes(date) ? [{ kind: "food", id: id(9) }] : []), meal(2, `Lunch ${date}`)],
    };
  }) as PlanResponse["days"],
});

function render(): El {
  h.i = 0;
  return (PlanPage as unknown as () => El)();
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-14T15:00:00Z"), toFake: ["Date"] });
  h.search = new URLSearchParams();
  h.states = [];
  h.setSearch.length = 0;
  h.sets.length = 0;
  h.open = false;
  h.baby = { activeBaby: { id: "baby-1" }, isLoading: false };
  h.plan = { data: week("2026-10-12", ["2026-10-13", "2026-10-14"]), isLoading: false, isError: false };
  h.planArgs.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("PlanPage (CD-Plan-Day)", () => {
  it("opens on today: asks for its Monday-to-Sunday week, presses today, and lists today's meals", () => {
    const tree = render();
    expect(h.planArgs).toEqual([["baby-1", "2026-10-12", "2026-10-18"]]);
    expect(findAll(tree, (el) => el.type === PageHeader)[0]!.props.title).toBe("Meal plan");
    expect(text(findAll(tree, (el) => el.props["aria-live"] === "polite")[0])).toBe("Oct 12 – 18");
    const days = dayButtons(tree);
    expect(days.map((day) => text(day.props.children))).toEqual(["M12", "T13", "W14", "T15", "F16", "S17", "S18"]);
    expect(days.map((day) => day.props["aria-pressed"])).toEqual([false, false, true, false, false, false, false]);
    expect(days.map((day) => day.props["aria-current"])).toEqual([undefined, undefined, "date", undefined, undefined, undefined, undefined]);
    expect(days[2]!.props["aria-label"]).toBe("Wednesday, October 14");
    // Today is showing, so no Today button.
    expect(byText(tree, "Today")).toBeUndefined();
    const cards = findAll(tree, (el) => el.type === PlanMealCard);
    expect(cards.map((card) => [card.props.date, card.props.today, (card.props.meal as { name: string }).name])).toEqual([
      ["2026-10-14", "2026-10-14", "Breakfast"],
      ["2026-10-14", "2026-10-14", "Lunch 2026-10-14"],
    ]);
    // Serve is wired in step 4.3.
    expect(cards[0]!.props.onServe).toBeUndefined();
  });

  it("dots each day with something planned; the selected day's dot is ink on apricot", () => {
    const dots = dayButtons(render()).map((day) => String(findAll(day, (el) => el.type === "span").at(-1)!.props.className));
    expect(dots.map((dot) => (dot.includes("apricot-ink") ? "ink" : dot.includes("color-accent") ? "dot" : "none"))).toEqual([
      "none",
      "dot",
      "ink",
      "none",
      "none",
      "none",
      "none",
    ]);
  });

  it("‹ › move a week, keeping the weekday; a day button selects that day; all in place of the URL entry", () => {
    const tree = render();
    click(byLabel(tree, "Previous week"));
    click(byLabel(tree, "Next week"));
    click(dayButtons(tree)[4]);
    expect(h.setSearch).toEqual([
      [{ date: "2026-10-07" }, { replace: true }],
      [{ date: "2026-10-21" }, { replace: true }],
      [{ date: "2026-10-16" }, { replace: true }],
    ]);
  });

  it("another day: asks for that week, shows Today, and Today goes back with no ?date=", () => {
    h.search = new URLSearchParams({ date: "2026-10-21" });
    h.plan = { data: week("2026-10-19", []), isLoading: false, isError: false };
    const tree = render();
    expect(h.planArgs).toEqual([["baby-1", "2026-10-19", "2026-10-25"]]);
    expect(dayButtons(tree).map((day) => day.props["aria-pressed"])).toEqual([false, false, true, false, false, false, false]);
    expect(dayButtons(tree).some((day) => day.props["aria-current"])).toBe(false);
    click(byText(tree, "Today"));
    click(byLabel(tree, "Previous week"));
    expect(h.setSearch).toEqual([
      [{}, { replace: true }],
      [{}, { replace: true }],
    ]);
  });

  it("a week across months is labelled with both", () => {
    h.search = new URLSearchParams({ date: "2026-10-28" });
    h.plan = { data: undefined, isLoading: true, isError: false };
    expect(text(findAll(render(), (el) => el.props["aria-live"] === "polite")[0])).toBe("Oct 26 – Nov 1");
  });

  it("a ?date= that is no real day falls back to today", () => {
    for (const bad of ["2026-02-30", "soon", ""]) {
      h.search = new URLSearchParams({ date: bad });
      h.planArgs.length = 0;
      render();
      expect(h.planArgs, bad).toEqual([["baby-1", "2026-10-12", "2026-10-18"]]);
    }
  });

  it("ends the day with + Add a meal, which opens Plan a meal for a new meal on that day", () => {
    h.search = new URLSearchParams({ date: "2026-10-16" });
    const link = findAll(render(), (el) => "to" in el.props && text(el.props.children) === "+ Add a meal")[0]!;
    expect(link.props.to).toBe("/plan/2026-10-16/new");
  });

  it("⋮ Copy to… opens the Copy sheet on that meal; a Copy shows its first day and Copied to {n} meals until another day", () => {
    let tree = render();
    expect(findAll(tree, (el) => el.type === CopySheet)[0]!.props.meal).toBeNull();
    const cards = findAll(tree, (el) => el.type === PlanMealCard);
    (cards[0]!.props.onCopy as () => void)();
    tree = render();
    const sheet = findAll(tree, (el) => el.type === CopySheet)[0]!;
    expect(sheet.props).toMatchObject({ babyId: "baby-1", date: "2026-10-14", today: "2026-10-14" });
    expect((sheet.props.meal as { name: string }).name).toBe("Breakfast");
    // Nothing copied yet: the live region is there, empty.
    const status = () => findAll(render(), (el) => el.props.role === "status")[0]!;
    expect(text(status())).toBe("");

    (sheet.props.onCopied as (filled: number, date: string) => void)(2, "2026-10-16");
    expect(h.setSearch).toEqual([[{ date: "2026-10-16" }, { replace: true }]]);
    expect(findAll(render(), (el) => el.type === CopySheet)[0]!.props.meal).toBeNull();
    expect(text(status())).toBe("Copied to 2 meals");
    click(byLabel(render(), "Next week"));
    expect(text(status())).toBe("");

    // Closing without copying changes nothing else.
    (cards[1]!.props.onCopy as () => void)();
    (findAll(render(), (el) => el.type === CopySheet)[0]!.props.onClose as () => void)();
    expect(findAll(render(), (el) => el.type === CopySheet)[0]!.props.meal).toBeNull();
  });

  it("Daily meals waits for the plan, then opens the sheet with the saved list", () => {
    h.plan = { data: undefined, isLoading: true, isError: false };
    let tree = render();
    expect(text(dailyMeals(tree).props.children)).toBe("Daily meals");
    expect(dailyMeals(tree).props.disabled).toBe(true);
    expect(findAll(tree, (el) => el.type === DailyMealsSheet)).toHaveLength(0);
    expect(findAll(tree, (el) => el.type === SkeletonList)).toHaveLength(1);

    h.plan = { data: week("2026-10-12", []), isLoading: false, isError: false };
    tree = render();
    expect(dailyMeals(tree).props.disabled).toBe(false);
    click(dailyMeals(tree));
    expect(h.sets).toEqual([true]);
    h.open = true;
    const sheet = findAll(render(), (el) => el.type === DailyMealsSheet)[0]!;
    expect(sheet.props).toMatchObject({ babyId: "baby-1", open: true, meals: [{ id: id(1), name: "Breakfast", time: "07:30" }] });
    (sheet.props.onClose as () => void)();
    expect(h.sets).toEqual([true, false]);
  });

  it("says so when the plan can't load, and asks for a baby first when there is none", () => {
    h.plan = { data: undefined, isLoading: false, isError: true };
    expect(text(render())).toContain("Couldn't load the plan.");
    h.baby = { activeBaby: null, isLoading: false };
    const tree = render();
    expect(findAll(tree, (el) => el.type === EmptyState)[0]!.props.title).toBe("Add a baby first");
    expect(dayButtons(tree)).toHaveLength(0);
  });
});
