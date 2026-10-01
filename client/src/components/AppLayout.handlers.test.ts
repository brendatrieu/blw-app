// Item 654 wiring: the slim header's left slot <div> hands its element to the
// HeaderSlotContext provider around the routed page, which is how a page's
// BackButton/CloseButton find it. Server rendering never runs ref callbacks,
// so this drives AppLayout as a plain function with React's state hooks
// replaced by a slot store (the vi.hoisted idiom from Menu.handlers.test.ts)
// and walks the returned element tree by hand.
import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = { state: [] as unknown[], s: 0, pathname: "/foods" };
  return {
    store,
    useState: (init: unknown) => {
      const i = store.s++;
      if (!(i in store.state)) store.state[i] = init;
      return [store.state[i], (next: unknown) => (store.state[i] = next)];
    },
    useRef: (init: unknown) => ({ current: init }),
    useEffect: () => {},
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
