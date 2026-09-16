// Drives Menu's real open-state and viewport-placement behaviour without a
// DOM: React's hooks are replaced with a tiny slot-based store (mirroring
// Sheet.handlers.test.ts/Dialog.handlers.test.ts), so the component can be
// called as a plain function, its element tree read by hand, and its effects
// run synchronously against fake trigger/panel elements and a fake window.
// `Menu` owns its own `open`/`placement` state (unlike Sheet/Dialog, which
// take `open` as a prop), so this harness also mocks `useState` — reading
// the store's ref/state slots directly, by the fixed order Menu calls
// `useRef`/`useState` in, sidesteps ever needing to pull a DOM ref back out
// of a plain element object.
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = {
    refs: [] as { current: unknown }[],
    r: 0,
    state: [] as unknown[],
    s: 0,
  };
  return {
    store,
    useId: () => "test-menu-id",
    useRef: (init: unknown) => {
      const i = store.r++;
      if (!(i in store.refs)) store.refs[i] = { current: init };
      return store.refs[i];
    },
    useState: (init: unknown) => {
      const i = store.s++;
      if (!(i in store.state)) store.state[i] = typeof init === "function" ? (init as () => unknown)() : init;
      const setState = (next: unknown) => {
        store.state[i] = typeof next === "function" ? (next as (prev: unknown) => unknown)(store.state[i]) : next;
      };
      return [store.state[i], setState];
    },
    // Neither effect's cleanup matters here (only the outside-click/escape
    // listener has one, and this suite never simulates unmount) — run the
    // body and drop it.
    useEffect: (effect: () => void | (() => void)) => {
      effect();
    },
    useLayoutEffect: (effect: () => void | (() => void)) => {
      effect();
    },
    reset: () => {
      store.refs = [];
      store.r = 0;
      store.state = [];
      store.s = 0;
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useId: h.useId,
    useRef: h.useRef,
    useState: h.useState,
    useEffect: h.useEffect,
    useLayoutEffect: h.useLayoutEffect,
  };
});

import { Menu, MenuItem } from "./Menu.js";

interface Rendered {
  type: unknown;
  props: {
    children?: unknown;
    onClick?: () => void;
    placement?: "down" | "up";
    [key: string]: unknown;
  };
}

const globals = globalThis as unknown as { document?: unknown; window?: unknown };

/** Just enough of `document` for the outside-click/Escape effect to not throw. */
function fakeDocument() {
  globals.document = { addEventListener: () => {}, removeEventListener: () => {} };
}

/** `innerHeight` always; `visualViewport.height` only when given, so a test
 * can leave it unset to prove the `innerHeight` fallback still works. */
function fakeWindow(innerHeight: number, visualViewportHeight?: number) {
  globals.window = {
    innerHeight,
    ...(visualViewportHeight === undefined ? {} : { visualViewport: { height: visualViewportHeight } }),
  };
}

/** A fake element good for exactly one measurement — the trigger's `bottom`
 * or the panel's `height` — matching what `Menu`'s layout effect reads. */
function fakeRect(rect: Partial<DOMRect>) {
  return { getBoundingClientRect: () => rect as DOMRect };
}

function renderMenu() {
  h.store.r = 0;
  h.store.s = 0;
  return (Menu as unknown as (props: unknown) => Rendered)({
    label: "Actions",
    children: (close: () => void) => createElement(MenuItem, { onSelect: close, children: "Row" }),
  });
}

/** Trigger's onClick, then two more renders: the first opens the menu and
 * runs the layout effect (which may call `setPlacement`, queued for the
 * NEXT render — a plain-function call can't retroactively rewrite JSX it
 * already returned, same as a real `useLayoutEffect` state update can't);
 * the second reflects whatever placement that effect settled on, exactly
 * as React's own synchronous re-render-before-paint would. */
function openMenu(triggerBottom: number, panelHeight: number) {
  const closed = renderMenu();
  const [button] = closed.props.children as [Rendered, unknown];
  button.props.onClick!();

  h.store.refs[1]!.current = fakeRect({ bottom: triggerBottom });
  h.store.refs[2]!.current = fakeRect({ height: panelHeight });

  renderMenu();
  return renderMenu();
}

afterEach(() => {
  delete globals.document;
  delete globals.window;
});

describe("Menu placement", () => {
  it("opens downward when there is room below the trigger", () => {
    h.reset();
    fakeDocument();
    fakeWindow(800);

    const tree = openMenu(200, 150); // 200 + 150 + gap well under 800
    const [, panel] = tree.props.children as [Rendered, Rendered];
    expect(panel.props.placement).toBe("down");
  });

  it("flips upward when the panel would run off the bottom of a short viewport", () => {
    h.reset();
    fakeDocument();
    fakeWindow(700);

    const tree = openMenu(680, 150); // 680 + 150 blows well past 700
    const [, panel] = tree.props.children as [Rendered, Rendered];
    expect(panel.props.placement).toBe("up");
  });

  it("prefers the live visual viewport over innerHeight — a shrunken visible area still flips, even though innerHeight alone would say it fits", () => {
    h.reset();
    fakeDocument();
    fakeWindow(900, 650); // innerHeight says plenty of room; visualViewport says otherwise

    const tree = openMenu(600, 150); // fits under 900, does not fit under 650
    const [, panel] = tree.props.children as [Rendered, Rendered];
    expect(panel.props.placement).toBe("up");
  });

  it("stays at the default 'down' and never throws with no window to measure against", () => {
    h.reset();
    fakeDocument();
    // No fakeWindow() call — `window` is whatever the previous test's
    // afterEach left behind: deleted.
    let tree!: Rendered;
    expect(() => {
      tree = openMenu(680, 150);
    }).not.toThrow();
    const [, panel] = tree.props.children as [Rendered, Rendered];
    expect(panel.props.placement).toBe("down");
  });
});
