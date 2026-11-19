// Drives MultiCombobox's real keydown handler without a DOM (same idiom as
// Menu.handlers.test.ts): React's hooks are swapped for a tiny slot store so
// the component can be called as a plain function and the input's
// `onKeyDown` pulled out of its element tree and invoked directly.
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = { state: [] as unknown[], s: 0 };
  return {
    store,
    useId: () => "test-mc-id",
    useRef: (init: unknown) => ({ current: init }),
    useMemo: (fn: () => unknown) => fn(),
    useEffect: () => {},
    useState: (init: unknown) => {
      const i = store.s++;
      if (!(i in store.state)) store.state[i] = init;
      const setState = (next: unknown) => {
        store.state[i] = typeof next === "function" ? (next as (prev: unknown) => unknown)(store.state[i]) : next;
      };
      return [store.state[i], setState];
    },
    reset: () => {
      store.state = [];
      store.s = 0;
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useId: h.useId, useRef: h.useRef, useMemo: h.useMemo, useEffect: h.useEffect, useState: h.useState };
});

import { MultiCombobox } from "./MultiCombobox.js";
import { ClearSearchButton } from "./SearchInput.js";

type MultiComboboxProps = Parameters<typeof MultiCombobox>[0];

interface El {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
}

function findInput(node: unknown): El | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findInput(child);
      if (hit) return hit;
    }
    return null;
  }
  const el = node as El;
  if (el.type === "input") return el;
  return findInput(el.props?.children);
}

function render(props: MultiComboboxProps) {
  h.store.s = 0;
  const input = findInput(MultiCombobox(props));
  if (!input) throw new Error("input not found");
  return input;
}

const options = [
  { value: "a", label: "Apple" },
  { value: "b", label: "Banana" },
  { value: "c", label: "Carrot" },
];

function key(input: El, k: string) {
  const event = { key: k, preventDefault: vi.fn() };
  (input.props.onKeyDown as (e: unknown) => void)(event);
  return event;
}

afterEach(() => h.reset());

describe("MultiCombobox Backspace (item 798)", () => {
  for (const mode of ["multi", "single"] as const) {
    it(`never removes a selection when the query is empty (${mode})`, () => {
      const onChange = vi.fn();
      const value = mode === "multi" ? ["a", "b", "c"] : ["a"];
      // Owner's steps: type a search, delete it back to empty, keep pressing.
      let input = render({ options, value, onChange, mode });
      (input.props.onChange as (e: unknown) => void)({ target: { value: "ba" } });
      input = render({ options, value, onChange, mode });
      expect(input.props.value).toBe("ba");
      (input.props.onChange as (e: unknown) => void)({ target: { value: "" } });
      input = render({ options, value, onChange, mode });
      expect(input.props.value).toBe("");
      for (let i = 0; i < 5; i++) {
        const event = key(input, "Backspace");
        // The browser keeps its own Backspace (nothing to delete): no hijack.
        expect(event.preventDefault).not.toHaveBeenCalled();
        input = render({ options, value, onChange, mode });
      }
      expect(onChange).not.toHaveBeenCalled();
    });
  }
});

describe("MultiCombobox chip remove buttons stay keyboard reachable (item 798)", () => {
  it("every chip has a labelled, tabbable native button", async () => {
    const { renderToString } = await import("react-dom/server");
    const { createElement } = await import("react");
    const html = renderToString(createElement(MultiCombobox, { options, value: ["a", "b"], onChange: () => {} }));
    const buttons = html.match(/<button[^>]*aria-label="Remove [^"]+"[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(2);
    for (const b of buttons) {
      expect(b).toContain('type="button"');
      expect(b).not.toContain("tabindex");
      expect(b).not.toMatch(/\sdisabled(=|\s|>)/);
    }
  });
});

describe("MultiCombobox Clear search × (ledger 999)", () => {
  function find(node: unknown, match: (el: El) => boolean): El | null {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const child of node) {
        const hit = find(child, match);
        if (hit) return hit;
      }
      return null;
    }
    const el = node as El;
    if (match(el)) return el;
    return find(el.props?.children, match);
  }
  const tree = (props: MultiComboboxProps) => {
    h.store.s = 0;
    return MultiCombobox(props);
  };
  const clearOf = (node: unknown) => {
    const el = find(node, (candidate) => candidate.type === ClearSearchButton);
    return el ? (ClearSearchButton(el.props as unknown as Parameters<typeof ClearSearchButton>[0]) as unknown as El | null) : null;
  };

  it("appears with text; a tap empties the query, keeps the listbox open and focus on the input; Escape still closes", () => {
    const props: MultiComboboxProps = { options, value: [], onChange: vi.fn(), mode: "multi" };
    expect(clearOf(tree(props))).toBeNull();
    (findInput(tree(props))!.props.onChange as (e: unknown) => void)({ target: { value: "ba" } });

    const typed = tree(props);
    const clearEl = find(typed, (el) => el.type === ClearSearchButton)!;
    const focus = vi.fn();
    (clearEl.props.inputRef as { current: unknown }).current = { focus };
    const button = clearOf(typed)!;
    expect(button.props["aria-label"]).toBe("Clear search");
    (button.props.onClick as () => void)();
    expect(focus).toHaveBeenCalledOnce();

    const after = tree(props);
    const input = findInput(after)!;
    expect(input.props.value).toBe("");
    expect(clearOf(after)).toBeNull();
    // The combobox semantics are untouched: still a combobox owning its
    // listbox, open, all options back, nothing selected by the clear.
    expect(input.props.role).toBe("combobox");
    expect(input.props["aria-expanded"]).toBe(true);
    expect(input.props["aria-controls"]).toBe("test-mc-id-listbox");
    expect(find(after, (el) => el.props?.listboxId === "test-mc-id-listbox")!.props.options).toEqual(options);
    expect(props.onChange).not.toHaveBeenCalled();
    const escape = key(input, "Escape");
    expect(escape.preventDefault).toHaveBeenCalledOnce();
    expect(findInput(tree(props))!.props["aria-expanded"]).toBe(false);
  });

  it("is not offered on a disabled field", () => {
    const props: MultiComboboxProps = { options, value: [], onChange: vi.fn(), disabled: true };
    (findInput(tree(props))!.props.onChange as (e: unknown) => void)({ target: { value: "ba" } });
    expect(find(tree(props), (el) => el.type === ClearSearchButton)).toBeNull();
  });
});
