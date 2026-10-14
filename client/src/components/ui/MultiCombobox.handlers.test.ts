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
