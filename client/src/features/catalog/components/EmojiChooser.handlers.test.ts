// Ledgers 862, 872, 879, 888: the emoji box is a text field that opens the grid;
// type / pick / Escape / blur behaviour lives in state and handlers a server
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
let boxFocus: (() => void) | undefined;

function render() {
  h.store.i = 0;
  h.store.effects = [];
  const tree = EmojiChooser({ id: "e", value, onChange: (emoji) => (value = emoji) }) as unknown;
  boxFocus = box(tree).props.onFocus as () => void;
  return tree;
}
const box = (tree: unknown) => all(tree, (el) => el.props?.id === "e")[0]!;
const grid = (tree: unknown) => all(tree, (el) => el.props?.role === "group")[0];
const picks = (tree: unknown) =>
  all(tree, (el) => el.type === "button" && String(el.props["aria-label"]).startsWith("Pick "));
const tap = (el: Rendered) => (el.props.onClick as (event: { detail: number }) => void)({ detail: 1 });
const keyPick = (el: Rendered) => (el.props.onClick as (event: { detail: number }) => void)({ detail: 0 });
const openGrid = () => tap(box(render()));
const pick = (tree: unknown, label: string) => picks(tree).find((el) => el.props["aria-label"] === label)!;
const wrapper = (tree: unknown) => (tree as Rendered).props;

beforeEach(() => {
  h.store.states = [];
  focused = [];
  value = "🥕";
  // Focusing the box runs its onFocus, like a real focus event does.
  listeners = new Map();
  globals.document = {
    addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn),
    removeEventListener: (type: string, fn: (event: unknown) => void) => {
      if (listeners.get(type) === fn) listeners.delete(type);
    },
    getElementById: (id: string) => ({
      focus: () => {
        focused.push(id);
        boxFocus?.();
      },
    }),
  };
});
afterEach(() => {
  delete globals.document;
});

describe("EmojiChooser (ledger 879)", () => {
  it("starts closed: a text field holding the value, collapsed, controlling the grid", () => {
    const tree = render();
    expect(box(tree).type).toBe(Input);
    expect(box(tree).props.type).toBe("text");
    expect(box(tree).props.value).toBe("🥕");
    expect(box(tree).props["aria-expanded"]).toBe(false);
    expect(box(tree).props["aria-controls"]).toBe("e-choices");
    expect(grid(tree)).toBeUndefined();
    expect(all(tree, (el) => el.type === "button")).toHaveLength(0);
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
    (box(render()).props.onChange as (e: unknown) => void)({ target: { value: "" } });
    expect(value).toBe("");
  });

  it("tapping the box opens the grid: every choice a labelled button, the current one pressed", () => {
    openGrid();
    const tree = render();
    expect(box(tree).props["aria-expanded"]).toBe(true);
    expect(grid(tree)!.props.id).toBe("e-choices");
    const total = EMOJI_CHOICE_GROUPS.reduce((n, group) => n + group.choices.length, 0);
    expect(picks(tree)).toHaveLength(total);
    expect(picks(tree).every((el) => el.props.type === "button")).toBe(true);
    const pressed = picks(tree).filter((el) => el.props["aria-pressed"] === true);
    expect(pressed.map((el) => el.props["aria-label"])).toEqual(["Pick 🥕 carrot"]);
    // Tapping again (to place the cursor) keeps it open.
    openGrid();
    expect(grid(render())).toBeDefined();
  });

  it("focusing the box (Tab, the label) opens the grid too", () => {
    (box(render()).props.onFocus as () => void)();
    expect(grid(render())).toBeDefined();
  });

  it("focusing an EMPTY box opens the grid (empty is not 'holds non-emoji')", () => {
    value = "";
    (box(render()).props.onFocus as () => void)();
    expect(grid(render())).toBeDefined();
  });

  it("B1: focus onto a box holding non-emoji (a failed Save) keeps the grid shut, so the error shows under the box", () => {
    value = "ab";
    const focusBox = () => (box(render()).props.onFocus as () => void)();
    focusBox();
    expect(grid(render())).toBeUndefined();
    // Open already (typed with the grid up, then an iOS Save tap that blurred
    // to nowhere): the Save's focus shuts it.
    openGrid();
    expect(grid(render())).toBeDefined();
    focusBox();
    expect(grid(render())).toBeUndefined();
    // A tap still opens it to pick a replacement.
    openGrid();
    expect(grid(render())).toBeDefined();
    // A single emoji (spaces trimmed, as Save does) opens on focus as usual.
    value = " 🥯 ";
    focusBox();
    expect(grid(render())).toBeDefined();
  });

  it("B1: Enter in the box (the form's implicit Save) closes the grid without blocking the submit", () => {
    value = "ab";
    const onKeyDown = (tree: unknown) =>
      wrapper(tree).onKeyDown as (event: { key: string; target: unknown; preventDefault: () => void }) => void;
    openGrid();
    expect(grid(render())).toBeDefined();
    // Enter on a grid button is a keyboard pick: left to the click.
    onKeyDown(render())({ key: "Enter", target: { id: "pick" }, preventDefault: vi.fn() });
    expect(grid(render())).toBeDefined();
    const prevent = vi.fn();
    onKeyDown(render())({ key: "Enter", target: { id: "e" }, preventDefault: prevent });
    expect(prevent).not.toHaveBeenCalled();
    expect(grid(render())).toBeUndefined();
    expect(value).toBe("ab");
  });

  it("a tapped pick sets the value and closes, without pulling focus (no phone keyboard)", () => {
    openGrid();
    tap(pick(render(), "Pick 🍐 pear"));
    expect(value).toBe("🍐");
    expect(grid(render())).toBeUndefined();
    expect(focused).toEqual([]);
  });

  it("a keyboard pick sets the value, closes, and returns focus to the box without reopening", () => {
    openGrid();
    keyPick(pick(render(), "Pick 🍐 pear"));
    expect(value).toBe("🍐");
    expect(focused).toEqual(["e"]);
    expect(grid(render())).toBeUndefined();
    // A later, real focus still opens it.
    (box(render()).props.onFocus as () => void)();
    expect(grid(render())).toBeDefined();
  });

  it("Escape closes the open grid, claims the key (a surrounding Sheet stays open), and returns focus", () => {
    const onKeyDown = (tree: unknown) =>
      wrapper(tree).onKeyDown as (event: { key: string; preventDefault: () => void }) => void;
    const closedEscape = vi.fn();
    onKeyDown(render())({ key: "Escape", preventDefault: closedEscape });
    // Closed: the key is the Sheet's.
    expect(closedEscape).not.toHaveBeenCalled();

    openGrid();
    const ignored = vi.fn();
    onKeyDown(render())({ key: "a", preventDefault: ignored });
    expect(ignored).not.toHaveBeenCalled();
    expect(grid(render())).toBeDefined();
    const prevent = vi.fn();
    onKeyDown(render())({ key: "Escape", preventDefault: prevent });
    expect(prevent).toHaveBeenCalled();
    expect(grid(render())).toBeUndefined();
    expect(focused).toEqual(["e"]);
    expect(value).toBe("🥕");
  });

  it("focus moving to another control closes the grid; into the grid, or nowhere (an iOS tap), keeps it", () => {
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

    it("a tap or click outside the box and grid closes it, empty or not; inside keeps it", () => {
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

    it("a tap on the wrapper itself (the form-wide strip beside the box, the gap above the grid) closes it", () => {
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

    it("B1 still holds: a failed Save's focus keeps the grid shut, and an outside tap doesn't reopen it", () => {
      value = "ab";
      openGrid();
      commit();
      (box(render()).props.onFocus as () => void)();
      expect(grid(render())).toBeUndefined();
      expect(listeners.has("pointerup")).toBe(true); // the open render's listener, until its cleanup
      pointerUp({ id: "save" });
      expect(grid(render())).toBeUndefined();
    });
  });

  it("server-renders the field with its value, placeholder and collapsed state", () => {
    h.store.states = [];
    h.store.i = 0;
    const html = renderToString(createElement(EmojiChooser, { id: "e", value: "", onChange: () => {} }));
    expect(html).toMatch(/<input[^>]*id="e"[^>]*type="text"[^>]*placeholder="🍽️"[^>]*aria-expanded="false"[^>]*value=""/);
    expect(html).not.toContain("No emoji chosen");
  });
});
