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
  return {
    store,
    effects,
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
      return [store.state[i], (next: unknown) => (store.state[i] = next)];
    },
    useEffect: (effect: () => void | (() => void)) => {
      effects.push(effect);
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
import { CookPage } from "./CookPage.js";

const RECIPE = {
  id: "r1",
  title: "Salmon mash",
  isCustom: false,
  deletedAt: null,
  ingredients: [],
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
  const tree = (CookPage as unknown as () => El)();
  const column = tree.props.children as El;
  const button = (label: string) => all(tree).find((el) => el.type === Button && el.props.children === label);
  return { tree, column, button };
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
      props.onPointerDown!({ pointerType, pointerId: 1, clientX: 200, clientY: 300 });
      props.onPointerUp!({ pointerId: 1, clientX: 200 + dx, clientY: 300 + dy });
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
