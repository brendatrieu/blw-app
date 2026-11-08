// The meal plan page (ledger 904, CD-Plan-Day): which week it asks for, the
// strip, ‹ ›, Today, the selected day's meals and the Daily meals link;
// step 4.2: "+ Add a meal", ⋮ Copy to… and "Copied to {n} meals".
// Called as a plain function with its hooks mocked (node env, no DOM); the
// day is pinned with fake timers in UTC.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanResponse } from "@blw/shared";

const h = vi.hoisted(() => ({
  search: new URLSearchParams(),
  setSearch: [] as Array<[unknown, unknown]>,
  // useState: Copy's meal, then the count.
  i: 0,
  states: [] as unknown[],
  baby: { activeBaby: { id: "baby-1" } as { id: string } | null, isLoading: false },
  plan: { data: undefined as PlanResponse | undefined, isLoading: false, isError: false },
  planArgs: [] as unknown[][],
  // useOneTapServe: what the cards asked to serve, and its state.
  serves: [] as unknown[][],
  oneTap: { pendingSlot: null as string | null, failedSlot: null as string | null },
  effects: [] as Array<[() => void, unknown[]]>,
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  // Effects are kept, to run by hand: [0] the 951 "Copied" reveal, [1] A-N3's scroll padding.
  useEffect: (effect: () => void, deps: unknown[]) => h.effects.push([effect, deps]),
  useState: (init: unknown) => {
    const i = h.i++;
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
  useOneTapServe: () => ({ ...h.oneTap, serve: (...args: unknown[]) => h.serves.push(args) }),
}));
vi.mock("./plan.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./plan.js")>()),
  deviceTimeZone: () => "UTC",
}));

import { EmptyState } from "../../components/ui/EmptyState.js";
import { PageHeader } from "../../components/ui/PageHeader.js";
import { SkeletonList } from "../../components/ui/Skeleton.js";
import { CopySheet } from "./CopySheet.js";
import { PlanMealCard } from "./PlanMealCard.js";
import { DAY_STRIP_ID, PLAN_PILL, PlanPage, padScrollForStrip, revealBelowStrip } from "./PlanPage.js";
import { Link } from "react-router-dom";

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
  h.effects.length = 0;
  return (PlanPage as unknown as () => El)();
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-14T15:00:00Z"), toFake: ["Date"] });
  h.search = new URLSearchParams();
  h.states = [];
  h.setSearch.length = 0;
  h.baby = { activeBaby: { id: "baby-1" }, isLoading: false };
  h.plan = { data: week("2026-10-12", ["2026-10-13", "2026-10-14"]), isLoading: false, isError: false };
  h.planArgs.length = 0;
  h.serves.length = 0;
  h.oneTap = { pendingSlot: null, failedSlot: null };
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PlanPage (CD-Plan-Day)", () => {
  it("opens on today: asks for its Monday-to-Sunday week, presses today, and lists today's meals", () => {
    const tree = render();
    expect(h.planArgs).toEqual([["baby-1", "2026-10-12", "2026-10-18"]]);
    expect(findAll(tree, (el) => el.type === PageHeader)[0]!.props.title).toBe("Meal Plan");
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
    // ⋮ Move up / Move down (909) work from the shown day's order.
    expect(cards.map((card) => card.props.daySlotIds)).toEqual(cards.map(() => cards.map((card) => (card.props.meal as { slotId: string }).slotId)));
  });

  it("each card's Serve goes to the one-tap hook with its day and today; the in-flight and failed meal are told apart", () => {
    h.oneTap = { pendingSlot: id(1), failedSlot: id(2) };
    const cards = findAll(render(), (el) => el.type === PlanMealCard);
    expect(cards.map((card) => [card.props.serving, card.props.serveFailed])).toEqual([
      [true, false],
      [false, true],
    ]);
    (cards[1]!.props.onServe as () => void)();
    expect(h.serves.map(([date, today, meal]) => [date, today, (meal as { name: string }).name])).toEqual([
      ["2026-10-14", "2026-10-14", "Lunch 2026-10-14"],
    ]);
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

  it("keeps the day strip pinned under the app header: sticky in flow, page colour behind it, between cards and header (ledger 951)", () => {
    const strip = findAll(render(), (el) => el.props.id === DAY_STRIP_ID)[0]!;
    const classes = String(strip.props.className).split(" ");
    expect(classes).toEqual(expect.arrayContaining(["sticky", "z-[15]", "bg-[var(--color-bg)]", "-mx-4", "px-4", "pb-1.5", "-mb-1.5"]));
    expect(classes).not.toContain("fixed");
    expect(strip.props.style).toEqual({ top: "var(--header-height)" });
    // It holds the Days group itself; the week row (‹ ›) stays outside and scrolls away.
    const group = strip.props.children as El;
    expect([group.props.role, group.props["aria-label"]]).toEqual(["group", "Days"]);
    expect(findAll(strip, (el) => el.props["aria-label"] === "Previous week")).toEqual([]);
  });

  it("a day picked while the strip is pinned scrolls back to show what was under it (ledger 951)", () => {
    const box = (top: number, bottom: number) => ({ getBoundingClientRect: () => ({ top, bottom }) });
    const scrolls: number[] = [];
    vi.stubGlobal("window", { scrollBy: (_x: number, y: number) => scrolls.push(y) });
    // Under it by 140px: back by 140. Just below it, or no strip: no scroll.
    revealBelowStrip({ ...box(52, 128), nextElementSibling: box(-12, 0) } as unknown as Element);
    revealBelowStrip({ ...box(52, 128), nextElementSibling: box(128, 160) } as unknown as Element);
    revealBelowStrip({ ...box(52, 128), nextElementSibling: null } as unknown as Element);
    revealBelowStrip(null);
    expect(scrolls).toEqual([-140]);
    // The page asks for its strip on every pick (day, ‹ ›, Today, a Copy's day).
    const asked: string[] = [];
    vi.stubGlobal("document", { getElementById: (id: string) => (asked.push(id), { ...box(52, 128), nextElementSibling: box(100, 120) }) });
    const tree = render();
    click(dayButtons(tree)[4]);
    click(byLabel(tree, "Next week"));
    expect(asked).toEqual([DAY_STRIP_ID, DAY_STRIP_ID]);
    expect(scrolls).toEqual([-140, -28, -28]);
    // Nothing copied: the effect does nothing (so a page opened scrolled, as on Back, stays put).
    h.effects[0]![0]();
    expect(asked).toHaveLength(2);
    // After a Copy (the sheet closed in the same render), the effect reveals "Copied".
    (findAll(render(), (el) => el.type === CopySheet)[0]!.props.onCopied as (filled: number, date: string) => void)(1, "2026-10-16");
    asked.length = 0;
    render();
    const [effect, deps] = h.effects[0]!;
    expect(deps).toEqual([1]);
    effect();
    expect(asked).toEqual([DAY_STRIP_ID]);
    expect(scrolls.at(-1)).toBe(-28);
  });

  it("while the strip is shown, scroll padding covers header + strip, so focus is never hidden under them; gone when the page goes (A-N3)", () => {
    const props = new Map<string, string>();
    const observers: Array<{ observed: unknown[]; disconnected: boolean; fire: () => void }> = [];
    vi.stubGlobal("document", {
      documentElement: { style: { setProperty: (k: string, v: string) => props.set(k, v), removeProperty: (k: string) => props.delete(k) } },
      getElementById: (id: string) => (id === DAY_STRIP_ID ? strip : null),
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        o = { observed: [] as unknown[], disconnected: false, fire: () => {} };
        constructor(callback: () => void) {
          this.o.fire = callback;
          observers.push(this.o);
        }
        observe(el: unknown) {
          this.o.observed.push(el);
          this.o.fire();
        }
        disconnect() {
          this.o.disconnected = true;
        }
      },
    );
    const strip = { offsetHeight: 76 };
    // The page wires it to its strip, keyed on whether the strip is there.
    render();
    const [effect, deps] = h.effects[1]!;
    expect(deps).toEqual([true]);
    const undo = (effect as () => () => void)();
    expect(observers[0]!.observed).toEqual([strip]);
    expect(props.get("scroll-padding-top")).toBe("calc(var(--header-height) + 76px)");
    // Larger text, a taller strip: re-measured.
    strip.offsetHeight = 92;
    observers[0]!.fire();
    expect(props.get("scroll-padding-top")).toBe("calc(var(--header-height) + 92px)");
    // Leaving the page takes it away.
    undo();
    expect(observers[0]!.disconnected).toBe(true);
    expect(props.has("scroll-padding-top")).toBe(false);
    // No baby, no strip: nothing set.
    h.baby = { activeBaby: null, isLoading: false };
    render();
    expect(h.effects[1]![1]).toEqual([false]);
    expect(h.effects[1]![0]()).toBeUndefined();
    expect(padScrollForStrip(null)()).toBeUndefined();
    expect(props.size).toBe(0);
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

  it("Daily meals is the header's link to its own page, there before the plan loads (ledger 924)", () => {
    h.plan = { data: undefined, isLoading: true, isError: false };
    const tree = render();
    expect(dailyMeals(tree).type).toBe(Link);
    expect(dailyMeals(tree).props.to).toBe("/plan/daily-meals");
    expect(text(dailyMeals(tree).props.children)).toBe("Daily meals");
    expect(dailyMeals(tree).props.className).toBe(PLAN_PILL);
    expect(findAll(tree, (el) => el.type === SkeletonList)).toHaveLength(1);
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
