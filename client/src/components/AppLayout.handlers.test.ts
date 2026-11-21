// Item 654 wiring: the slim header's left slot <div> hands its element to the
// HeaderSlotContext provider around the routed page, which is how a page's
// BackButton/CloseButton find it. Server rendering never runs ref callbacks,
// so this drives AppLayout as a plain function with React's state hooks
// replaced by a slot store (the vi.hoisted idiom from Menu.handlers.test.ts)
// and walks the returned element tree by hand.
import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = { state: [] as unknown[], s: 0, pathname: "/foods", effects: [] as (() => unknown)[] };
  return {
    store,
    useState: (init: unknown) => {
      const i = store.s++;
      if (!(i in store.state)) store.state[i] = init;
      return [store.state[i], (next: unknown) => (store.state[i] = next)];
    },
    useRef: (init: unknown) => ({ current: init }),
    useEffect: (effect: () => unknown) => {
      store.effects.push(effect);
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState, useRef: h.useRef, useEffect: h.useEffect };
});
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useLocation: () => ({ pathname: h.store.pathname }),
    useNavigationType: () => "PUSH",
  };
});

import { AppLayout } from "./AppLayout.js";
import { HeaderSlotContext } from "./ui/headerSlot.js";

type El = ReactElement<{ children?: ReactNode; value?: unknown }> & { ref?: unknown };

function find(node: ReactNode, match: (el: El) => boolean): El | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child as ReactNode, match);
      if (hit) return hit;
    }
    return null;
  }
  const el = node as El;
  if (match(el)) return el;
  return find(el.props.children, match);
}

function render(pathname: string) {
  h.store.pathname = pathname;
  h.store.s = 0;
  h.store.effects = [];
  return AppLayout() as ReactNode;
}

describe("AppLayout header slot wiring (item 654)", () => {
  it("passes the inner header's slot element to the page through HeaderSlotContext", () => {
    h.store.state = [];
    const first = render("/foods");
    const slotDiv = find(first, (el) => typeof el.ref === "function");
    expect(slotDiv).not.toBeNull();
    expect(find(first, (el) => el.type === HeaderSlotContext.Provider)?.props.value).toBeNull();

    const fakeSlot = { id: "slot" };
    (slotDiv!.ref as (el: unknown) => void)(fakeSlot);
    const second = render("/foods");
    expect(find(second, (el) => el.type === HeaderSlotContext.Provider)?.props.value).toBe(
      fakeSlot,
    );
  });

  it("Home has no slot (its header keeps the greeting), so nothing portals there", () => {
    h.store.state = [];
    expect(find(render("/"), (el) => typeof el.ref === "function")).toBeNull();
  });
});

describe("AppLayout glow ground wiring (ledger 1078, verify c1)", () => {
  it("counts the ground's screens from the 100svh probe and redraws the glow that far down", () => {
    h.store.state = [];
    const first = render("/recipes");
    const ground = find(first, (el) => (el.props as { className?: string }).className === "app-ground");
    const probe = find(first, (el) => /\bh-\[100svh\]/.test((el.props as { className?: string }).className ?? ""));
    expect(ground).not.toBeNull();
    expect(probe).not.toBeNull();
    expect((probe!.props as Record<string, unknown>)["aria-hidden"]).toBe("true");
    const style = (el: El | null) => (el!.props as { style: { backgroundImage: string; backgroundRepeat: string } }).style;
    // Before it is measured: three screens (the first screen and its neighbours).
    expect(style(ground).backgroundImage.split("var(--color-app-glow-sea)")).toHaveLength(4);
    expect(style(ground).backgroundRepeat).toBe("no-repeat");

    let fire = () => {};
    const saved = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(callback: () => void) {
        fire = callback;
      }
      observe() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      (ground!.ref as { current: unknown }).current = { getBoundingClientRect: () => ({ height: 844 * 21.4 }) };
      (probe!.ref as { current: unknown }).current = { getBoundingClientRect: () => ({ height: 844 }) };
      const cleanups = h.store.effects.map((effect) => effect());
      fire();
      expect(cleanups.some((cleanup) => typeof cleanup === "function")).toBe(true);
    } finally {
      globalThis.ResizeObserver = saved;
    }
    // Recipes, 21.4 screens tall: 23 screens of glow, one sea glow each.
    const second = render("/recipes");
    const grown = find(second, (el) => (el.props as { className?: string }).className === "app-ground");
    expect(style(grown).backgroundImage.split("var(--color-app-glow-sea)")).toHaveLength(24);
  });
});
