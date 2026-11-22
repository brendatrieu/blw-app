// Home's Up next (the plan card) (ledger 904, SPEC §5): CD-Home-Today, CD-After-Serve,
// CD-Home-Today-Done, the one "Nothing planned for today." page (ledger 948;
// it replaced CD-Home-No-Plan's no card), and no card before the plan loads. Markup through renderToString; ‹ › and Serve by calling
// the card as a plain function with its hooks mocked (node env, no DOM).
// Ledger 1142a: the pages are slides on Home's swipe track, so a fake scroller
// stands in for the browser: its scrollTo fires the scroll handler, as the
// browser does, and a swipe is a scroll the test reports by hand.
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanResponse, PlannedMeal, StorageItem } from "@blw/shared";
import type { TodayPage } from "./plan.js";

const h = vi.hoisted(() => ({
  plan: { data: undefined as unknown } as { data: unknown; isError?: boolean },
  planArgs: [] as unknown[][],
  oneTap: { pendingSlot: null as string | null, failedSlot: null as string | null },
  serves: [] as unknown[][],
  offline: false,
  // The card's first useState (the page it is on), when called as a function;
  // the swipe track's own state and refs (usePagedTrack) sit in slots after it.
  picked: null as string | null,
  setPicked: [] as unknown[],
  direct: false,
  states: [] as unknown[],
  s: 0,
  refs: [] as { current: unknown }[],
  r: 0,
  // Ledger 995: the account's preferences (Not now) and what the offer sent.
  prefs: undefined as { planOfferDismissedAt: string | null } | undefined,
  dismissCalls: 0,
  tracked: [] as unknown[][],
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (init: unknown) => {
      if (!h.direct) return (actual.useState as (i: unknown) => unknown)(init);
      const i = h.s++;
      if (i === 0)
        return [
          h.picked,
          (value: unknown) => {
            h.setPicked.push(value);
            h.picked = value as string | null;
          },
        ];
      if (!(i in h.states)) h.states[i] = init;
      return [h.states[i], (value: unknown) => (h.states[i] = value)];
    },
    useRef: (init: unknown) => {
      if (!h.direct) return actual.useRef(init);
      const i = h.r++;
      if (!(i in h.refs)) h.refs[i] = { current: init };
      return h.refs[i];
    },
    // Called as a function, an effect runs at once (the offer's shown event, the track's placing).
    useEffect: (effect: () => void, deps?: unknown[]) => (h.direct ? effect() : actual.useEffect(effect, deps)),
    useLayoutEffect: (effect: () => void, deps?: unknown[]) => (h.direct ? effect() : actual.useLayoutEffect(effect, deps)),
  };
});
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  flushSync: (fn: () => void) => fn(),
}));
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
vi.mock("../tour/hooks.js", () => ({
  usePreferences: () => ({ data: h.prefs }),
  useDismissPlanOffer: () => ({ mutate: () => h.dismissCalls++ }),
}));
vi.mock("../../lib/usage/track.js", () => ({ track: (...args: unknown[]) => h.tracked.push(args) }));

import { PlanOffer, TodaysPlan, TodaysPlanCard } from "./TodaysPlanCard.js";
import { ServedMealLines } from "../tracking/components/RatedMealLines.js";
import { PageTrack, type PagedTrack } from "../../components/ui/Pager.js";
import { todaysPlanPages } from "./plan.js";
import { SETTLE_MS } from "../../lib/trackSettle.js";

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
  renderToString(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(MemoryRouter, null, node as never)))
    .replace(/<!-- -->/g, "")
    .replace(/\u202f/g, " ");
const card = () => html(createElement(TodaysPlanCard, { babyId: "baby-1" }));
// Ledger 1142a: one slide per page on the swipe track; off-screen slides are
// inert, so the one without `inert` is the page on show.
const slides = (out: string) => out.split('<div class="w-full shrink-0 snap-start').slice(1);
const shownSlide = (out: string) => {
  const shown = slides(out).filter((slide) => !slide.slice(0, slide.indexOf(">")).includes("inert"));
  expect(shown).toHaveLength(1);
  return shown[0]!;
};

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
  h.states = [];
  h.refs = [];
  h.prefs = { planOfferDismissedAt: null };
  h.dismissCalls = 0;
  h.tracked.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("TodaysPlanCard (render)", () => {
  it("is not there at all before the plan has answered, after it failed, or without today's day (an older server)", () => {
    // Loading, failed (an older server has no plan route): no data. A week without today: no day.
    for (const state of [{ data: undefined }, { data: undefined, isError: true }, { data: plan([BREAKFAST], "2026-10-15") }]) {
      h.plan = state;
      expect(card()).toBe("");
    }
    // A 200 without days (verifier 1107 c1 N2): still no card, not the error page.
    h.plan = { data: { today: TODAY } };
    expect(card()).toBe("");
    // It reads the week the meal plan shows, so they share one answer.
    expect(h.planArgs[0]).toEqual(["baby-1", "2026-10-11", "2026-10-17"]); // Sunday to Saturday (969)
  });

  it("nothing planned today: Up next with Nothing planned for today. and Plan today to the Meal Plan on today, like the done page (ledger 948)", () => {
    // A day that only follows Daily meals with no food, and a saved day with no meals.
    for (const data of [plan([SNACK], TODAY, false), plan([{ ...SNACK, slotId: id(4), name: "Dinner" }, SNACK], TODAY, false), plan([])]) {
      h.plan = { data };
      const out = card();
      expect(out).toMatch(/^<section [^>]*aria-labelledby="up-next"/);
      expect(out).toContain(">Up next</h2>");
      expect(out).toContain('<p class="mt-2 text-[17px] leading-[1.3] font-bold text-[var(--color-text)]">Nothing planned for today.</p>');
      expect(out).toMatch(new RegExp(`<a class="[^"]*bg-\\[var\\(--color-bg-inset\\)\\][^"]*mt-3 w-full" href="/plan\\?date=${TODAY}"[^>]*>Plan today</a>`));
      // One page: both chevrons at an end.
      expect(out).toMatch(/aria-label="Previous meal" aria-disabled="true"/);
      expect(out).toMatch(/aria-label="Next meal" aria-disabled="true"/);
      expect(out).not.toContain("Snack");
      expect(out).not.toContain("Nothing planned yet");
      expect(out).not.toContain("Serve");
      expect(out).not.toContain("Plan tomorrow");
      // Ledger 1142a: one slide, so nothing to swipe to.
      expect(slides(out)).toHaveLength(1);
    }
  });

  it("opens on the next meal: its name and time, one row per item (36px plates), and a full-width one-tap Serve (CD-Home-Today)", () => {
    const out = card();
    expect(out).toMatch(/^<section [^>]*aria-labelledby="up-next"/);
    expect(out).toContain('<h2 id="up-next" class="text-[11px] leading-[normal] font-bold uppercase');
    expect(out).toContain(">Up next</h2>");
    expect(out).toMatch(/aria-label="Previous meal" aria-disabled="true"/);
    expect(out).toMatch(/aria-label="Next meal"(?! aria-disabled)/);
    expect(out).toContain(">Breakfast</span>");
    expect(out).toContain(">7:30 AM</span>");
    expect(out).toContain('<ul aria-label="On the plate"');
    expect(out).toContain(">Banana Peanut Butter Oat Pancakes</p>");
    expect(out).toContain(">Egg</p>");
    expect(out).toContain("width:36px;height:36px");
    expect(out).toMatch(/<button class="[^"]*min-h-12[^"]*w-full" type="button" aria-label="Serve Breakfast">Serve<\/button>/);
    // Ledger 1142a: every page waits on its own slide; Breakfast's is the one on show,
    // and the live line under the label names it (the rows sit still on a swipe).
    expect(slides(out).map((slide) => /<span class="text-xl[^>]*>([^<]*)</.exec(slide)?.[1])).toEqual(["Breakfast", "Lunch", "Snack"]);
    const shown = shownSlide(out);
    expect(shown).toContain(">Breakfast</span>");
    expect(shown).not.toContain("Snack");
    expect(out).toContain('<p aria-live="polite" class="sr-only">Breakfast, 7:30 AM</p>');
  });

  it("a saved day's meal with no food: its name and time, Nothing planned yet, and Plan this meal to its Plan a meal; no Serve (ledger 927)", () => {
    const EMPTY_BREAKFAST: PlannedMeal = { ...BREAKFAST, items: [] };
    h.plan = { data: plan([EMPTY_BREAKFAST, SNACK]) };
    let out = shownSlide(card());
    // All empty: opens on the next of them all (Breakfast, 07:30, at 07:10).
    expect(out).toContain(">Breakfast</span>");
    expect(out).toContain(">7:30 AM</span>");
    expect(out).toContain(">Nothing planned yet</p>");
    expect(out).toMatch(new RegExp(`<a class="[^"]*min-h-12[^"]*w-full" href="/plan/${TODAY}/${id(1)}"[^>]*>Plan this meal</a>`));
    expect(out).not.toContain("On the plate");
    expect(out).not.toContain(">Serve<");
    expect(out).not.toContain("Everything planned for today is served.");
    expect(card()).toMatch(/aria-label="Previous meal" aria-disabled="true"/);
    expect(card()).toMatch(/aria-label="Next meal"(?! aria-disabled)/);
    // Mixed: opens on the same meal as before (Lunch, the next with food), and Serve is only there.
    h.plan = { data: plan([EMPTY_BREAKFAST, LUNCH, SNACK]) };
    out = shownSlide(card());
    expect(out).toContain(">Lunch</span>");
    expect(out).toMatch(/aria-label="Serve Lunch">Serve<\/button>/);
    expect(out).not.toContain("Nothing planned yet");
    expect(out).not.toContain("Plan this meal");
  });

  it("a container's row says where it is and what is left", () => {
    h.plan = { data: plan([{ ...BREAKFAST, served: SERVED }, LUNCH]) };
    const out = shownSlide(card());
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
    const shown = shownSlide(out);
    expect(shown).toContain("Everything planned for today is served.");
    expect(shown).not.toContain("Serve");
    expect(out).toContain('<p aria-live="polite" class="sr-only">Everything planned for today is served.</p>');
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
  type Fn = (props: unknown) => El;
  type TrackProps = { track: PagedTrack; items: TodayPage[]; renderSlide: (slice: TodayPage[]) => El };
  const trackOf = (tree: unknown) => all(tree, (el) => el.type === PageTrack)[0]!.props as unknown as TrackProps;
  let latest: unknown = null;
  /** The card's tree, with the page on show expanded (its slide only names `UpNextPage`). */
  const call = (pages: TodayPage[]): El[] => {
    h.direct = true;
    h.s = 0;
    h.r = 0;
    const tree = (TodaysPlan as unknown as Fn)({ babyId: "baby-1", today: TODAY, pages });
    const { track, items, renderSlide } = trackOf(tree);
    const page = renderSlide([items[track.pages.page]!]).props.children as El;
    latest = tree;
    return [tree, (page.type as Fn)(page.props)];
  };
  const render = (meals: PlannedMeal[]) => call(todaysPlanPages(plan(meals).days[0]));
  const shownName = (tree: El[]) => text(all(tree[1], (el) => typeof el.props.className === "string" && el.props.className.startsWith("text-xl"))[0]);
  /** The browser's side of the track: 300px pages; scrollTo scrolls and fires the scroll handler, as the browser does. */
  const scroller = (tree: El[]) => {
    const el = {
      clientWidth: 300,
      scrollLeft: 0,
      scrolls: [] as unknown[],
      scrollTo(to: { left: number; behavior: string }) {
        el.scrolls.push(to);
        el.scrollLeft = to.left;
        el.scroll();
      },
      /** A scroll event (a swipe, or the browser catching up on a scroll the card set). */
      scroll() {
        trackOf(latest).track.onScroll({ currentTarget: el } as never);
      },
    };
    trackOf(tree).track.trackRef.current = el as never;
    return el;
  };

  it("a saved day pages through its empty meals in the parent's order; Serve is only on the meals with food; done once those are served (ledger 927)", () => {
    const pages = (meals: PlannedMeal[]) => todaysPlanPages(plan(meals).days[0]);
    const pageOf = (meals: PlannedMeal[], slot: string | null) => {
      h.picked = slot;
      return call(pages(meals));
    };
    const day = [SNACK, BREAKFAST, { ...LUNCH, items: [] }];
    expect(pages(day).map((page) => (typeof page === "string" ? page : page.name))).toEqual(["Snack", "Breakfast", "Lunch"]);
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

  it("loads on the time-based page: the track is put there at once, and that scroll picks nothing (ledger 1142a)", () => {
    const meals = [{ ...BREAKFAST, served: SERVED }, LUNCH];
    const el = scroller(render(meals));
    // Breakfast served at 07:10: Lunch is next, placed without a slide.
    const tree = render(meals);
    expect(shownName(tree)).toBe("Lunch");
    expect(trackOf(tree[0]).track.pages.page).toBe(1);
    expect([el.scrollLeft, el.scrolls]).toEqual([300, []]);
    el.scroll();
    expect(h.setPicked).toEqual([]);
    // Placed once: a later render leaves the track alone.
    render(meals);
    expect(el.scrollLeft).toBe(300);
  });

  it("a swipe picks the page it settles past half of, as ‹ › do, and the track stays where the finger left it (ledger 1142a)", () => {
    const meals = [{ ...BREAKFAST, served: SERVED }, LUNCH];
    const el = scroller(render(meals));
    render(meals);
    el.scrollLeft = 160; // not yet half way back to Breakfast
    el.scroll();
    expect(h.setPicked).toEqual([]);
    el.scrollLeft = 140;
    el.scroll();
    expect(h.setPicked).toEqual([id(1)]);
    const tree = render(meals);
    expect(shownName(tree)).toBe("Breakfast");
    expect(el.scrollLeft).toBe(140);
    expect(byLabel(tree, "Previous meal").props["aria-disabled"]).toBe(true);
  });

  it("the card takes the shown page's height only once the track has settled, never with a finger down (ledger 1142c)", () => {
    vi.useRealTimers(); // a second useFakeTimers would keep beforeEach's Date-only clock
    vi.useFakeTimers({ now: new Date("2026-10-14T07:10:00Z"), toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.stubGlobal("CSS", { supports: () => true }); // iOS: no `near` window
    const meals = [BREAKFAST, LUNCH];
    let tree = render(meals);
    const el = Object.assign(scroller(tree), { children: [292, 190].map((height) => ({ getBoundingClientRect: () => ({ height }) })) });
    const clipOf = (t: El[]) => all(t[0], (e) => typeof e.props.className === "string" && e.props.className.startsWith("overflow-clip"))[0]!;
    expect(clipOf(tree).props.className).toContain("transition-[height]");
    expect(clipOf(tree).props.className).toContain("motion-reduce:transition-none");
    const box = { style: { height: "", transition: "" }, getBoundingClientRect: () => ({ height: 292 }), offsetHeight: 292 };
    ((clipOf(tree) as unknown as { ref: { current: unknown } }).ref).current = box; // React 18 keeps `ref` off props
    // At rest (the first placement): fitted at once, before paint.
    tree = render(meals);
    expect(box.style.height).toBe("292px");
    // A finger drags to Lunch and holds still there: nothing changes.
    trackOf(tree).track.onTouchStart();
    for (const left of [100, 200, 300]) {
      el.scrollLeft = left;
      el.scroll();
      tree = render(meals);
    }
    vi.advanceTimersByTime(1000);
    expect(box.style.height).toBe("292px");
    // Lifted: still nothing until the track has been still a while.
    (clipOf(tree).props.onTouchEnd as (event: unknown) => void)({ touches: [] });
    tree = render(meals);
    expect(box.style.height).toBe("292px");
    vi.advanceTimersByTime(SETTLE_MS);
    expect(box.style.height).toBe("190px");
    // An arrow's scroll settles the same way.
    (byLabel(tree, "Previous meal").props.onClick as () => void)();
    render(meals);
    expect(box.style.height).toBe("190px");
    vi.advanceTimersByTime(SETTLE_MS);
    expect(box.style.height).toBe("292px");
    vi.unstubAllGlobals();
  });

  it("› and ‹ scroll the same track a page; the scroll picks the meal; nothing past either end (ledger 1142a)", () => {
    const meals = [BREAKFAST, LUNCH];
    const el = scroller(render(meals));
    let tree = render(meals);
    (byLabel(tree, "Previous meal").props.onClick as () => void)();
    expect([el.scrolls, h.setPicked]).toEqual([[], []]);
    (byLabel(tree, "Next meal").props.onClick as () => void)();
    expect(el.scrolls).toEqual([{ left: 300, behavior: "smooth" }]);
    expect(h.setPicked).toEqual([id(2)]);
    tree = render(meals);
    expect(shownName(tree)).toBe("Lunch");
    expect(byLabel(tree, "Next meal").props["aria-disabled"]).toBe(true);
    (byLabel(tree, "Next meal").props.onClick as () => void)();
    expect(el.scrolls).toHaveLength(1);
    (byLabel(tree, "Previous meal").props.onClick as () => void)();
    expect(el.scrolls.at(-1)).toEqual({ left: 0, behavior: "smooth" });
    expect(h.setPicked).toEqual([id(2), id(1)]);
  });

  it("Serve is today's one tap for that meal, and the card stays on it once served (CD-After-Serve)", () => {
    (byLabel(render([BREAKFAST, LUNCH]), "Serve Breakfast").props.onClick as () => void)();
    expect(h.serves).toEqual([[TODAY, TODAY, BREAKFAST]]);
    expect(h.setPicked).toEqual([id(1)]);
    h.picked = id(1);
    const served = render([{ ...BREAKFAST, served: SERVED }, LUNCH]);
    // Ledger 944: Add more (the logged meal's Edit with Add more open)
    // replaces Rate or change, and the served items carry their stars.
    expect(all(served, (el) => el.props.to === `/meals/${id(90)}`)).toHaveLength(0);
    const add = all(served, (el) => el.props.to === `/log-meal?edit=${id(90)}&add=1`);
    expect(add).toHaveLength(1);
    expect(text(add[0])).toBe("Add more");
    expect(all(served, (el) => el.type === ServedMealLines).map((el) => [el.props.mealId, el.props.look])).toEqual([[id(90), "home"]]);
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
    expect(serve.props).toMatchObject({ disabled: true, "aria-describedby": `up-next-offline-${id(1)}`, children: "Serve" });
    expect(text(all(offline, (el) => el.props.id === `up-next-offline-${id(1)}`)[0])).toBe("You're offline.");
  });
});

describe("Up next's one-time planning offer (ledger 995)", () => {
  const never = (meals: PlannedMeal[] = [], has = false) => ({ data: { ...plan(meals), accountHasPlannedFood: has } });

  it("never planned, not dismissed, nothing today: the offer line with Plan today (948's target) and Not now, no pager", () => {
    for (const meals of [[], [SNACK]]) {
      h.plan = never(meals);
      if (meals.length) h.plan = { data: { ...plan(meals, TODAY, false), accountHasPlannedFood: false } };
      const out = card();
      expect(out).toMatch(/^<section [^>]*aria-labelledby="up-next"/);
      expect(out).toContain(">Up next</h2>");
      expect(out).toContain('<p class="mt-2 text-[17px] leading-[1.3] font-bold text-[var(--color-text)]">Plan meals ahead, if you like.</p>');
      expect(out).toMatch(new RegExp(`<a class="[^"]*bg-\\[var\\(--color-bg-inset\\)\\][^"]*min-h-12[^"]*flex-1" href="/plan\\?date=${TODAY}"[^>]*>Plan today</a>`));
      expect(out).toMatch(/<button class="[^"]*min-h-12[^"]*flex-1" type="button">Not now<\/button>/);
      expect(out).not.toContain("Nothing planned for today.");
      expect(out).not.toContain("Previous meal");
    }
  });

  it("never planned and dismissed: no card; preferences not known yet: no card either (no flash of the offer)", () => {
    h.plan = never();
    h.prefs = { planOfferDismissedAt: "2026-11-18T09:00:00.000Z" };
    expect(card()).toBe("");
    h.prefs = undefined;
    expect(card()).toBe("");
  });

  it("planned before (any baby), or an older server without the signal: 948's line, dismissed or not", () => {
    for (const prefs of [{ planOfferDismissedAt: null }, { planOfferDismissedAt: "2026-11-18T09:00:00.000Z" }, undefined]) {
      h.prefs = prefs;
      for (const data of [never([], true).data, plan([])]) {
        h.plan = { data };
        const out = card();
        expect(out).toContain(">Nothing planned for today.</p>");
        expect(out).toMatch(new RegExp(`href="/plan\\?date=${TODAY}"[^>]*>Plan today</a>`));
        expect(out).not.toContain("Plan meals ahead");
        expect(out).not.toContain("Not now");
      }
    }
  });

  it("today with food always wins, even never-planned and dismissed", () => {
    h.plan = never([BREAKFAST]);
    h.prefs = { planOfferDismissedAt: "2026-11-18T09:00:00.000Z" };
    const out = card();
    expect(out).toContain(">Breakfast</span>");
    expect(out).toContain(">Serve</button>");
    expect(out).not.toContain("Plan meals ahead");
  });

  it("Not now sends not_now and the dismiss; Plan today sends plan_today and keeps its link; shown is sent once per app load", () => {
    type El = { type: unknown; props: Record<string, unknown> & { children?: unknown } };
    const find = (node: unknown, label: string): El | undefined => {
      if (Array.isArray(node)) return node.map((child) => find(child, label)).find(Boolean);
      if (!node || typeof node !== "object" || !("props" in node)) return undefined;
      const el = node as El;
      if (el.props.children === label) return el;
      return Object.values(el.props).map((value) => find(value, label)).find(Boolean);
    };
    h.direct = true;
    const render = () => (PlanOffer as unknown as (props: unknown) => El)({ today: TODAY });
    const tree = render();
    render();
    expect(h.tracked).toEqual([["plan_offer_shown", {}]]);
    h.tracked.length = 0;
    (find(tree, "Not now")!.props.onClick as () => void)();
    expect(h.tracked).toEqual([["plan_offer_answered", { answer: "not_now" }]]);
    expect(h.dismissCalls).toBe(1);
    h.tracked.length = 0;
    const planToday = find(tree, "Plan today")!;
    expect(planToday.props.to).toBe(`/plan?date=${TODAY}`);
    (planToday.props.onClick as () => void)();
    expect(h.tracked).toEqual([["plan_offer_answered", { answer: "plan_today" }]]);
    expect(h.dismissCalls).toBe(1);
  });
});
