// Drives Dialog's real open-state behaviour without a DOM: React's hooks are
// replaced with a tiny store and `createPortal` with an identity function, so
// the component can be called as a plain function, its element tree read, and
// its effect run by hand against a stand-in document. Harness idiom ported
// from DateTimeField.handlers.test.ts.
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = { refs: [] as { current: unknown }[], r: 0, cleanups: [] as (() => void)[] };
  return {
    store,
    useRef: (init: unknown) => {
      const i = store.r++;
      if (!(i in store.refs)) store.refs[i] = { current: init };
      return store.refs[i];
    },
    useEffect: (effect: () => void | (() => void)) => {
      const cleanup = effect();
      if (typeof cleanup === "function") store.cleanups.push(cleanup);
    },
    reset: () => {
      store.refs = [];
      store.r = 0;
      store.cleanups = [];
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useRef: h.useRef, useEffect: h.useEffect };
});

vi.mock("react-dom", () => ({
  // The portal's destination is irrelevant here; what it wraps is not.
  createPortal: (children: unknown) => children,
}));

import { Dialog } from "./Dialog.js";

interface Rendered {
  type: unknown;
  props: {
    children?: unknown;
    className?: string;
    onClick?: () => void;
    ariaLabel?: string;
    [key: string]: unknown;
  };
}

interface FakeKey {
  key: string;
  shiftKey?: boolean;
  preventDefault: () => void;
}

const globals = globalThis as unknown as { document?: unknown };

/** A stand-in document: the style slots the scroll lock writes, plus key listeners. */
function fakeDocument(rootOverflow = "", bodyOverflow = "") {
  const listeners: ((event: FakeKey) => void)[] = [];
  const restored: string[] = [];
  const doc = {
    documentElement: { style: { overflow: rootOverflow } },
    body: { style: { overflow: bodyOverflow } },
    activeElement: {
      focus: () => {
        restored.push("previously focused");
      },
    },
    addEventListener: (type: string, listener: (event: FakeKey) => void) => {
      if (type === "keydown") listeners.push(listener);
    },
    removeEventListener: () => {},
  };
  globals.document = doc;
  return { doc, listeners, restored };
}

function open(onClose: () => void) {
  h.store.r = 0;
  return (Dialog as unknown as (props: unknown) => Rendered)({
    open: true,
    onClose,
    ariaLabel: "Little Meals tour",
    children: "slides",
  });
}

afterEach(() => {
  delete globals.document;
});

describe("Dialog handlers (item 309)", () => {
  it("renders nothing at all while closed", () => {
    h.reset();
    fakeDocument();
    const tree = (Dialog as unknown as (props: unknown) => Rendered | null)({
      open: false,
      onClose: () => {},
      ariaLabel: "Little Meals tour",
      children: "slides",
    });
    expect(tree).toBeNull();
  });

  it("closes on an overlay tap, and the panel is a sibling so a tap inside it cannot", () => {
    h.reset();
    fakeDocument();
    let closes = 0;
    const tree = open(() => {
      closes += 1;
    });

    const [overlay, panel] = tree.props.children as Rendered[];

    expect(overlay!.props.className).toContain("dialog-overlay");
    expect(overlay!.props["aria-hidden"]).toBe("true");
    overlay!.props.onClick?.();
    expect(closes).toBe(1);

    // The card is NOT inside the overlay, and has no click handler of its
    // own: a tap on the panel has nothing to reach.
    expect(panel!.props.onClick).toBeUndefined();
    expect(panel!.props.ariaLabel).toBe("Little Meals tour");
    expect(overlay!.props.children).toBeUndefined();
    expect(closes).toBe(1);
  });

  it("closes on Escape, and swallows the key so nothing behind it also reacts", () => {
    h.reset();
    const { listeners } = fakeDocument();
    let closes = 0;
    open(() => {
      closes += 1;
    });

    expect(listeners).toHaveLength(1);
    let prevented = false;
    listeners[0]!({
      key: "Escape",
      preventDefault: () => {
        prevented = true;
      },
    });
    expect(closes).toBe(1);
    expect(prevented).toBe(true);

    // Any other key is left entirely alone.
    listeners[0]!({ key: "a", preventDefault: () => {} });
    expect(closes).toBe(1);
  });

  it("traps Tab inside the panel: forward from the last control wraps to the first, Shift+Tab from the first wraps to the last", () => {
    h.reset();
    const { doc, listeners } = fakeDocument();
    const focused: string[] = [];
    const first = { focus: () => focused.push("first") };
    const last = { focus: () => focused.push("last") };
    const panel = { focus: () => focused.push("panel"), querySelectorAll: () => [first, last] };
    // The panel ref is seeded before the effect runs, the way React has it attached by then.
    h.store.refs[0] = { current: panel };
    open(() => {});
    // Opening focuses the panel, never a control (no stray focus ring on Skip).
    expect(focused).toEqual(["panel"]);

    const tab = (shiftKey: boolean) => {
      let prevented = false;
      listeners[0]!({
        key: "Tab",
        shiftKey,
        preventDefault: () => {
          prevented = true;
        },
      });
      return prevented;
    };

    doc.activeElement = last;
    expect(tab(false)).toBe(true);
    expect(focused.at(-1)).toBe("first");

    doc.activeElement = first;
    expect(tab(true)).toBe(true);
    expect(focused.at(-1)).toBe("last");

    // Anywhere else in the panel, Tab is left to the browser.
    doc.activeElement = first;
    const before = focused.length;
    expect(tab(false)).toBe(false);
    expect(focused.length).toBe(before);
  });

  it("locks background scroll while open and restores exactly what was there before", () => {
    h.reset();
    const { doc, restored } = fakeDocument("scroll", "");
    open(() => {});

    expect(doc.documentElement.style.overflow).toBe("hidden");
    expect(doc.body.style.overflow).toBe("hidden");

    for (const cleanup of h.store.cleanups) cleanup();

    // Whatever inline value was there before, not a blanket "".
    expect(doc.documentElement.style.overflow).toBe("scroll");
    expect(doc.body.style.overflow).toBe("");
    // And focus goes back to whatever had it when the dialog opened.
    expect(restored).toEqual(["previously focused"]);
  });
});
