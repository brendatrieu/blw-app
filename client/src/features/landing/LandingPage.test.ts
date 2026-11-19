import { readFileSync, existsSync } from "node:fs";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Navigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  session: null as object | null,
  isPending: false,
  effects: [] as (() => void | (() => void))[],
  /** Set for the handler tests: stands in for usePagedTrack. */
  track: null as null | Record<string, unknown>,
}));

vi.mock("../../lib/auth.js", () => ({
  useSession: () => ({ data: h.session, isPending: h.isPending }),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  // Collected, never run by renderToString anyway; the handler tests run them.
  return { ...actual, useEffect: (fn: () => void) => void h.effects.push(fn) };
});

vi.mock("../../components/ui/Pager.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../components/ui/Pager.js")>();
  return { ...actual, usePagedTrack: (total: number, size: number) => h.track ?? actual.usePagedTrack(total, size) };
});

import { LandingPage } from "./LandingPage.js";
import { DISCLAIMER, LANDING_SLIDES } from "./slides.js";

const render = () => renderToString(createElement(MemoryRouter, { initialEntries: ["/welcome"] }, createElement(LandingPage)));
const count = (html: string, needle: string | RegExp) => html.split(needle).length - 1;

beforeEach(() => {
  h.session = null;
  h.isPending = false;
  h.effects = [];
  h.track = null;
});

describe("LandingPage markup (ledger 992)", () => {
  it("shows the icon, the name and the tagline once, at the top", () => {
    const html = render();
    expect(count(html, "<h1")).toBe(1);
    expect(html).toMatch(/<h1[^>]*>Little Meals<\/h1>/);
    expect(count(html, "Starting solids, made simpler.")).toBe(1);
    expect(html.indexOf('src="/icons/icon-192.png"')).toBeLessThan(html.indexOf("<h1"));
  });

  it("renders the five slides as a carousel of groups, each with its framed light/dark shot", () => {
    const html = render();
    expect(html).toContain('aria-roledescription="carousel"');
    expect(count(html, 'aria-roledescription="slide"')).toBe(5);
    for (const [i, slide] of LANDING_SLIDES.entries()) {
      expect(html).toContain(`aria-label="${i + 1} of 5"`);
      expect(html).toContain(`>${slide.title.replace("'", "&#x27;")}</h2>`);
      expect(html).toContain(`>${slide.body.replace("'", "&#x27;")}</p>`);
      expect(html).toContain(`srcSet="/landing/${slide.shot}-dark.webp" media="(prefers-color-scheme: dark)"`);
      expect(html).toContain(`alt="${slide.alt.replace("'", "&#x27;")}"`);
    }
    // Slides 2-5 load lazily; the first does not.
    expect(count(html, 'loading="lazy"')).toBe(4);
  });

  it("ships every shot it names, light and dark", () => {
    for (const slide of LANDING_SLIDES) {
      for (const theme of ["light", "dark"]) {
        expect(existsSync(new URL(`../../../public/landing/${slide.shot}-${theme}.webp`, import.meta.url)), `${slide.shot}-${theme}`).toBe(true);
      }
    }
  });

  it("puts the disclaimer under slide 5 only", () => {
    const html = render();
    expect(count(html, DISCLAIMER)).toBe(1);
    expect(html.indexOf(DISCLAIMER)).toBeGreaterThan(html.indexOf(LANDING_SLIDES[4]!.body));
  });

  it("has a 44px dot per slide and an 'N of 5' count", () => {
    const html = render();
    expect(count(html, /aria-label="Go to slide \d of 5"/)).toBe(5);
    expect(count(html, 'class="flex h-11 w-11 items-center justify-center"')).toBe(5);
    expect(html).toMatch(/aria-live="polite"[^>]*>1<!-- --> of <!-- -->5<\/span>/);
  });

  it("renders Create an account, Sign in and About Little Meals once each, after the track", () => {
    const html = render();
    expect(count(html, /<a[^>]*href="\/signup"[^>]*>Create an account<\/a>/)).toBe(1);
    expect(count(html, /<a[^>]*href="\/login"[^>]*>Sign in<\/a>/)).toBe(1);
    expect(count(html, /<a[^>]*href="\/about"[^>]*>About Little Meals<\/a>/)).toBe(1);
    const lastSlideEnd = html.lastIndexOf("</section>");
    for (const label of [">Create an account<", ">Sign in<", ">About Little Meals<"]) {
      expect(html.indexOf(label), label).toBeGreaterThan(lastSlideEnd);
    }
  });

  it("is one app-width column with no fixed chrome (item 703, CLAUDE.md)", () => {
    const html = render();
    const root = html.match(/^<div class="([^"]*)"/)?.[1]?.split(" ") ?? [];
    expect(root).toEqual(expect.arrayContaining(["mx-auto", "max-w-lg", "flex", "flex-col"]));
    const classes = [...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1]!.split(" "));
    expect(classes).not.toContain("fixed");
    expect(classes).not.toContain("sticky");
    // Its height leaves OutsideAppLayout's top clearance, so the page never scrolls.
    expect(html).toMatch(/^<div[^>]*style="height:calc\(100dvh - env\(safe-area-inset-top\) - var\(--top-edge-clearance\)\)"/);
  });

  it("never moves by itself: no timers in the source", () => {
    const source = readFileSync(new URL("./LandingPage.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/);
  });

  it("hides the buttons and the About link while the session loads", () => {
    h.isPending = true;
    const html = render();
    expect(html).not.toContain('href="/signup"');
    expect(html).not.toContain('href="/login"');
    expect(html).not.toContain('href="/about"');
    expect(count(html, 'aria-roledescription="slide"')).toBe(5);
  });

  it("forwards a signed-in visit Home, replacing the entry", () => {
    h.session = { user: { id: "u1" } };
    // Called as a plain function, so the track hook is stood in for.
    h.track = { pages: { page: 0 }, trackRef: { current: null }, goTo: () => {} };
    const out = (LandingPage as () => ReactElement<{ to?: string; replace?: boolean }>)();
    expect(out.type).toBe(Navigate);
    expect(out.props).toMatchObject({ to: "/", replace: true });
  });
});

describe("LandingPage handlers (ledger 992)", () => {
  type Listener = (event: { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; preventDefault: () => void }) => void;
  let listeners: Record<string, Listener>;
  const goTo = vi.fn();
  const el = { scrollLeft: 0, clientWidth: 400 };

  beforeEach(() => {
    listeners = {};
    goTo.mockReset();
    el.scrollLeft = 0;
    h.track = {
      pages: { page: 0, last: 4, start: 0, end: 1, total: 5 },
      size: 1,
      trackRef: { current: el },
      onScroll: () => {},
      near: null,
      onTouchStart: () => {},
      onWheel: () => {},
      goTo,
    };
    vi.stubGlobal("document", {
      documentElement: { getAttribute: () => null },
      addEventListener: (type: string, fn: Listener) => (listeners[type] = fn),
      removeEventListener: () => {},
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const mount = () => {
    const tree = (LandingPage as () => ReactElement)();
    for (const effect of h.effects) effect();
    return tree;
  };
  const press = (key: string, mods = {}) => {
    const preventDefault = vi.fn();
    listeners.keydown!({ key, preventDefault, ...mods });
    return preventDefault;
  };

  it("moves one slide on ArrowRight / ArrowLeft, from where the track is", () => {
    mount();
    el.scrollLeft = 800; // slide 3
    expect(press("ArrowRight")).toHaveBeenCalled();
    expect(goTo).toHaveBeenLastCalledWith(3);
    press("ArrowLeft");
    expect(goTo).toHaveBeenLastCalledWith(1);
  });

  it("ignores other keys and modified arrows", () => {
    mount();
    press("Enter");
    press("ArrowRight", { metaKey: true });
    expect(goTo).not.toHaveBeenCalled();
  });

  it("moves to a dot's slide on tap", () => {
    const tree = mount();
    const dots: ReactElement<{ onClick: () => void }>[] = [];
    const walk = (node: ReactNode) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!isValidElement(node)) return;
      const props = node.props as { "aria-label"?: string; children?: ReactNode };
      if (props["aria-label"]?.startsWith("Go to slide")) dots.push(node as ReactElement<{ onClick: () => void }>);
      walk(props.children);
    };
    walk(tree);
    expect(dots).toHaveLength(5);
    dots[3]!.props.onClick();
    expect(goTo).toHaveBeenCalledWith(3);
  });
});
