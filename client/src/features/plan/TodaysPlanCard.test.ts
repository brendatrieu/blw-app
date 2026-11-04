// Home's Today's plan (ledger 904, SPEC §5): CD-Home-Today, CD-After-Serve,
// CD-Home-Today-Done, and no card at all for a day with nothing planned
// (CD-Home-No-Plan). Markup through renderToString; ‹ › and Serve by calling
// the card as a plain function with its hooks mocked (node env, no DOM).
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanResponse, PlannedMeal, StorageItem } from "@blw/shared";

const h = vi.hoisted(() => ({
  plan: { data: undefined as unknown },
  planArgs: [] as unknown[][],
  oneTap: { pendingSlot: null as string | null, failedSlot: null as string | null },
  serves: [] as unknown[][],
  offline: false,
  // The card's one useState (the page it is on), when called as a function.
  picked: null as string | null,
  setPicked: [] as unknown[],
  direct: false,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (init: unknown) =>
      h.direct ? [h.picked, (value: unknown) => h.setPicked.push(value)] : (actual.useState as (i: unknown) => unknown)(init),
  };
});
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
vi.mock("../../lib/online.js", () => ({ useIsOffline: () => h.offline }));

import { TodaysPlan, TodaysPlanCard } from "./TodaysPlanCard.js";
import { todaysPlanPages } from "./plan.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TODAY = "2026-10-14";
const MUFFINS = {
  id: id(20),
  label: null,
  foods: [],
  recipeId: id(11),
  recipeTitle: "Broccoli Cheese Egg Muffins",
  location: "fridge",
  status: "active",
  servingsTotal: 6,
  servingsLeft: 2,
  quantityNote: null,
} as unknown as StorageItem;
const BREAKFAST: PlannedMeal = {
  slotId: id(1),
  name: "Breakfast",
  time: "07:30",
  position: 0,
  served: null,
  items: [
    { kind: "recipe", id: id(10), recipe: { id: id(12), title: "Banana Peanut Butter Oat Pancakes" }, leftOut: [] },
    { kind: "food", id: id(11), food: { id: id(3), slug: "egg", name: "Egg", category: "dairy", emoji: null } },
  ],
};
const LUNCH: PlannedMeal = { slotId: id(2), name: "Lunch", time: "12:00", position: 1, served: null, items: [{ kind: "storage", id: id(13), servings: 1, container: MUFFINS }] };
const SNACK: PlannedMeal = { slotId: id(3), name: "Snack", time: null, position: 2, served: null, items: [] };
const SERVED = { mealId: id(90), servedAt: "2026-10-14T07:42:00.000Z" };
const plan = (meals: PlannedMeal[], date = TODAY, planned = true): PlanResponse => ({
  today: TODAY,
  dailyMeals: [],
  days: [{ date, planned, meals }],
});

const html = (node: unknown) =>
  renderToString(createElement(MemoryRouter, null, node as never))
    .replace(/<!-- -->/g, "")
    .replace(/\u202f/g, " ");
const card = () => html(createElement(TodaysPlanCard, { babyId: "baby-1" }));

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-14T07:10:00Z"), toFake: ["Date"] });
  h.plan = { data: plan([BREAKFAST, LUNCH, SNACK]) };
  h.planArgs.length = 0;
  h.oneTap = { pendingSlot: null, failedSlot: null };
  h.serves.length = 0;
  h.offline = false;
  h.picked = null;
  h.setPicked.length = 0;
  h.direct = false;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("TodaysPlanCard (render)", () => {
  it("is not there at all without something planned today, or before the plan has answered (CD-Home-No-Plan)", () => {
    // A day that only follows Daily meals with no food: no card (ledger 927 keeps it so).
    for (const data of [undefined, plan([SNACK], TODAY, false), plan([{ ...SNACK, slotId: id(4), name: "Dinner" }, SNACK], TODAY, false), plan([BREAKFAST], "2026-10-15")]) {
      h.plan = { data };
      expect(card()).toBe("");
    }
    // It reads the week the meal plan shows, so they share one answer.
    expect(h.planArgs[0]).toEqual(["baby-1", "2026-10-12", "2026-10-18"]);
  });

  it("opens on the next meal: its name and time, one row per item (36px plates), and a full-width one-tap Serve (CD-Home-Today)", () => {
    const out = card();
    expect(out).toMatch(/^<section [^>]*aria-labelledby="todays-plan"/);
    expect(out).toContain('<h2 id="todays-plan" class="text-[11px] leading-[normal] font-bold uppercase');
    expect(out).toContain(">Today&#x27;s plan</h2>");
    expect(out).toMatch(/aria-label="Previous meal" aria-disabled="true"/);
    expect(out).toMatch(/aria-label="Next meal"(?! aria-disabled)/);
    expect(out).toContain(">Breakfast</span>");
    expect(out).toContain(">7:30 AM</span>");
    expect(out).toContain('<ul aria-label="On the plate"');
    expect(out).toContain(">Banana Peanut Butter Oat Pancakes</p>");
    expect(out).toContain(">Egg</p>");
    expect(out).toContain("width:36px;height:36px");
    expect(out).toMatch(/<button class="[^"]*min-h-12[^"]*w-full" type="button" aria-label="Serve Breakfast">Serve<\/button>/);
    expect(out).not.toContain("Snack");
  });

  it("a saved day's meal with no food: its name and time, Nothing planned yet, and Plan this meal to its Plan a meal; no Serve (ledger 927)", () => {
    const EMPTY_BREAKFAST: PlannedMeal = { ...BREAKFAST, items: [] };
    h.plan = { data: plan([EMPTY_BREAKFAST, SNACK]) };
    let out = card();
    // All empty: opens on the next of them all (Breakfast, 07:30, at 07:10).
    expect(out).toContain(">Breakfast</span>");
    expect(out).toContain(">7:30 AM</span>");
    expect(out).toContain(">Nothing planned yet</p>");
    expect(out).toMatch(new RegExp(`<a class="[^"]*min-h-12[^"]*w-full" href="/plan/${TODAY}/${id(1)}"[^>]*>Plan this meal</a>`));
    expect(out).not.toContain("On the plate");
    expect(out).not.toContain(">Serve<");
    expect(out).not.toContain("Everything planned for today is served.");
    expect(out).toMatch(/aria-label="Previous meal" aria-disabled="true"/);
    expect(out).toMatch(/aria-label="Next meal"(?! aria-disabled)/);
    // Mixed: opens on the same meal as before (Lunch, the next with food), and Serve is only there.
    h.plan = { data: plan([EMPTY_BREAKFAST, LUNCH, SNACK]) };
    out = card();
    expect(out).toContain(">Lunch</span>");
    expect(out).toMatch(/aria-label="Serve Lunch">Serve<\/button>/);
    expect(out).not.toContain("Nothing planned yet");
    expect(out).not.toContain("Plan this meal");
  });

  it("a container's row says where it is and what is left", () => {
    h.plan = { data: plan([{ ...BREAKFAST, served: SERVED }, LUNCH]) };
    const out = card();
    expect(out).toContain(">Lunch</span>");
    expect(out).toContain(">Broccoli Cheese Egg Muffins</p>");
    expect(out).toContain(">Fridge · 2 of 6 left</p>");
  });

  it("everything served: the done line and Plan tomorrow, with › at its end (CD-Home-Today-Done)", () => {
    h.plan = { data: plan([{ ...BREAKFAST, served: SERVED }, { ...LUNCH, served: { mealId: id(91), servedAt: SERVED.servedAt } }]) };
    const out = card();
    expect(out).toMatch(/<div role="status"[^>]*>.*Everything planned for today is served\.<\/span><\/div>/);
    expect(out).toMatch(/<a [^>]*href="\/plan\?date=2026-10-15"[^>]*>Plan tomorrow<\/a>/);
    expect(out).toContain("bg-[var(--color-bg-inset)]");
    expect(out).toMatch(/aria-label="Next meal" aria-disabled="true"/);
    expect(out).toMatch(/aria-label="Previous meal"(?! aria-disabled)/);
    expect(out).not.toContain("Serve");
  });
});

describe("TodaysPlan (handlers)", () => {
  type El = { type: unknown; props: Record<string, unknown> & { children?: unknown } };
  const all = (node: unknown, match: (el: El) => boolean, out: El[] = []): El[] => {
    if (Array.isArray(node)) node.forEach((child) => all(child, match, out));
    else if (node && typeof node === "object" && "props" in node) {
      const el = node as El;
      if (match(el)) out.push(el);
      for (const value of Object.values(el.props)) all(value, match, out);
    }
    return out;
  };
  const text = (node: unknown): string =>
    Array.isArray(node) ? node.map(text).join("") : typeof node === "string" ? node : node && typeof node === "object" && "props" in node ? text((node as El).props.children) : "";
  const byLabel = (tree: unknown, label: string) => all(tree, (el) => el.props["aria-label"] === label)[0]!;
  const render = (meals: PlannedMeal[]) => {
    h.direct = true;
    return (TodaysPlan as unknown as (props: unknown) => El)({ babyId: "baby-1", today: TODAY, pages: todaysPlanPages(plan(meals).days[0]) });
  };

  it("a saved day pages through its empty meals in the parent's order; Serve is only on the meals with food; done once those are served (ledger 927)", () => {
    const pages = (meals: PlannedMeal[]) => todaysPlanPages(plan(meals).days[0]);
    const pageOf = (meals: PlannedMeal[], slot: string | null) => {
      h.direct = true;
      h.picked = slot;
      return (TodaysPlan as unknown as (props: unknown) => El)({ babyId: "baby-1", today: TODAY, pages: pages(meals) });
    };
    const day = [SNACK, BREAKFAST, { ...LUNCH, items: [] }];
    expect(pages(day).map((page) => (page === "done" ? page : page.name))).toEqual(["Snack", "Breakfast", "Lunch"]);
    for (const meal of day) {
      const tree = pageOf(day, meal.slotId);
      const serve = all(tree, (el) => el.props["aria-label"] === `Serve ${meal.name}`);
      const planIt = all(tree, (el) => el.props.to === `/plan/${TODAY}/${meal.slotId}`);
      expect([meal.name, serve.length, planIt.length]).toEqual([meal.name, meal.items.length > 0 ? 1 : 0, meal.items.length > 0 ? 0 : 1]);
      if (planIt.length) expect(text(planIt[0])).toBe("Plan this meal");
    }
    // Breakfast (the one with food) served: the done page follows, and the card opens on it.
    const served = [SNACK, { ...BREAKFAST, served: SERVED }, { ...LUNCH, items: [] }];
    expect(pages(served).at(-1)).toBe("done");
    expect(text(pageOf(served, null))).toContain("Everything planned for today is served.");
  });

  it("› and ‹ move a meal by its slot; ‹ at the first meal does nothing", () => {
    const tree = render([BREAKFAST, LUNCH]);
    (byLabel(tree, "Previous meal").props.onClick as () => void)();
    (byLabel(tree, "Next meal").props.onClick as () => void)();
    expect(h.setPicked).toEqual([id(2)]);
  });

  it("Serve is today's one tap for that meal, and the card stays on it once served (CD-After-Serve)", () => {
    (byLabel(render([BREAKFAST, LUNCH]), "Serve Breakfast").props.onClick as () => void)();
    expect(h.serves).toEqual([[TODAY, TODAY, BREAKFAST]]);
    expect(h.setPicked).toEqual([id(1)]);
    h.picked = id(1);
    const served = render([{ ...BREAKFAST, served: SERVED }, LUNCH]);
    expect(all(served, (el) => el.props.to === `/meals/${id(90)}`)).toHaveLength(1);
    expect(text(all(served, (el) => el.props.to === `/meals/${id(90)}`)[0])).toBe("Rate or change");
    expect(all(served, (el) => el.props["aria-label"] === "Serve Breakfast")).toHaveLength(0);
  });

  it("in flight it reads Serving… and waits; a failed tap says try again; offline it waits with You're offline.", () => {
    h.oneTap = { pendingSlot: id(1), failedSlot: null };
    let serve = byLabel(render([BREAKFAST]), "Serve Breakfast");
    expect(serve.props).toMatchObject({ disabled: true, children: "Serving…" });
    h.oneTap = { pendingSlot: null, failedSlot: id(1) };
    const failed = render([BREAKFAST]);
    expect(all(failed, (el) => el.props.role === "alert").map(text)).toEqual(["Couldn't serve — try again."]);
    h.oneTap = { pendingSlot: null, failedSlot: null };
    h.offline = true;
    const offline = render([BREAKFAST]);
    serve = byLabel(offline, "Serve Breakfast");
    expect(serve.props).toMatchObject({ disabled: true, "aria-describedby": "todays-plan-offline", children: "Serve" });
    expect(text(all(offline, (el) => el.props.id === "todays-plan-offline")[0])).toBe("You're offline.");
  });
});
