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
    onClick?: (event: { detail: number }) => void;
    onKeyDown?: (event: { key: string; preventDefault: () => void }) => void;
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
  button.props.onClick!({ detail: 1 }); // a pointer click

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

/** A fake focusable row: focusing it makes it the document's active element. */
interface FakeRow {
  tagName: string;
  disabled?: boolean;
  focus: () => void;
  click: ReturnType<typeof vi.fn>;
}

describe("Menu keyboard (item 773, WAI-ARIA menu button)", () => {
  /** Opens the menu the way `how` says, with real-looking trigger/panel
   * fakes: `focus()` moves `document.activeElement`, and the panel's
   * `querySelectorAll` hands back the enabled rows. Leaves exactly ONE
   * keydown listener registered (this harness runs every effect on every
   * render, so earlier renders' listeners are dropped first). */
  function open(how: "enter" | "pointer" | "ArrowDown" | "ArrowUp", tags = ["BUTTON", "A", "BUTTON"]) {
    h.reset();
    fakeDocument();
    fakeWindow(800);
    const doc = globals.document as { activeElement: unknown; body: unknown };
    const trigger = { ...fakeRect({ top: 164, bottom: 200, right: 374 }), focus: () => (doc.activeElement = trigger) };
    const rows: FakeRow[] = tags.map((tagName) => {
      const row: FakeRow = { tagName, focus: () => (doc.activeElement = row), click: vi.fn() };
      return row;
    });
    const selectors: string[] = [];
    const panel = {
      ...fakeRect({ height: 150 }),
      contains: (node: unknown) => rows.includes(node as FakeRow),
      querySelectorAll: (selector: string) => {
        selectors.push(selector);
        return rows;
      },
    };
    doc.activeElement = trigger; // the trigger was reached by Tab

    const [button] = renderMenu().props.children as [Rendered, unknown];
    const preventDefault = vi.fn();
    if (how === "enter") button.props.onClick!({ detail: 0 });
    else if (how === "pointer") button.props.onClick!({ detail: 1 });
    else button.props.onKeyDown!({ key: how, preventDefault });
    h.store.refs[1]!.current = trigger;
    h.store.refs[2]!.current = panel;
    renderMenu(); // opens, measures — the panel is still visibility:hidden here
    const focusBeforePositioned = doc.activeElement;
    renderMenu(); // positioned — the focus effect can act now
    listeners.document.clear();
    const tree = renderMenu();
    return { doc, trigger, rows, selectors, preventDefault, tree, focusBeforePositioned };
  }

  function press(key: string, shift = false, defaultPrevented = false) {
    const event = { key, shiftKey: shift, defaultPrevented, preventDefault: vi.fn() };
    fire("document", "keydown", event);
    return event;
  }

  it("Enter/Space (a click with no pointer behind it) opens the menu and focuses the first row, once the panel is positioned", () => {
    const { doc, trigger, rows, tree, selectors, focusBeforePositioned } = open("enter");
    expect(panelOf(tree)).toBeTruthy();
    // A hidden element refuses focus, so nothing is attempted before then.
    expect(focusBeforePositioned).toBe(trigger);
    expect(doc.activeElement).toBe(rows[0]);
    // Disabled rows can't take focus, so they are left out of the cycle.
    expect(selectors.every((s) => s.includes(":not([disabled])"))).toBe(true);
  });

  it("a pointer click opens the menu but leaves focus alone — no focus ring drawn on a tapped-open menu", () => {
    const { doc, trigger, tree } = open("pointer");
    expect(panelOf(tree)).toBeTruthy();
    expect(doc.activeElement).toBe(trigger);
  });

  it("ArrowDown on the closed trigger opens on the first row; ArrowUp opens on the last — and neither scrolls the page", () => {
    const down = open("ArrowDown");
    expect(panelOf(down.tree)).toBeTruthy();
    expect(down.doc.activeElement).toBe(down.rows[0]);
    expect(down.preventDefault).toHaveBeenCalled();

    const up = open("ArrowUp");
    expect(up.doc.activeElement).toBe(up.rows[2]);
    expect(up.preventDefault).toHaveBeenCalled();
  });

  it("ArrowDown/ArrowUp move through the rows and wrap; Home/End jump to the ends; none of them scroll the page", () => {
    const { doc, rows } = open("enter");
    expect(press("ArrowDown").preventDefault).toHaveBeenCalled();
    expect(doc.activeElement).toBe(rows[1]);
    press("ArrowDown");
    press("ArrowDown"); // past the last row → wraps to the first
    expect(doc.activeElement).toBe(rows[0]);
    expect(press("ArrowUp").preventDefault).toHaveBeenCalled(); // before the first → wraps to the last
    expect(doc.activeElement).toBe(rows[2]);
    expect(press("Home").preventDefault).toHaveBeenCalled();
    expect(doc.activeElement).toBe(rows[0]);
    expect(press("End").preventDefault).toHaveBeenCalled();
    expect(doc.activeElement).toBe(rows[2]);
  });

  it("ignores a key something already handled — the trigger's opening ArrowDown reaching the document listener must not skip to the second row", () => {
    const { doc, rows } = open("ArrowDown");
    press("ArrowDown", false, true);
    expect(doc.activeElement).toBe(rows[0]);
    press("Escape", false, true);
    expect(panelOf(renderMenu())).toBeTruthy();
  });

  it("ArrowDown on a pointer-opened menu (focus still on the trigger) moves into the first row", () => {
    const { doc, rows } = open("pointer");
    press("ArrowDown");
    expect(doc.activeElement).toBe(rows[0]);
  });

  it("Escape closes the menu and returns focus to the trigger", () => {
    const { doc, trigger } = open("enter");
    press("ArrowDown");
    expect(press("Escape").preventDefault).toHaveBeenCalled();
    expect(panelOf(renderMenu())).toBeFalsy();
    expect(doc.activeElement).toBe(trigger);
  });

  it("Tab (either direction) closes the menu and hands focus back to the trigger WITHOUT swallowing the key, so the browser's own Tab continues from there", () => {
    for (const shift of [false, true]) {
      const { doc, trigger } = open("enter");
      const event = press("Tab", shift);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(doc.activeElement).toBe(trigger);
      expect(panelOf(renderMenu())).toBeFalsy();
    }
  });

  it("Space activates a link row (links have no Space activation of their own) but leaves button rows to the browser", () => {
    const { rows } = open("enter");
    const onButton = press(" "); // focus is on rows[0], a button
    expect(onButton.preventDefault).not.toHaveBeenCalled();
    expect(rows[0]!.click).not.toHaveBeenCalled();

    press("ArrowDown"); // rows[1] is a link
    const onLink = press(" ");
    expect(onLink.preventDefault).toHaveBeenCalled();
    expect(rows[1]!.click).toHaveBeenCalledTimes(1);
  });

  it("an item's own close() returns focus to the trigger when focus was in the menu, so a keyboard user doesn't land on <body>", () => {
    const { doc, trigger, rows } = open("enter");
    const itemsElement = panelOf(renderMenu()) as Rendered;
    const row = itemsElement.props.children as Rendered; // the MenuItem element built by renderMenu's children(close)
    expect(doc.activeElement).toBe(rows[0]);
    (row.props as unknown as { onSelect: () => void }).onSelect();
    expect(doc.activeElement).toBe(trigger);
    expect(panelOf(renderMenu())).toBeFalsy();
  });

  it("a scroll that closes the menu returns focus to the trigger when it was in the menu (item 778)", () => {
    const { doc, trigger, rows } = open("enter");
    expect(doc.activeElement).toBe(rows[0]);
    fire("window", "scroll");
    expect(doc.activeElement).toBe(trigger);
    expect(panelOf(renderMenu())).toBeFalsy();
  });

  it("Enter on the trigger to CLOSE the menu leaves no keyboard intent behind: the next tap open focuses no row (item 778)", () => {
    const { doc, trigger } = open("enter");
    trigger.focus();
    const [openButton] = renderMenu().props.children as [Rendered, unknown];
    openButton.props.onClick!({ detail: 0 }); // Enter on ⋮ while open: closes
    const closed = renderMenu();
    expect(panelOf(closed)).toBeFalsy();
    const [closedButton] = closed.props.children as [Rendered, unknown];
    closedButton.props.onClick!({ detail: 1 }); // then a tap opens it again
    renderMenu();
    expect(panelOf(renderMenu())).toBeTruthy();
    expect(doc.activeElement).toBe(trigger);
  });

  it("an item's close() does not steal focus when it was never in the menu (a tap-opened menu on a phone)", () => {
    const { doc } = open("pointer");
    const outside = { tagName: "BODY" };
    doc.activeElement = outside;
    const row = (panelOf(renderMenu()) as Rendered).props.children as Rendered;
    (row.props as unknown as { onSelect: () => void }).onSelect();
    expect(doc.activeElement).toBe(outside);
  });
});
