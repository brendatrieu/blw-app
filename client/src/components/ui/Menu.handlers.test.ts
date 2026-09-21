// Drives Menu's real open-state and positioning behaviour without a DOM:
// React's hooks are replaced with a tiny slot-based store (mirroring
// Sheet.handlers.test.ts/Dialog.handlers.test.ts), so the component can be
// called as a plain function, its element tree read by hand, and its effects
// run synchronously against fake trigger/panel elements and a fake window.
// `Menu` owns its own `open`/`position` state (unlike Sheet/Dialog, which
// take `open` as a prop), so this harness also mocks `useState` — reading
// the store's ref/state slots directly, by the fixed order Menu calls
// `useRef`/`useState` in, sidesteps ever needing to pull a DOM ref back out
// of a plain element object. `createPortal` is mocked as the identity
// function (same idiom as Sheet/Dialog) since the panel is portaled now
// (item 397) — the destination doesn't matter here, what it wraps does.
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
    // No cleanup matters here (this suite never simulates unmount) — run
    // the body and drop whatever it returns.
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

vi.mock("react-dom", () => ({
  // The portal's destination is irrelevant here; what it wraps is not.
  createPortal: (children: unknown) => children,
}));

import { Menu, MenuItem } from "./Menu.js";

type Position = { top: number; right: number } | { bottom: number; right: number } | null;

interface Rendered {
  type: unknown;
  props: {
    children?: unknown;
    onClick?: () => void;
    position?: Position;
    [key: string]: unknown;
  };
}

const globals = globalThis as unknown as { document?: unknown; window?: unknown };

/** Every listener `document`/`window.addEventListener` picks up while a
 * test runs, keyed by type — so a test can fire a `scroll` or `mousedown`
 * by hand without a real DOM. */
const listeners = {
  document: new Map<string, ((event: unknown) => void)[]>(),
  window: new Map<string, ((event: unknown) => void)[]>(),
};

function trackListener(bucket: "document" | "window") {
  return (type: string, listener: (event: unknown) => void) => {
    const list = listeners[bucket].get(type) ?? [];
    list.push(listener);
    listeners[bucket].set(type, list);
  };
}

function fire(bucket: "document" | "window", type: string, event: unknown = {}) {
  for (const listener of listeners[bucket].get(type) ?? []) listener(event);
}

/** A fake element good for exactly the measurements `Menu`'s layout effect
 * reads off it — the trigger's `bottom`/`top`/`right`, the panel's `height`
 * — plus a `contains` the outside-click handler asks (false by default: a
 * click landed somewhere else). */
function fakeRect(rect: Partial<DOMRect>) {
  return { getBoundingClientRect: () => rect as DOMRect, contains: (() => false) as (node: unknown) => boolean };
}

/** Just enough of `document` for the listeners to register, plus a
 * `querySelector("nav")` stub — omitted means "no tab bar on this page", a
 * number means "the tab bar's top edge sits here". */
function fakeDocument(navTop?: number) {
  globals.document = {
    body: {},
    addEventListener: trackListener("document"),
    removeEventListener: () => {},
    querySelector: (selector: string) => (selector === "nav" && navTop !== undefined ? fakeRect({ top: navTop }) : null),
  };
}

/** `innerHeight`/`innerWidth` always; `visualViewport.height` only when
 * given, so a test can leave it unset to prove the `innerHeight` fallback
 * still works. */
function fakeWindow(innerHeight: number, visualViewportHeight?: number, innerWidth = 390) {
  globals.window = {
    innerHeight,
    innerWidth,
    addEventListener: trackListener("window"),
    removeEventListener: () => {},
    ...(visualViewportHeight === undefined ? {} : { visualViewport: { height: visualViewportHeight } }),
  };
}

function renderMenu() {
  h.store.r = 0;
  h.store.s = 0;
  return (Menu as unknown as (props: unknown) => Rendered)({
    label: "Actions",
    children: (close: () => void) => createElement(MenuItem, { onSelect: close, children: "Row" }),
  });
}

/** The panel element of a rendered tree, or a falsy value while closed. */
function panelOf(tree: Rendered): Rendered | false | null | undefined {
  return (tree.props.children as [Rendered, Rendered | false])[1];
}

/** Trigger's onClick, then two more renders: the first opens the menu and
 * runs the layout effect (which calls `setPosition`, queued for the NEXT
 * render — a plain-function call can't retroactively rewrite JSX it already
 * returned, same as a real `useLayoutEffect` state update can't); the second
 * reflects the position that effect settled on, exactly as React's own
 * synchronous re-render-before-paint would. The trigger is 36px tall and
 * sits near a 390px screen's right edge, like every real call site. */
function openMenu(triggerBottom: number, panelHeight: number, triggerRight = 374) {
  const closed = renderMenu();
  const [button] = closed.props.children as [Rendered, unknown];
  button.props.onClick!();

  h.store.refs[1]!.current = fakeRect({ top: triggerBottom - 36, bottom: triggerBottom, right: triggerRight });
  h.store.refs[2]!.current = fakeRect({ height: panelHeight });

  renderMenu();
  return renderMenu();
}

afterEach(() => {
  delete globals.document;
  delete globals.window;
  listeners.document.clear();
  listeners.window.clear();
});

describe("Menu position", () => {
  it("opens downward, right-aligned to the trigger, when there is room below it", () => {
    h.reset();
    fakeDocument();
    fakeWindow(800);

    const panel = panelOf(openMenu(200, 150, 374)) as Rendered; // 200 + 150 + gap well under 800
    expect(panel.props.position).toEqual({ top: 208, right: 16 }); // 200 + 8 gap; 390 - 374
  });

  it("flips upward, anchored above the trigger, when the panel would run off a short viewport", () => {
    h.reset();
    fakeDocument();
    fakeWindow(700);

    const panel = panelOf(openMenu(680, 150)) as Rendered; // 680 + 150 blows well past 700
    // Trigger top is 644: bottom edge sits 8px above it, measured from the
    // bottom of the 700px viewport.
    expect(panel.props.position).toEqual({ bottom: 64, right: 16 });
  });

  it("prefers the live visual viewport over innerHeight — a shrunken visible area still flips, even though innerHeight alone would say it fits", () => {
    h.reset();
    fakeDocument();
    fakeWindow(900, 650); // innerHeight says plenty of room; visualViewport says otherwise

    const panel = panelOf(openMenu(600, 150)) as Rendered; // fits under 900, not under 650
    expect(panel.props.position).toHaveProperty("bottom");
    expect(panel.props.position).not.toHaveProperty("top");
  });

  it("flips upward when the tab bar sits low even though the viewport-size APIs both claim there is room — the real iOS 26 case (item 386)", () => {
    h.reset();
    fakeDocument(700); // the bar's own top edge is the true, lower ceiling
    fakeWindow(900, 900); // both APIs agree there's plenty of room below 700

    const panel = panelOf(openMenu(650, 150)) as Rendered; // 650 + 150 fits under 900, not under 700
    expect(panel.props.position).toHaveProperty("bottom");
  });

  it("opens downward on a page with no tab bar — querySelector('nav') found nothing to disagree with the viewport size", () => {
    h.reset();
    fakeDocument(); // no nav
    fakeWindow(800);

    const panel = panelOf(openMenu(200, 150)) as Rendered;
    expect(panel.props.position).toHaveProperty("top");
  });

  it("clamps a downward position so the panel's bottom edge never runs past the screen, even when BOTH fits-below signals were wrong", () => {
    h.reset();
    // Both signals lie, agreeing there is room (the synthetic worst case no
    // real device has shown): the decision comes out "down" for a trigger
    // at the very bottom of a real 844px screen.
    fakeDocument(3000);
    fakeWindow(844, 3000);

    const panel = panelOf(openMenu(820, 150)) as Rendered;
    const position = panel.props.position as { top: number };
    // Unclamped it would be 828, ending 134px past the screen.
    expect(position.top).toBe(694); // 844 - 150
    expect(position.top + 150).toBeLessThanOrEqual(844);
  });

  it("clamps an upward position so the panel's top edge never runs above the screen", () => {
    h.reset();
    fakeDocument();
    fakeWindow(400);

    // A 380-tall panel from a trigger whose top is at 344: unclamped, its
    // bottom edge sits 64px up and its top edge lands at -44.
    const panel = panelOf(openMenu(380, 380)) as Rendered;
    const position = panel.props.position as { bottom: number };
    expect(position.bottom).toBe(20); // 400 - 380
    expect(400 - position.bottom - 380).toBeGreaterThanOrEqual(0); // top edge on screen
  });

  it("stays unmeasured (hidden) and never throws with no window to measure against", () => {
    h.reset();
    fakeDocument();
    // No fakeWindow() call — `window` was deleted by the previous afterEach.
    let tree!: Rendered;
    expect(() => {
      tree = openMenu(680, 150);
    }).not.toThrow();
    expect((panelOf(tree) as Rendered).props.position).toBeNull();
  });
});

describe("Menu dismissal", () => {
  it("closes on scroll — a fixed-position panel doesn't move with the page, so staying open would leave it detached from a trigger that scrolled away", () => {
    h.reset();
    fakeDocument();
    fakeWindow(800);

    expect(panelOf(openMenu(200, 150))).toBeTruthy();

    fire("window", "scroll");
    expect(panelOf(renderMenu())).toBeFalsy();
  });

  it("closes on a click outside both the trigger and the panel", () => {
    h.reset();
    fakeDocument();
    fakeWindow(800);

    openMenu(200, 150);
    h.store.refs[0]!.current = fakeRect({}); // containerRef: contains() says no

    fire("document", "mousedown", { target: {} });
    expect(panelOf(renderMenu())).toBeFalsy();
  });

  it("does NOT treat a click inside the portaled panel as an outside click — the panel is no longer a DOM descendant of the trigger's container", () => {
    h.reset();
    fakeDocument();
    fakeWindow(800);

    openMenu(200, 150);
    h.store.refs[0]!.current = fakeRect({}); // the container does not contain it…
    (h.store.refs[2]!.current as { contains: (node: unknown) => boolean }).contains = () => true; // …the panel does

    fire("document", "mousedown", { target: {} });
    expect(panelOf(renderMenu())).toBeTruthy();
  });
});
