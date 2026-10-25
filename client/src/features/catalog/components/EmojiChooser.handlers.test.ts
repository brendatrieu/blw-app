// Ledgers 862, 872, 879, 888, 893: the emoji box is a plain text field and a
// button beside it opens the grid; type / toggle / pick / Escape / blur behaviour lives in state and handlers a server
// render never reaches.
// Harness idiom from CustomFoodForm.handlers.test.ts: `useState` is a hoisted
// store, so the component is called as a plain function and its element tree
// read.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0, effects: [] as (() => void | (() => void))[] };
  return {
    store,
    // Collected per render; a test runs them, as a commit would.
    useEffect: (effect: () => void | (() => void)) => {
      store.effects.push(effect);
    },
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = init;
      const set = (value: unknown) => {
        store.states[i] = typeof value === "function" ? (value as (previous: unknown) => unknown)(store.states[i]) : value;
      };
      return [store.states[i], set];
    },
    useRef: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = { current: init };
      return store.states[i];
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState, useRef: h.useRef, useEffect: h.useEffect };
});

import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { EmojiChooser } from "./EmojiChooser.js";
import { Input } from "../../../components/ui/Input.js";
import { DEFAULT_FOOD_EMOJI, EMOJI_CHOICE_GROUPS } from "../foodEmoji.js";

interface Rendered {
  type: unknown;
  props: Record<string, unknown>;
}

function all(node: unknown, match: (el: Rendered) => boolean, out: Rendered[] = []): Rendered[] {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) all(child, match, out);
    return out;
  }
  const el = node as Rendered;
  if (match(el)) out.push(el);
  all(el.props?.children, match, out);
  return out;
}

function text(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  if (node && typeof node === "object") return text((node as Rendered).props?.children);
  return "";
}

const globals = globalThis as unknown as { document?: unknown };
let focused: string[] = [];
let listeners: Map<string, (event: unknown) => void>;
let value = "";

function render() {
  h.store.i = 0;
  h.store.effects = [];
  return EmojiChooser({ id: "e", value, onChange: (emoji) => (value = emoji) }) as unknown;
}
const box = (tree: unknown) => all(tree, (el) => el.props?.id === "e")[0]!;
const toggleButton = (tree: unknown) => all(tree, (el) => el.props?.id === "e-button")[0]!;
const grid = (tree: unknown) => all(tree, (el) => el.props?.role === "group")[0];
const picks = (tree: unknown) =>
  all(tree, (el) => el.type === "button" && String(el.props["aria-label"]).startsWith("Pick "));
/** A tap or click on the toggle; records the focus it gives itself. */
const pressToggle = () =>
  (toggleButton(render()).props.onClick as (event: unknown) => void)({
    detail: 1,
    currentTarget: { focus: () => focused.push("e-button (self)") },
  });
const tapBox = () => (box(render()).props.onClick as () => void)();
const focusBox = () => (box(render()).props.onFocus as () => void)();
const pick = (tree: unknown, label: string) => picks(tree).find((el) => el.props["aria-label"] === label)!;
const tapPick = (label: string) => (pick(render(), label).props.onClick as () => void)();
const wrapper = (tree: unknown) => (tree as Rendered).props;
const openGrid = () => {
  pressToggle();
  focused = [];
};

beforeEach(() => {
  h.store.states = [];
  focused = [];
  value = "🥕";
  listeners = new Map();
  globals.document = {
    addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn),
    removeEventListener: (type: string, fn: (event: unknown) => void) => {
      if (listeners.get(type) === fn) listeners.delete(type);
    },
    getElementById: (id: string) => ({ focus: () => focused.push(id) }),
  };
});
afterEach(() => {
  delete globals.document;
});

describe("EmojiChooser (ledgers 879, 893)", () => {
  it("starts closed: a plain text field holding the value, and a collapsed 😀 toggle controlling the grid", () => {
    const tree = render();
    expect(box(tree).type).toBe(Input);
    expect(box(tree).props.type).toBe("text");
    expect(box(tree).props.value).toBe("🥕");
    // The field no longer claims the grid.
    expect(box(tree).props["aria-expanded"]).toBeUndefined();
    expect(box(tree).props["aria-controls"]).toBeUndefined();
    const toggle = toggleButton(tree);
    expect(toggle.type).toBe("button");
    expect(toggle.props.type).toBe("button");
    expect(toggle.props["aria-label"]).toBe("Emoji choices");
    expect(toggle.props["aria-expanded"]).toBe(false);
    expect(toggle.props["aria-controls"]).toBe("e-choices");
    expect(text(toggle)).toBe("😀");
    expect(grid(tree)).toBeUndefined();
    expect(all(tree, (el) => el.type === "button")).toEqual([toggle]);
  });

  it("the toggle is a 44px+ target with a pressed style keyed to aria-expanded (existing selected tokens)", () => {
    const classes = String(toggleButton(render()).props.className).split(" ");
    expect(classes).toEqual(expect.arrayContaining(["min-h-11", "w-14"]));
    expect(classes).toEqual(
      expect.arrayContaining([
        "aria-expanded:bg-[var(--color-selected)]",
        "aria-expanded:border-[var(--color-selected)]",
      ]),
    );
    // Hover never hides the open state.
    expect(classes.filter((c) => c.startsWith("hover:"))).toEqual(["hover:not-aria-expanded:bg-[var(--color-bg-inset)]"]);
    openGrid();
    expect(toggleButton(render()).props["aria-expanded"]).toBe(true);
  });

  it("empty shows 🍽️ (U+1F37D U+FE0F) as its placeholder, and none of the old extras", () => {
    value = "";
    expect(DEFAULT_FOOD_EMOJI).toBe("\u{1F37D}\u{FE0F}");
    const tree = render();
    expect(box(tree).props.value).toBe("");
    expect(box(tree).props.placeholder).toBe("🍽️");
    openGrid();
    const open = render();
    for (const gone of ["No emoji chosen", "Or type one", "No emoji", "Use"]) {
      expect(text(open)).not.toContain(gone);
    }
    expect(all(open, (el) => el.type === Input)).toHaveLength(1);
  });

  it("typing goes straight to the value (the form validates it)", () => {
    (box(render()).props.onChange as (e: unknown) => void)({ target: { value: "🥯" } });
    expect(value).toBe("🥯");
    (box(render()).props.onChange as (e: unknown) => void)({ target: { value: "ab" } });
    expect(value).toBe("ab");
    (box(render()).props.onChange as (e: unknown) => void)({ target: { value: "" } });
    expect(value).toBe("");
  });

  it("tapping or focusing the field never opens the grid, empty or not", () => {
    for (const start of ["", "🥕", "ab"]) {
      value = start;
      h.store.states = [];
      tapBox();
      expect(grid(render())).toBeUndefined();
      focusBox();
      expect(grid(render())).toBeUndefined();
      expect(toggleButton(render()).props["aria-expanded"]).toBe(false);
    }
  });

  it("tapping or focusing the field while the grid is open closes it (typing, not picking)", () => {
    openGrid();
    tapBox();
    expect(grid(render())).toBeUndefined();
    openGrid();
    focusBox();
    expect(grid(render())).toBeUndefined();
    expect(focused).toEqual([]);
  });

  it("the toggle opens and closes the grid: every choice a labelled button, the current one pressed", () => {
    pressToggle();
    const tree = render();
    expect(toggleButton(tree).props["aria-expanded"]).toBe(true);
    expect(grid(tree)!.props.id).toBe("e-choices");
    const total = EMOJI_CHOICE_GROUPS.reduce((n, group) => n + group.choices.length, 0);
    expect(picks(tree)).toHaveLength(total);
    expect(picks(tree).every((el) => el.props.type === "button")).toBe(true);
    const pressed = picks(tree).filter((el) => el.props["aria-pressed"] === true);
    expect(pressed.map((el) => el.props["aria-label"])).toEqual(["Pick 🥕 carrot"]);
    // The press takes focus itself (iOS doesn't), so the box's keyboard goes down.
    expect(focused).toEqual(["e-button (self)"]);
    pressToggle();
    expect(grid(render())).toBeUndefined();
    expect(toggleButton(render()).props["aria-expanded"]).toBe(false);
    expect(value).toBe("🥕");
  });

  it("a pick sets the value, closes, and returns focus to the button", () => {
    openGrid();
    tapPick("Pick 🍐 pear");
    expect(value).toBe("🍐");
    expect(grid(render())).toBeUndefined();
    expect(focused).toEqual(["e-button"]);
  });

  it("Escape closes the open grid, claims the key (a surrounding Sheet stays open), and returns focus to the button", () => {
    const onKeyDown = (tree: unknown) =>
      wrapper(tree).onKeyDown as (event: { key: string; preventDefault: () => void }) => void;
    const closedEscape = vi.fn();
    onKeyDown(render())({ key: "Escape", preventDefault: closedEscape });
    // Closed: the key is the Sheet's.
    expect(closedEscape).not.toHaveBeenCalled();
    expect(focused).toEqual([]);

    openGrid();
    const ignored = vi.fn();
    onKeyDown(render())({ key: "a", preventDefault: ignored });
    onKeyDown(render())({ key: "Enter", preventDefault: ignored });
    expect(ignored).not.toHaveBeenCalled();
    expect(grid(render())).toBeDefined();
    const prevent = vi.fn();
    onKeyDown(render())({ key: "Escape", preventDefault: prevent });
    expect(prevent).toHaveBeenCalled();
    expect(grid(render())).toBeUndefined();
    expect(focused).toEqual(["e-button"]);
    expect(value).toBe("🥕");
  });

  it("focus moving to another control closes the grid; into the chooser, or nowhere (an iOS tap), keeps it", () => {
    const inside = { id: "inside" };
    const blur = (relatedTarget: unknown) =>
      (wrapper(render()).onBlur as (event: unknown) => void)({
        relatedTarget,
        currentTarget: { contains: (node: unknown) => node === inside },
      });
    openGrid();
    blur(inside);
    expect(grid(render())).toBeDefined();
    blur(null);
    expect(grid(render())).toBeDefined();
    blur({ id: "notes" });
    expect(grid(render())).toBeUndefined();
  });

  describe("closing from outside (ledger 888: phones have no Escape)", () => {
    const inside = { id: "inside" };
    // contains() is true for the node itself, as in the DOM.
    const rootNode = { contains: (node: unknown) => node === inside || node === rootNode };
    /** Render, attach the root ref to a node holding only `inside`, run the effects (a commit); returns their cleanups. */
    function commit() {
      const tree = render();
      (tree as { ref: { current: unknown } }).ref.current = rootNode;
      return h.store.effects.map((effect) => effect());
    }
    const pointerUp = (target: unknown) => listeners.get("pointerup")!({ target });

    it("a tap or click outside the field, button and grid closes it, empty or not; inside keeps it", () => {
      for (const start of ["", "🥕"]) {
        value = start;
        h.store.states = [];
        listeners.clear();
        commit();
        // Closed: nothing listens.
        expect(listeners.has("pointerup")).toBe(false);
        openGrid();
        commit();
        pointerUp(inside);
        expect(grid(render())).toBeDefined();
        pointerUp({ id: "heading" });
        expect(grid(render())).toBeUndefined();
        expect(value).toBe(start);
        expect(focused).toEqual([]);
      }
    });

    it("a tap on the wrapper itself (the form-wide strip beside the row, the gap above the grid) closes it", () => {
      openGrid();
      commit();
      pointerUp(rootNode);
      expect(grid(render())).toBeUndefined();
    });

    it("never claims the tap (a surrounding Sheet still gets it), and stops listening once closed", () => {
      openGrid();
      const cleanups = commit();
      const event = { target: { id: "sheet-title" }, preventDefault: vi.fn(), stopPropagation: vi.fn() };
      listeners.get("pointerup")!(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopPropagation).not.toHaveBeenCalled();
      for (const cleanup of cleanups) cleanup?.();
      expect(listeners.has("pointerup")).toBe(false);
    });

    it("focus leaving for something outside closes it; focus onto the grid itself (a tap on its gaps) keeps it", () => {
      openGrid();
      const tree = render();
      // The grid takes focus from a tap on a label or gap, instead of a Sheet panel outside the chooser.
      expect(grid(tree)!.props.tabIndex).toBe(-1);
      const theGrid = { id: "e-choices" };
      const blur = (relatedTarget: unknown) =>
        (wrapper(render()).onBlur as (event: unknown) => void)({
          relatedTarget,
          currentTarget: { contains: (node: unknown) => node === theGrid },
        });
      blur(theGrid);
      expect(grid(render())).toBeDefined();
      blur({ id: "sheet-panel" });
      expect(grid(render())).toBeUndefined();
    });
  });

  it("server-renders the field with its value and placeholder, and the collapsed toggle", () => {
    h.store.states = [];
    h.store.i = 0;
    const html = renderToString(createElement(EmojiChooser, { id: "e", value: "", onChange: () => {} }));
    expect(html).toMatch(/<input[^>]*id="e"[^>]*type="text"[^>]*placeholder="🍽️"[^>]*value=""/);
    expect(html).not.toMatch(/<input[^>]*aria-expanded/);
    expect(html).toMatch(
      /<button[^>]*id="e-button"[^>]*type="button"[^>]*aria-label="Emoji choices"[^>]*aria-expanded="false"[^>]*aria-controls="e-choices"/,
    );
    expect(html).not.toContain("No emoji chosen");
  });
});
