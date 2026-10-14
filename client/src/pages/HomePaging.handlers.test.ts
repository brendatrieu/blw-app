// Item 694: Home's ‹ › paging driven through the real components. Hooks are
// a slot store (idiom from MealDeleteDialog.handlers / Menu.handlers), the
// components are called as plain functions, and the element tree is read by
// hand — so "click ›", "items shrink" and "delete the last row" run in node.
// Item 775: the page is read back from the swipe track's scroll position, so
// `next()` hands the track a fake scroller whose scrollTo fires the scroll
// handler, as the browser does; the rows read are the one non-inert slide's.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0, refs: [] as { current: unknown }[], r: 0 };
  return {
    store,
    meals: [] as unknown[],
    storage: [] as unknown[],
    allergens: [] as unknown[],
    activeBaby: null as unknown,
    /** "flush" when the ‹ › handler flushes its snap reset; "scrollTo" when it scrolls. */
    order: [] as string[],
    useRef: (init: unknown) => {
      const i = store.r++;
      if (!(i in store.refs)) store.refs[i] = { current: init };
      return store.refs[i]!;
    },
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states))
        store.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
      return [store.states[i], (value: unknown) => (store.states[i] = value)];
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState, useRef: h.useRef, useMemo: (fn: () => unknown) => fn() };
});
vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    flushSync: (fn: () => void) => {
      fn();
      h.order.push("flush");
    },
  };
});
vi.mock("../features/tracking/hooks.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useMeals: () => ({ data: { items: h.meals }, isLoading: false, isError: false }),
  useDeleteMeal: () => ({ isPending: false, isError: false, mutate: () => {} }),
  useAllergenProgress: () => ({ data: { items: h.allergens }, isLoading: false }),
}));
vi.mock("../features/babies/useActiveBaby.js", () => ({
  useActiveBaby: () => ({ activeBaby: h.activeBaby, isLoading: false }),
}));
vi.mock("../features/storage/hooks.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useStorageItems: () => ({ data: { items: h.storage }, isLoading: false }),
}));

import { PageTrack, Pager, type PageWindow, type PagedTrack } from "../components/ui/Pager.js";
import { MealCard, ServeLogList } from "../features/tracking/components/ServeLogList.js";
import { StorageItemRow } from "../features/storage/components/StorageItemCard.js";
import { StorageItemActionsMenu } from "../features/storage/components/StorageItemActionsMenu.js";
import { AllergenUpNextMenu } from "../features/tracking/components/AllergenUpNextMenu.js";
import { SectionLink } from "../components/ui/SectionLink.js";
import { DashboardPage, StorageSection, UP_NEXT_LIMIT, UpNextCard } from "./DashboardPage.js";

interface El {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
}
function find(node: unknown, type: unknown): El | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const el = node as El;
  return el.type === type ? el : find(el.props.children, type);
}

/** The swipe track's one shown (non-inert) slide, rendered: its Card or ul. */
function shownSlide(tree: unknown): El | null {
  const track = find(tree, PageTrack);
  if (!track) return null;
  const slides = (PageTrack(track.props as unknown as Parameters<typeof PageTrack>[0]) as unknown as El).props
    .children as El[];
  const shown = slides.filter((slide) => !("inert" in slide.props));
  expect(shown).toHaveLength(1);
  return shown[0]!.props.children as El;
}

/** A scroller as the browser has it: scrollTo moves it and fires `onScroll`. */
const TRACK_WIDTH = 300;
function scroller(track: PagedTrack) {
  const el = (track.trackRef.current ??= {
    clientWidth: TRACK_WIDTH,
    scrollLeft: 0,
  } as unknown as HTMLDivElement) as HTMLDivElement & { calls?: ScrollToOptions[] };
  el.scrollTo = ((options: ScrollToOptions) => {
    h.order.push("scrollTo");
    (el.calls ??= []).push(options);
    el.scrollLeft = options.left ?? 0;
    track.onScroll({ currentTarget: el } as never);
  }) as never;
  return el;
}

function view(render: () => unknown, row: unknown) {
  h.store.i = h.store.r = 0;
  const tree = render();
  const pager = find(tree, Pager);
  const track = find(tree, PageTrack)?.props.track as PagedTrack | undefined;
  const rows = ((shownSlide(tree)?.props.children ?? []) as El[]).filter((el) => el.type === row);
  return {
    pages: pager?.props.pages as PageWindow | undefined,
    next: () => {
      scroller(track!);
      (pager!.props.onPage as (p: number) => void)((pager!.props.pages as PageWindow).page + 1);
    },
    track,
    ids: rows.map((el) => ((el.props.meal ?? el.props.item) as { id: string }).id),
    tree,
  };
}

const meal = (i: number) => ({
  id: `meal-${i}`,
  foods: [],
  servedAt: "2026-09-20T12:00:00.000Z",
  notes: null,
  reactionNote: null,
});
const item = (i: number) => ({ id: `item-${i}`, foods: [] });
const foodLog = () =>
  view(
    () =>
      (ServeLogList as unknown as (p: unknown) => unknown)({
        babyId: "b",
        limit: 3,
        seeAllHref: "/meals",
        grouped: true,
      }),
    MealCard,
  );
const storage = () =>
  view(
    () => (StorageSection as unknown as (p: unknown) => unknown)({ babyId: "b" }),
    StorageItemRow,
  );

beforeEach(() => {
  h.store.states = [];
  h.store.refs = [];
  h.order = [];
  h.meals = Array.from({ length: 8 }, (_, i) => meal(i));
  h.storage = Array.from({ length: 8 }, (_, i) => item(i));
  // Chromium unless a test says otherwise: it knows no iOS-only CSS (item 797).
  vi.stubGlobal("CSS", { supports: () => false });
});

describe("Food log paging", () => {
  it("› shows the next three", () => {
    expect(foodLog().ids).toEqual(["meal-0", "meal-1", "meal-2"]);
    foodLog().next();
    const v = foodLog();
    expect(v.ids).toEqual(["meal-3", "meal-4", "meal-5"]);
    expect(v.pages).toMatchObject({ page: 1, start: 3, end: 6, total: 8 });
  });

  it("deleting the last page's only meal lands on the new last page, not an empty one", () => {
    h.meals = h.meals.slice(0, 7);
    foodLog().next();
    foodLog().next();
    expect(foodLog().ids).toEqual(["meal-6"]);
    h.meals = h.meals.slice(0, 6);
    const v = foodLog();
    expect(v.ids).toEqual(["meal-3", "meal-4", "meal-5"]);
    expect(v.pages?.page).toBe(1);
    // › from the clamped page steps from what's shown, not the stale state.
    v.next();
    expect(foodLog().ids).toEqual(["meal-3", "meal-4", "meal-5"]);
  });

  it("drops the pager once three or fewer are left; See all stays", () => {
    h.meals = h.meals.slice(0, 3);
    const v = foodLog();
    expect(v.pages?.last).toBe(0);
    expect(Pager(find(v.tree, Pager)!.props as unknown as Parameters<typeof Pager>[0])).toBeNull();
    expect(JSON.stringify(v.tree, (k, val) => (k === "_owner" ? undefined : val))).toContain(
      '"to":"/meals"',
    );
  });

  it("says 100+ when the fetch came back full", () => {
    h.meals = Array.from({ length: 100 }, (_, i) => meal(i));
    h.store.i = h.store.r = 0;
    const pager = find(
      (ServeLogList as unknown as (p: unknown) => unknown)({
        babyId: "b",
        limit: 3,
        seeAllHref: "/meals",
        grouped: true,
      }),
      Pager,
    );
    expect(pager!.props.capped).toBe(true);
    h.meals = h.meals.slice(0, 99);
    h.store.i = h.store.r = 0;
    expect(
      find(
        (ServeLogList as unknown as (p: unknown) => unknown)({
          babyId: "b",
          limit: 3,
          grouped: true,
        }),
        Pager,
      )!.props.capped,
    ).toBe(false);
  });
});

describe("Storage paging", () => {
  it("› shows the next three, and using items up clamps to the new last page", () => {
    storage().next();
    storage().next();
    expect(storage().ids).toEqual(["item-6", "item-7"]);
    h.storage = h.storage.slice(0, 5);
    const v = storage();
    expect(v.ids).toEqual(["item-3", "item-4"]);
    expect(v.pages).toMatchObject({ page: 1, last: 1 });
  });

  it("has no pager at three items", () => {
    h.storage = h.storage.slice(0, 3);
    const v = storage();
    expect(v.ids).toHaveLength(3);
    expect(v.pages?.last).toBe(0);
    expect(Pager(find(v.tree, Pager)!.props as unknown as Parameters<typeof Pager>[0])).toBeNull();
  });
});

describe("Up next paging (item 712)", () => {
  const HOUR = 60 * 60 * 1000;
  const useSoon = (i: number) => ({
    id: `soon-${i}`,
    foods: [{ id: `f${i}`, slug: "pear", name: `Pear ${i}`, emoji: null }],
    recipeId: null,
    recipeTitle: null,
    label: null,
    bestBy: null,
    useSoon: true,
    expired: false,
    expiresAt: new Date(Date.now() + 20 * HOUR).toISOString(),
    servingsLeft: null,
  });
  const due = (slug: string) => ({
    allergenSlug: slug,
    allergenName: slug,
    dueAt: new Date(Date.now() - 48 * HOUR).toISOString(),
    reactionNotedAt: null,
    overridden: false,
    establishedAt: null,
    lastServedAt: null,
    lastExposureAt: null,
  });
  const upNext = () => {
    h.store.i = h.store.r = 0;
    const tree = (UpNextCard as unknown as (p: unknown) => unknown)({ babyId: "b" });
    const pager = find(tree, Pager);
    const rows = (shownSlide(tree)?.props.children ?? []) as (El & { key: string })[];
    const track = find(tree, PageTrack)?.props.track as PagedTrack | undefined;
    const seeAll = find(tree, SectionLink);
    return {
      pages: pager?.props.pages as PageWindow | undefined,
      track,
      label: pager?.props.label,
      next: () => {
        scroller(track!);
        (pager!.props.onPage as (p: number) => void)((pager!.props.pages as PageWindow).page + 1);
      },
      keys: rows.map((row) => row.key),
      actions: rows.map((row) => row.props.actions as El),
      seeAll: seeAll?.props.to,
      tree,
    };
  };

  beforeEach(() => {
    h.storage = [useSoon(0), useSoon(1), useSoon(2), useSoon(3)];
    h.allergens = [due("peanut"), due("egg"), due("milk")];
  });

  it("pages three at a time, as Storage and Food log do", () => {
    expect(UP_NEXT_LIMIT).toBe(3);
    const first = upNext();
    expect(first.label).toBe("Up next items");
    expect(first.keys).toEqual(["storage-soon-0", "storage-soon-1", "storage-soon-2"]);
    expect(first.pages).toMatchObject({ page: 0, last: 2, total: 7 });
    first.next();
    expect(upNext().keys).toEqual(["storage-soon-3", "allergen-peanut", "allergen-egg"]);
    upNext().next();
    const last = upNext();
    expect(last.keys).toEqual(["allergen-milk"]);
    expect(last.pages).toMatchObject({ page: 2, start: 6, end: 7 });
  });

  it("swipes too (item 775): the scroll position sets the page", () => {
    const el = scroller(upNext().track!);
    el.scrollLeft = 2 * TRACK_WIDTH;
    upNext().track!.onScroll({ currentTarget: el } as never);
    expect(upNext().keys).toEqual(["allergen-milk"]);
  });

  it("has no See all on any page, whatever spills: the rows mix storage and allergens (item 722)", () => {
    expect(upNext().pages).toBeDefined();
    expect(upNext().seeAll).toBeUndefined();
    upNext().next();
    upNext().next();
    expect(upNext().seeAll).toBeUndefined();
    h.storage = [useSoon(0)];
    expect(upNext().pages).toBeDefined();
    expect(upNext().seeAll).toBeUndefined();
  });

  it("clamps to the new last page when rows go away (an allergen served, an item used up)", () => {
    upNext().next();
    upNext().next();
    expect(upNext().keys).toEqual(["allergen-milk"]);
    h.allergens = [due("peanut"), due("egg")];
    const v = upNext();
    expect(v.keys).toEqual(["storage-soon-3", "allergen-peanut", "allergen-egg"]);
    expect(v.pages?.page).toBe(1);
  });

  it("drops the pager once three or fewer are due", () => {
    h.storage = [useSoon(0)];
    h.allergens = [due("peanut"), due("egg")];
    const v = upNext();
    expect(v.keys).toHaveLength(3);
    expect(v.pages).toBeUndefined();
    expect(v.seeAll).toBeUndefined();
  });

  it("keeps each paged row's own kebab, for that row's item", () => {
    upNext().next();
    const [storageMenu, peanutMenu] = upNext().actions;
    expect(storageMenu!.type).toBe(StorageItemActionsMenu);
    expect((storageMenu!.props.item as { id: string }).id).toBe("soon-3");
    expect(peanutMenu!.type).toBe(AllergenUpNextMenu);
    expect((peanutMenu!.props.item as { allergenSlug: string }).allergenSlug).toBe("peanut");
  });
});

describe("Swipe paging (item 775)", () => {
  const swipeTo = (track: PagedTrack, scrollLeft: number) => {
    const el = scroller(track);
    el.scrollLeft = scrollLeft;
    track.onScroll({ currentTarget: el } as never);
  };

  it.each([
    ["Storage", () => storage()],
    ["Food log", () => foodLog()],
  ])("%s: a swipe alone turns the page, and the range follows", (_name, render) => {
    swipeTo(render().track!, 2 * TRACK_WIDTH);
    const v = render();
    expect(v.pages).toMatchObject({ page: 2, start: 6, end: 8 });
    expect(v.ids).toHaveLength(2);
    // A swipe let go short of halfway snaps back, and the page reads back with it.
    swipeTo(v.track!, TRACK_WIDTH + TRACK_WIDTH * 0.4);
    expect(render().pages?.page).toBe(1);
    // iOS rubber-banding past either end is not a page.
    swipeTo(v.track!, -40);
    expect(render().pages?.page).toBe(0);
    swipeTo(v.track!, 9 * TRACK_WIDTH);
    expect(render().pages?.page).toBe(2);
  });

  it("a slide is exactly the track's width, so deep pages read back right", () => {
    h.meals = Array.from({ length: 100 }, (_, i) => meal(i));
    swipeTo(foodLog().track!, 30 * TRACK_WIDTH);
    expect(foodLog().ids).toEqual(["meal-90", "meal-91", "meal-92"]);
  });

  it("one slide per page, all rendered; only the shown one is reachable (inert)", () => {
    storage().next();
    const track = find(storage().tree, PageTrack)!;
    const slides = (PageTrack(track.props as unknown as Parameters<typeof PageTrack>[0]) as unknown as El).props
      .children as El[];
    expect(slides).toHaveLength(3);
    expect(slides.map((slide) => "inert" in slide.props)).toEqual([true, false, true]);
    expect(slides.map((slide) => ((slide.props.children as El).props.children as unknown[]).length)).toEqual([
      3, 3, 2,
    ]);
  });

  it("‹ › scroll the track (smoothly) and never set the page behind its back", () => {
    const v = storage();
    v.next();
    const el = v.track!.trackRef.current as unknown as { calls: ScrollToOptions[] };
    expect(el.calls).toEqual([{ left: TRACK_WIDTH, behavior: "smooth" }]);
    expect(storage().pages?.page).toBe(1);
    // Off the end: clamped to the last slide, not a slide that isn't there.
    storage().track!.goTo(7);
    expect(el.calls.at(-1)).toEqual({ left: 2 * TRACK_WIDTH, behavior: "smooth" });
  });

  it("jumps instead of animating under prefers-reduced-motion", () => {
    vi.stubGlobal("window", { matchMedia: (q: string) => ({ matches: q === "(prefers-reduced-motion: reduce)" }) });
    try {
      const v = storage();
      v.next();
      const el = v.track!.trackRef.current as unknown as { calls: ScrollToOptions[] };
      expect(el.calls).toEqual([{ left: TRACK_WIDTH, behavior: "auto" }]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("an arrow before the track has a width does nothing (first paint, hidden)", () => {
    const v = storage();
    v.track!.trackRef.current = { clientWidth: 0, scrollTo: () => expect.unreachable() } as never;
    v.track!.goTo(1);
    expect(storage().pages?.page).toBe(0);
  });

  it("Chromium: a touch freezes the snap window on the page it starts on; ‹ › reopen every page first (item 778)", () => {
    h.storage = Array.from({ length: 13 }, (_, i) => item(i));
    expect(storage().track!.near).toBeNull();
    swipeTo(storage().track!, 2 * TRACK_WIDTH);
    // A finger lands on the rendered track (the scroller itself).
    const tree = storage().tree;
    const trackEl = PageTrack(find(tree, PageTrack)!.props as unknown as Parameters<typeof PageTrack>[0]) as unknown as El;
    (trackEl.props.onTouchStart as () => void)();
    expect(storage().track!.near).toBe(2);
    // The window stays put while the flick scrolls on: it does not follow the page.
    swipeTo(storage().track!, 3 * TRACK_WIDTH);
    expect(storage().pages?.page).toBe(3);
    expect(storage().track!.near).toBe(2);
    const slides = (PageTrack(find(storage().tree, PageTrack)!.props as unknown as Parameters<typeof PageTrack>[0]) as unknown as El)
      .props.children as El[];
    expect(slides.map((slide) => (slide.props.className as string).includes("snap-start"))).toEqual([
      false, true, true, true, false,
    ]);
    // ›: the reset is committed (flushSync) before the scroll, or the browser
    // would snap a target outside the window back into it.
    storage().next();
    expect(h.order).toEqual(["flush", "scrollTo"]);
    expect(storage().track!.near).toBeNull();
    expect(storage().pages?.page).toBe(4);
  });

  it("Chromium: each new touch re-anchors the window; a wheel reopens every page (item 779)", () => {
    h.storage = Array.from({ length: 13 }, (_, i) => item(i));
    const trackEl = () =>
      PageTrack(find(storage().tree, PageTrack)!.props as unknown as Parameters<typeof PageTrack>[0]) as unknown as El;
    swipeTo(storage().track!, 1 * TRACK_WIDTH);
    (trackEl().props.onTouchStart as () => void)();
    expect(storage().track!.near).toBe(1);
    // The flick lands one page on; the next touch follows it, so a walk goes on.
    swipeTo(storage().track!, 2 * TRACK_WIDTH);
    (trackEl().props.onTouchStart as () => void)();
    expect(storage().track!.near).toBe(2);
    (trackEl().props.onWheel as () => void)();
    expect(storage().track!.near).toBeNull();
  });

  it("on iOS a touch never moves the snap points, wherever it lands (item 797)", () => {
    // Every iOS browser is WebKit, and only it answers this query.
    vi.stubGlobal("CSS", {
      supports: (property: string, value?: string) => property === "-webkit-touch-callout" && value === "none",
    });
    h.storage = Array.from({ length: 13 }, (_, i) => item(i));
    const trackEl = () =>
      PageTrack(find(storage().tree, PageTrack)!.props as unknown as Parameters<typeof PageTrack>[0]) as unknown as El;
    for (const page of [1, 2, 3, 2, 0]) {
      swipeTo(storage().track!, page * TRACK_WIDTH);
      (trackEl().props.onTouchStart as () => void)();
      expect(storage().track!.near).toBeNull();
      const slides = trackEl().props.children as El[];
      expect(slides.map((slide) => slide.props.className)).toEqual(
        Array(5).fill("w-full shrink-0 snap-start snap-always px-2 pb-2"),
      );
    }
  });

  it("the range, not the rows, is the live region", () => {
    const v = storage();
    expect(JSON.stringify(shownSlide(v.tree), (k, val) => (k === "_owner" ? undefined : val))).not.toContain(
      "aria-live",
    );
  });
});

// Item 712 B1: UpNextCard and ServeLogList once shared key={activeBaby.id} in
// the same <div>, so each baby switch left a dead Up next card behind. This
// walks Home's real element tree, so it fails on any sibling key collision.
describe("Home's per-baby lists reset on a baby switch", () => {
  function homeTree(babyId: string) {
    h.activeBaby = { id: babyId, name: "Testbaby" };
    return DashboardPage() as unknown as El;
  }
  function siblingKeyClashes(node: unknown, out: string[] = []): string[] {
    if (Array.isArray(node)) {
      const keys = node
        .filter(
          (c): c is { key: string } =>
            !!c && typeof c === "object" && (c as { key?: unknown }).key != null,
        )
        .map((c) => c.key);
      out.push(...keys.filter((k, i) => keys.indexOf(k) !== i));
      for (const child of node) siblingKeyClashes(child, out);
    } else if (node && typeof node === "object" && "props" in node) {
      siblingKeyClashes((node as El).props.children, out);
    }
    return out;
  }
  const keyOf = (tree: El, type: unknown) =>
    ((tree.props.children as unknown[]).flat() as { type: unknown; key: string | null }[]).find(
      (c) => c?.type === type,
    )?.key;

  it("gives no two siblings the same key", () => {
    expect(siblingKeyClashes(homeTree("baby-a"))).toEqual([]);
  });

  it("keys Up next and Food log by the active baby, so switching starts both at page one", () => {
    const a = homeTree("baby-a");
    const b = homeTree("baby-b");
    for (const type of [UpNextCard, ServeLogList]) {
      expect(keyOf(a, type)).toContain("baby-a");
      expect(keyOf(b, type)).toContain("baby-b");
    }
  });
});
