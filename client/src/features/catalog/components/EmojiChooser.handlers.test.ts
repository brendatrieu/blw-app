// Ledger 862: the emoji chooser's open/pick/Escape behaviour, which lives in
// state and handlers a server render never reaches. Harness idiom from
// CustomFoodForm.handlers.test.ts: `useState` is a hoisted store, so the
// component is called as a plain function and its element tree read.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  return {
    store,
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = init;
      const set = (value: unknown) => {
        store.states[i] = typeof value === "function" ? (value as (previous: unknown) => unknown)(store.states[i]) : value;
      };
      return [store.states[i], set];
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState };
});

import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { EmojiChooser } from "./EmojiChooser.js";
import { Button } from "../../../components/ui/Button.js";
import { EMOJI_CHOICE_GROUPS } from "../foodEmoji.js";

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

const globals = globalThis as unknown as { document?: unknown };
let focused: string[] = [];
let picked: string[] = [];

function render() {
  h.store.i = 0;
  return EmojiChooser({ id: "e", onPick: (emoji) => picked.push(emoji) }) as unknown;
}
const toggle = (tree: unknown) => all(tree, (el) => el.type === Button)[0]!;
const grid = (tree: unknown) => all(tree, (el) => el.props?.role === "group")[0];
const picks = (tree: unknown) =>
  all(tree, (el) => el.type === "button" && String(el.props["aria-label"]).startsWith("Pick "));

beforeEach(() => {
  h.store.states = [];
  focused = [];
  picked = [];
  globals.document = { getElementById: (id: string) => ({ focus: () => focused.push(id) }) };
});
afterEach(() => {
  delete globals.document;
});

describe("EmojiChooser", () => {
  it("starts closed: just the toggle, collapsed", () => {
    const tree = render();
    expect(toggle(tree).props["aria-expanded"]).toBe(false);
    expect(toggle(tree).props["aria-controls"]).toBe("e");
    expect(grid(tree)).toBeUndefined();
  });

  it("opens to every choice as a labelled button", () => {
    (toggle(render()).props.onClick as () => void)();
    const tree = render();
    expect(toggle(tree).props["aria-expanded"]).toBe(true);
    expect(grid(tree)!.props.id).toBe("e");
    const total = EMOJI_CHOICE_GROUPS.reduce((n, group) => n + group.choices.length, 0);
    expect(picks(tree)).toHaveLength(total);
    expect(picks(tree).some((el) => el.props["aria-label"] === "Pick 🥕 carrot")).toBe(true);
    expect(picks(tree).every((el) => el.props.type === "button")).toBe(true);
  });

  it("a pick fills the field, closes, and returns focus to the toggle", () => {
    (toggle(render()).props.onClick as () => void)();
    const carrot = picks(render()).find((el) => el.props["aria-label"] === "Pick 🥕 carrot")!;
    (carrot.props.onClick as () => void)();
    expect(picked).toEqual(["🥕"]);
    expect(grid(render())).toBeUndefined();
    expect(focused).toEqual(["e-toggle"]);
  });

  it("Escape closes, claims the key (so a surrounding Sheet stays open), and returns focus", () => {
    (toggle(render()).props.onClick as () => void)();
    const onKeyDown = grid(render())!.props.onKeyDown as (event: { key: string; preventDefault: () => void }) => void;
    const ignored = vi.fn();
    onKeyDown({ key: "a", preventDefault: ignored });
    expect(ignored).not.toHaveBeenCalled();
    expect(grid(render())).toBeDefined();
    const prevent = vi.fn();
    onKeyDown({ key: "Escape", preventDefault: prevent });
    expect(prevent).toHaveBeenCalled();
    expect(grid(render())).toBeUndefined();
    expect(focused).toEqual(["e-toggle"]);
    expect(picked).toEqual([]);
  });

  it("the toggle toggles closed again", () => {
    (toggle(render()).props.onClick as () => void)();
    (toggle(render()).props.onClick as () => void)();
    expect(grid(render())).toBeUndefined();
  });

  it("server-renders the toggle with its copy", () => {
    h.store.states = [];
    h.store.i = 0;
    const html = renderToString(createElement(EmojiChooser, { id: "e", onPick: () => {} }));
    expect(html).toContain("Choose an emoji");
    expect(html).toContain('aria-expanded="false"');
  });
});
