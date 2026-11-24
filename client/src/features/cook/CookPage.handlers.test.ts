// Ledger 1095/1096: cook mode's wiring, driven without a DOM (the Menu /
// Sheet handlers idiom). React's hooks are a slot store, the router and data
// hooks are stubs, and CookPage is called as a plain function: its element
// tree is read by hand and its handlers and effects are run directly.
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecipeDetail } from "@blw/shared";

const h = vi.hoisted(() => {
  const store = { refs: [] as { current: unknown }[], r: 0, state: [] as unknown[], s: 0 };
  const effects: Array<() => void | (() => void)> = [];
  const deps: Array<unknown[] | undefined> = [];
  return {
    store,
    effects,
    deps,
    search: "",
    recipe: undefined as unknown,
    setSearchParams: vi.fn(),
    leave: vi.fn(),
    release: vi.fn(),
    keepScreenAwake: vi.fn(),
    ignoreTapsBriefly: vi.fn(),
    setStatusBarSurface: vi.fn(),
    useRef: (init: unknown) => {
      const i = store.r++;
      if (!(i in store.refs)) store.refs[i] = { current: init };
      return store.refs[i];
    },
    useState: (init: unknown) => {
      const i = store.s++;
      if (!(i in store.state)) store.state[i] = init;
      // A functional update (setCue's keep-prev) runs against the slot.
      const set = (next: unknown) =>
        (store.state[i] = typeof next === "function" ? (next as (prev: unknown) => unknown)(store.state[i]) : next);
      return [store.state[i], set];
    },
    useEffect: (effect: () => void | (() => void), list?: unknown[]) => {
      effects.push(effect);
      deps.push(list);
    },
  };
});

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRef: h.useRef,
  useState: h.useState,
  useEffect: h.useEffect,
}));
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useParams: () => ({ id: "r1" }),
  useSearchParams: () => [new URLSearchParams(h.search), h.setSearchParams],
}));
vi.mock("../catalog/hooks.js", () => ({
  useRecipe: () => ({ data: h.recipe, isPending: false, isFetching: false }),
}));
vi.mock("../babies/useActiveBaby.js", () => ({ useActiveBaby: () => ({ activeBaby: null, isLoading: false }) }));
vi.mock("../../components/ui/BackButton.js", () => ({ useBackNavigate: () => h.leave }));
vi.mock("../../pwa/wakeLock.js", () => ({ keepScreenAwake: h.keepScreenAwake }));
vi.mock("../../lib/tapGuard.js", () => ({ ignoreTapsBriefly: h.ignoreTapsBriefly }));
vi.mock("../../theme.js", () => ({ setStatusBarSurface: h.setStatusBarSurface }));

import { Navigate } from "react-router-dom";
import { Button } from "../../components/ui/Button.js";
import { Sheet } from "../../components/ui/Sheet.js";
import { IngredientList } from "../../pages/RecipeDetailPage.js";
import { CookPage } from "./CookPage.js";

const RECIPE = {
  id: "r1",
  title: "Salmon mash",
  isCustom: false,
  deletedAt: null,
  ingredients: [{ foodId: "f1", foodSlug: "salmon", foodName: "Salmon", isCustom: false, foodEmoji: null, quantityNote: "1 fillet", allergens: [] }],
  extraIngredients: [],
  variants: [
    { ageStage: "6", textureNote: "", steps: ["Steam"] },
    { ageStage: "9", textureNote: "", steps: ["Steam", "Mash", "Serve"] },
  ],
} as unknown as RecipeDetail;

type El = ReactElement<{ children?: ReactNode; onClick?: () => void } & Record<string, unknown>>;

function all(node: ReactNode, out: El[] = []): El[] {
  if (Array.isArray(node)) node.forEach((n) => all(n as ReactNode, out));
  else if (isValidElement(node)) {
    out.push(node as El);
    all((node as El).props.children, out);
  }
  return out;
}

function render(search: string) {
  h.search = search;
  h.store.r = 0;
  h.store.s = 0;
  h.effects.length = 0;
  h.deps.length = 0;
  const tree = (CookPage as unknown as () => El)();
  const column = tree.props.children as El;
  const button = (label: string) => all(tree).find((el) => el.type === Button && el.props.children === label);
  const sheet = () => all(tree).find((el) => el.type === Sheet);
  return { tree, column, button, sheet };
}

/** The `?step=` the last setSearchParams call would leave, and its options. */
function lastMove() {
  const [update, options] = h.setSearchParams.mock.calls.at(-1)!;
  const params = (update as (prev: URLSearchParams) => URLSearchParams)(new URLSearchParams(h.search));
  return { step: params.get("step"), stage: params.get("stage"), options };
}

let listeners: Map<string, (event: unknown) => void>;

beforeEach(() => {
  h.recipe = RECIPE;
  h.store.refs = [];
  h.store.state = [];
  h.keepScreenAwake.mockReturnValue(h.release);
  listeners = new Map();
  vi.stubGlobal("document", {
    addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("CookPage: the screen stays awake (ledger 1096)", () => {
  it("asks once on open and hands the release back as the effect's cleanup", () => {
    render("?stage=9");
    const cleanups = h.effects.map((effect) => effect());
    expect(h.keepScreenAwake).toHaveBeenCalledTimes(1);
    expect(cleanups).toContain(h.release);
  });

  it("puts the glow ground's top colour under the status bar (ledger 1090: outside AppLayout)", () => {
    render("?stage=9");
    h.effects.forEach((effect) => effect());
    expect(h.setStatusBarSurface).toHaveBeenCalledTimes(1);
    expect(h.setStatusBarSurface).toHaveBeenCalledWith("top");
  });
});

describe("CookPage: moving between screens (ledger 1095)", () => {
  it("Start opens step 1 by REPLACING the URL's step, so phone Back leaves cook mode", () => {
    render("?stage=9").button("Start")!.props.onClick!();
    expect(lastMove()).toEqual({ step: "1", stage: "9", options: { replace: true } });
    expect(h.ignoreTapsBriefly).toHaveBeenCalled();
  });

  it("Next and Back move one step; the last Next opens All done", () => {
    const { button } = render("?stage=9&step=2");
    button("Next")!.props.onClick!();
    expect(lastMove().step).toBe("3");
    button("Back")!.props.onClick!();
    expect(lastMove().step).toBe("1");
    render("?stage=9&step=3").button("Next")!.props.onClick!();
    expect(lastMove().step).toBe("4");
  });

  it("plays exactly the stage's steps: Step 2 of 3 at 9 months", () => {
    const els = all(render("?stage=9&step=2").tree);
    const text = (tag: string) => [els.find((el) => el.type === tag)!.props.children].flat().join("");
    expect(text("h2")).toBe("Step 2 of 3");
    expect(text("p")).toBe("Mash");
  });

  it("All done offers Back and Back to recipe, which leaves through history", () => {
    const { button } = render("?stage=9&step=4");
    expect(button("Next")).toBeUndefined();
    button("Back to recipe")!.props.onClick!();
    expect(h.leave).toHaveBeenCalledTimes(1);
    expect(h.setSearchParams).not.toHaveBeenCalled();
  });

  it("→ and ← move a screen; never with a modifier, never past either end", () => {
    render("?stage=9&step=1");
    h.effects.forEach((effect) => effect());
    const key = (k: string, extra = {}) => {
      const event = { key: k, preventDefault: vi.fn(), ...extra };
      listeners.get("keydown")!(event);
      return event.preventDefault;
    };
    expect(key("ArrowRight")).toHaveBeenCalled();
    expect(lastMove().step).toBe("2");
    expect(key("ArrowLeft")).toHaveBeenCalled();
    expect(lastMove().step).toBe("0");
    h.setSearchParams.mockClear();
    expect(key("ArrowRight", { metaKey: true })).not.toHaveBeenCalled();
    expect(key("Enter")).not.toHaveBeenCalled();
    expect(h.setSearchParams).not.toHaveBeenCalled();

    render("?stage=9&step=0");
    h.effects.forEach((effect) => effect());
    key("ArrowLeft");
    expect(h.setSearchParams).not.toHaveBeenCalled();
  });

  it("a sideways swipe moves a screen; a short, vertical or mouse drag does not", () => {
    const { column } = render("?stage=9&step=1");
    const drag = (dx: number, dy: number, pointerType = "touch") => {
      const props = column.props as Record<string, (event: unknown) => void>;
      const inside = { currentTarget: { contains: () => true }, target: {} };
      props.onPointerDown!({ ...inside, pointerType, pointerId: 1, clientX: 200, clientY: 300 });
      props.onPointerUp!({ ...inside, pointerId: 1, clientX: 200 + dx, clientY: 300 + dy });
    };
    drag(-80, 10);
    expect(lastMove().step).toBe("2");
    drag(80, -10);
    expect(lastMove().step).toBe("0");
    h.setSearchParams.mockClear();
    drag(-30, 0);
    drag(-60, 200);
    drag(-120, 0, "mouse");
    expect(h.setSearchParams).not.toHaveBeenCalled();
  });
});

describe("CookPage: leaving for the recipe and the log (ledger 1141a pins)", () => {
  it("a typed cook link to a stage with no steps goes to the recipe, replacing the cook URL", () => {
    h.recipe = { ...RECIPE, variants: [{ ageStage: "6", textureNote: "", steps: [] }] };
    const { tree } = render("?stage=6");
    expect(tree.type).toBe(Navigate);
    expect(tree.props).toMatchObject({ to: "/recipes/r1", replace: true });
  });

  it("All done's Log meal replaces cook mode in history, so its own Back is the recipe", () => {
    const { tree } = render("?stage=6&step=2");
    const log = all(tree).filter((el) => el.props.to === "/log-meal?recipe=r1");
    expect(log).toHaveLength(1);
    expect(log[0]!.props.replace).toBe(true);
  });
});

describe("CookPage: the Ingredients sheet (ledger 1147)", () => {
  it("opens from the top bar over a step: titled You'll need, the same unlinked list, an X", () => {
    expect(render("?stage=9&step=2").sheet()!.props.open).toBe(false);
    render("?stage=9&step=2").button("Ingredients")!.props.onClick!();
    const sheet = render("?stage=9&step=2").sheet()!;
    expect(sheet.props).toMatchObject({ open: true, title: "You'll need", showClose: true });
    const list = sheet.props.children as El;
    expect(list.type).toBe(IngredientList);
    expect(list.props).toMatchObject({ recipe: RECIPE, linked: false });
    (sheet.props.onClose as () => void)();
    expect(render("?stage=9&step=2").sheet()!.props.open).toBe(false);
    expect(h.setSearchParams).not.toHaveBeenCalled();
  });

  it("a swipe that bubbles up from the sheet or its backdrop (a portal) never moves the step", () => {
    const { column } = render("?stage=9&step=2");
    const props = column.props as Record<string, (event: unknown) => void>;
    // contains() answers for its ARGUMENT, so the handler must ask about event.target.
    const inside = {};
    const outside = {};
    const dom = { contains: (n: unknown) => n === inside };
    const fromSheet = { currentTarget: dom, target: outside };
    props.onPointerDown!({ ...fromSheet, pointerType: "touch", pointerId: 1, clientX: 200, clientY: 300 });
    props.onPointerUp!({ ...fromSheet, pointerId: 1, clientX: 80, clientY: 300 });
    // Started in the column, lifted in the sheet: still no move.
    const inColumn = { currentTarget: dom, target: inside };
    props.onPointerDown!({ ...inColumn, pointerType: "touch", pointerId: 2, clientX: 200, clientY: 300 });
    props.onPointerUp!({ ...fromSheet, pointerId: 2, clientX: 80, clientY: 300 });
    expect(h.setSearchParams).not.toHaveBeenCalled();
    // The column's own swipe still works.
    props.onPointerDown!({ ...inColumn, pointerType: "touch", pointerId: 3, clientX: 200, clientY: 300 });
    props.onPointerUp!({ ...inColumn, pointerId: 3, clientX: 80, clientY: 300 });
    expect(lastMove().step).toBe("3");
  });

  it("a drag that starts in the sheet and lifts in the column never moves the step (ledger 1150b)", () => {
    const { column } = render("?stage=9&step=2");
    const props = column.props as Record<string, (event: unknown) => void>;
    // contains() answers for its ARGUMENT, so the handler must ask about event.target.
    const inside = {};
    const outside = {};
    const dom = { contains: (n: unknown) => n === inside };
    const fromSheet = { currentTarget: dom, target: outside };
    const inColumn = { currentTarget: dom, target: inside };
    props.onPointerDown!({ ...fromSheet, pointerType: "touch", pointerId: 1, clientX: 200, clientY: 300 });
    props.onPointerUp!({ ...inColumn, pointerId: 1, clientX: 80, clientY: 300 });
    expect(h.setSearchParams).not.toHaveBeenCalled();
  });

  it("→ and ← leave the step alone while the sheet is open", () => {
    render("?stage=9&step=2").button("Ingredients")!.props.onClick!();
    render("?stage=9&step=2");
    h.effects.forEach((effect) => effect());
    listeners.get("keydown")!({ key: "ArrowRight", preventDefault: vi.fn() });
    expect(h.setSearchParams).not.toHaveBeenCalled();
  });
});

describe("CookPage: the long step's scroll cue (ledger 1153b/c)", () => {
  // Slots in hook order: refs swipe, scroller; state direction, ingredientsOpen, cue.
  const SCROLLER = 1;
  const CUE = 2;

  function fakeScroller(scrollTop = 0) {
    const on = new Map<string, () => void>();
    const el = {
      scrollTop,
      scrollHeight: 547,
      clientHeight: 433,
      firstElementChild: {},
      addEventListener: (type: string, fn: () => void) => on.set(type, fn),
      removeEventListener: (type: string) => on.delete(type),
    };
    return { el, on };
  }

  beforeEach(() => {
    vi.stubGlobal("getComputedStyle", () => ({ paddingBottom: "24px" }));
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  /** Runs each effect; returns the one that listens to the scroller, with its deps and cleanup. */
  function measuring(el: object) {
    h.store.refs[SCROLLER]!.current = el;
    const runs = h.effects.map((effect, i) => ({ cleanup: effect(), deps: h.deps[i] }));
    return runs;
  }

  it("measures the step's scroller on mount, follows its scroll, and lets go on cleanup", () => {
    render("?stage=9&step=2");
    const { el, on } = fakeScroller();
    const runs = measuring(el);
    expect(h.store.state[CUE]).toEqual({ top: 0, size: 433 / 547 });
    el.scrollTop = 114;
    on.get("scroll")!();
    expect((h.store.state[CUE] as { top: number }).top).toBeCloseTo(1 - 433 / 547, 12);
    runs.forEach((run) => typeof run.cleanup === "function" && run.cleanup());
    expect(on.has("scroll")).toBe(false);
  });

  it("has a deps list with the step index (no run-every-render loop; the scroller is keyed by step)", () => {
    render("?stage=9&step=2");
    const { el, on } = fakeScroller();
    const before = [...h.effects];
    const deps = [...h.deps];
    h.store.refs[SCROLLER]!.current = el;
    const i = before.findIndex((effect) => {
      on.clear();
      const cleanup = effect();
      const listens = on.has("scroll");
      if (typeof cleanup === "function") cleanup();
      return listens;
    });
    expect(i).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(deps[i])).toBe(true);
    expect(deps[i]).toContain(2);
    expect(deps[i]).toContain(RECIPE);
  });

  it("keeps the same cue state for the same numbers (a measure never re-renders)", () => {
    render("?stage=9&step=2");
    const { el, on } = fakeScroller(57);
    measuring(el);
    const first = h.store.state[CUE];
    on.get("scroll")!();
    expect(h.store.state[CUE]).toBe(first);
  });

  it("draws the cue aria-hidden and untouchable, the thumb at its fractions; none without a cue", () => {
    h.store.state[CUE] = { top: 0.25, size: 0.5 };
    const cue = all(render("?stage=9&step=2").tree).find((el) => "data-cook-cue" in el.props)!;
    expect(cue.props["aria-hidden"]).toBe("true");
    expect(String(cue.props.className).split(" ")).toEqual(expect.arrayContaining(["cook-cue", "pointer-events-none", "absolute"]));
    const thumb = cue.props.children as El;
    expect(thumb.props.style).toEqual({ top: "25%", height: "50%" });
    h.store.state[CUE] = null;
    expect(all(render("?stage=9&step=2").tree).some((el) => "data-cook-cue" in el.props)).toBe(false);
  });
});
