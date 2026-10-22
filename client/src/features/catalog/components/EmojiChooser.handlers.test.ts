// Ledgers 862, 872: the emoji box opens the grid; pick / type / clear /
// Escape behaviour lives in state and handlers a server render never reaches.
// Harness idiom from CustomFoodForm.handlers.test.ts: `useState` is a hoisted
// store, so the component is called as a plain function and its element tree
// read.
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
import { Input } from "../../../components/ui/Input.js";
import { EMOJI_CHOICE_GROUPS, getCategoryEmoji } from "../foodEmoji.js";

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
let value = "";

function render() {
  h.store.i = 0;
  return EmojiChooser({ id: "e", value, category: "fruit", onChange: (emoji) => (value = emoji) }) as unknown;
}
const box = (tree: unknown) => all(tree, (el) => el.props?.id === "e")[0]!;
const grid = (tree: unknown) => all(tree, (el) => el.props?.role === "group")[0];
const picks = (tree: unknown) =>
  all(tree, (el) => el.type === "button" && String(el.props["aria-label"]).startsWith("Pick "));
const buttonNamed = (tree: unknown, name: string) =>
  all(tree, (el) => el.type === Button && text(el.props.children) === name)[0];
const typedField = (tree: unknown) => all(tree, (el) => el.type === Input)[0];
const click = (el: Rendered) => (el.props.onClick as () => void)();
const openGrid = () => click(box(render()));

beforeEach(() => {
  h.store.states = [];
  focused = [];
  value = "🥕";
  globals.document = { getElementById: (id: string) => ({ focus: () => focused.push(id) }) };
});
afterEach(() => {
  delete globals.document;
});

describe("EmojiChooser (ledger 872)", () => {
  it("starts closed: only the box, a real collapsed button naming the current emoji", () => {
    const tree = render();
    expect(box(tree).type).toBe("button");
    expect(box(tree).props.type).toBe("button");
    expect(box(tree).props["aria-expanded"]).toBe(false);
    expect(box(tree).props["aria-controls"]).toBe("e-choices");
    expect(box(tree).props["aria-label"]).toBe("Emoji: 🥕. Change");
    expect(grid(tree)).toBeUndefined();
    // No separate "Choose an emoji" button any more: the box is the only control.
    expect(all(tree, (el) => el.type === "button" || el.type === Button)).toHaveLength(1);
    expect(text(tree)).not.toContain("Choose an emoji");
  });

  it("with no emoji, the box shows the category's muted and says so", () => {
    value = "";
    const tree = render();
    expect(box(tree).props["aria-label"]).toBe(`Emoji: none, shows ${getCategoryEmoji("fruit")}. Change`);
    expect(text(box(tree))).toBe(getCategoryEmoji("fruit"));
    expect(all(box(tree), (el) => String(el.props?.className).includes("opacity-40"))).toHaveLength(1);
    expect(text(tree)).toContain("No emoji chosen");
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
  });

  it("a pick sets the value, closes, and returns focus to the box", () => {
    openGrid();
    click(picks(render()).find((el) => el.props["aria-label"] === "Pick 🍐 pear")!);
    expect(value).toBe("🍐");
    expect(grid(render())).toBeUndefined();
    expect(focused).toEqual(["e"]);
  });

  it("'Or type one' takes any single emoji, by Use or by Enter (which must not submit the form)", () => {
    openGrid();
    (typedField(render())!.props.onChange as (e: unknown) => void)({ target: { value: "🥯" } });
    click(buttonNamed(render(), "Use")!);
    expect(value).toBe("🥯");
    expect(grid(render())).toBeUndefined();
    expect(focused).toEqual(["e"]);

    openGrid();
    // Closing cleared the field.
    expect(typedField(render())!.props.value).toBe("");
    (typedField(render())!.props.onChange as (e: unknown) => void)({ target: { value: " 🫓 " } });
    const prevent = vi.fn();
    (typedField(render())!.props.onKeyDown as (e: unknown) => void)({ key: "Enter", preventDefault: prevent });
    expect(prevent).toHaveBeenCalled();
    expect(value).toBe("🫓");
    expect(grid(render())).toBeUndefined();
  });

  it("refuses typed text with an inline error and keeps the grid open; blank does nothing", () => {
    openGrid();
    click(buttonNamed(render(), "Use")!);
    expect(grid(render())).toBeDefined();
    expect(value).toBe("🥕");

    (typedField(render())!.props.onChange as (e: unknown) => void)({ target: { value: "ab" } });
    click(buttonNamed(render(), "Use")!);
    const tree = render();
    expect(value).toBe("🥕");
    expect(grid(tree)).toBeDefined();
    const alert = all(tree, (el) => el.props?.role === "alert")[0]!;
    expect(text(alert)).toBe("Use a single emoji");
    expect(typedField(tree)!.props["aria-invalid"]).toBe(true);
    expect(typedField(tree)!.props["aria-describedby"]).toBe(alert.props.id);

    // Typing again clears the error.
    (typedField(render())!.props.onChange as (e: unknown) => void)({ target: { value: "a" } });
    expect(all(render(), (el) => el.props?.role === "alert")).toHaveLength(0);
  });

  it("'No emoji' goes back to the plain plate, closes, and returns focus — offered only when one is set", () => {
    openGrid();
    click(buttonNamed(render(), "No emoji")!);
    expect(value).toBe("");
    expect(grid(render())).toBeUndefined();
    expect(focused).toEqual(["e"]);

    openGrid();
    expect(buttonNamed(render(), "No emoji")).toBeUndefined();
  });

  it("Escape closes the open grid, claims the key (a surrounding Sheet stays open), and returns focus", () => {
    const onKeyDown = (tree: unknown) =>
      (tree as Rendered).props.onKeyDown as (event: { key: string; preventDefault: () => void }) => void;
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

  it("tapping the box again closes the grid", () => {
    openGrid();
    openGrid();
    expect(grid(render())).toBeUndefined();
  });

  it("server-renders the box with its name and collapsed state", () => {
    h.store.states = [];
    h.store.i = 0;
    const html = renderToString(
      createElement(EmojiChooser, { id: "e", value: "🥕", category: "fruit", onChange: () => {} }),
    );
    expect(html).toContain('aria-label="Emoji: 🥕. Change"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Choose an emoji");
  });
});
