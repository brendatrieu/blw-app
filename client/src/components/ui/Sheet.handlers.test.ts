// Drives Sheet's real open-state behaviour without a DOM: React's hooks are
// replaced with a tiny store and `createPortal` with an identity function, so
// the component can be called as a plain function, its element tree read, and
// its effect run by hand against a stand-in document. Harness idiom ported
// from Dialog.handlers.test.ts.
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

import { Sheet } from "./Sheet.js";

interface Rendered {
  type: unknown;
  props: {
    children?: unknown;
    className?: string;
    onClick?: () => void;
    [key: string]: unknown;
  };
}

const globals = globalThis as unknown as { document?: unknown; window?: unknown };

/** A stand-in document: the style slots the scroll lock writes, plus key listeners. */
function fakeDocument(rootOverflow = "", bodyOverflow = "") {
  const listeners: ((event: { key: string; preventDefault: () => void }) => void)[] = [];
  const restored: string[] = [];
  const doc = {
    documentElement: { style: { overflow: rootOverflow } },
    body: { style: { overflow: bodyOverflow } },
    activeElement: {
      focus: () => {
        restored.push("previously focused");
      },
    },
    addEventListener: (type: string, listener: (event: { key: string; preventDefault: () => void }) => void) => {
      if (type === "keydown") listeners.push(listener);
    },
    removeEventListener: () => {},
  };
  globals.document = doc;
  return { doc, listeners, restored };
}

/** A stand-in window that records the frames asked for and the scrolls done. */
function fakeWindow(scrollX = 0, scrollY = 0) {
  const frames: (() => void)[] = [];
  const scrolls: [number, number][] = [];
  globals.window = {
    scrollX,
    scrollY,
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
    scrollTo: (x: number, y: number) => {
      scrolls.push([x, y]);
    },
  };
  return { frames, scrolls };
}

function open(onClose: () => void) {
  h.store.r = 0;
  return (Sheet as unknown as (props: unknown) => Rendered)({
    open: true,
    onClose,
    title: "Serve",
    children: "fields",
  });
}

afterEach(() => {
  delete globals.document;
  delete globals.window;
});

describe("Sheet handlers", () => {
  it("renders nothing at all while closed", () => {
    h.reset();
    fakeDocument();
    const tree = (Sheet as unknown as (props: unknown) => Rendered | null)({
      open: false,
      onClose: () => {},
      title: "Serve",
      children: "fields",
    });
    expect(tree).toBeNull();
  });

  it("closes on an overlay tap and on Escape, swallowing the key", () => {
    h.reset();
    const { listeners } = fakeDocument();
    let closes = 0;
    const tree = open(() => {
      closes += 1;
    });

    const [overlay] = tree.props.children as Rendered[];
    expect(overlay!.props.className).toContain("sheet-overlay");
    overlay!.props.onClick?.();
    expect(closes).toBe(1);

    let prevented = false;
    listeners[0]!({
      key: "Escape",
      preventDefault: () => {
        prevented = true;
      },
    });
    expect(closes).toBe(2);
    expect(prevented).toBe(true);
  });

  it("locks background scroll while open and restores exactly what was there before", () => {
    h.reset();
    const { doc, restored } = fakeDocument("scroll", "");
    fakeWindow();
    open(() => {});

    expect(doc.documentElement.style.overflow).toBe("hidden");
    expect(doc.body.style.overflow).toBe("hidden");

    for (const cleanup of h.store.cleanups) cleanup();

    // Whatever inline value was there before, not a blanket "".
    expect(doc.documentElement.style.overflow).toBe("scroll");
    expect(doc.body.style.overflow).toBe("");
    expect(restored).toEqual(["previously focused"]);
  });

  it("schedules the WebKit viewport nudge on close — a frame later, and to exactly where the page already is (item 379)", () => {
    h.reset();
    fakeDocument();
    const { frames, scrolls } = fakeWindow(0, 320);
    open(() => {});

    // Nothing is nudged while the sheet is open.
    expect(frames).toHaveLength(0);

    for (const cleanup of h.store.cleanups) cleanup();

    // Deferred a frame, so it lands after the restored overflow takes effect.
    expect(frames).toHaveLength(1);
    expect(scrolls).toEqual([]);

    frames[0]!();
    // The current position, not the top: the nudge re-syncs the layout
    // viewport without moving the parent's page.
    expect(scrolls).toEqual([[0, 320]]);
  });

  it("does not throw closing outside a browser, where there is no window to nudge", () => {
    h.reset();
    fakeDocument();
    delete globals.window;
    open(() => {});

    expect(() => {
      for (const cleanup of h.store.cleanups) cleanup();
    }).not.toThrow();
  });
});
