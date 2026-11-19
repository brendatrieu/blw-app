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
/** Where the element opening at `open` closes: counts nested tags of its kind. */
const closeOf = (html: string, open: number) => {
  const tag = html.slice(open).match(/^<(\w+)/)![1]!;
  let depth = 0;
  for (const m of html.slice(open).matchAll(new RegExp(`</?${tag}\\b`, "g"))) {
    depth += m[0] === `<${tag}` ? 1 : -1;
    if (depth === 0) return open + m.index;
  }
  return -1;
};
const trackClose = (html: string) => closeOf(html, html.lastIndexOf("<div", html.indexOf('aria-roledescription="carousel"')));

beforeEach(() => {
  h.session = null;
  h.isPending = false;
  h.effects = [];
  h.track = null;
});

describe("LandingPage markup (ledger 992, 1003)", () => {
  it("shows the small icon and the name once, at the top, over a fade that lets taps through", () => {
    const html = render();
    expect(count(html, "<h1")).toBe(1);
    expect(html).toMatch(/<h1[^>]*>Little Meals<\/h1>/);
    expect(html.indexOf('src="/icons/icon-192.png"')).toBeLessThan(html.indexOf("<h1"));
    const header = html.match(/<header class="([^"]*)" style="([^"]*)"/)!;
    expect(header[1]!.split(" ")).toEqual(expect.arrayContaining(["pointer-events-none", "absolute", "top-0"]));
    // It clears the iOS band and the status bar that the picture runs under.
    expect(header[2]).toContain("padding-top:calc(env(safe-area-inset-top) + var(--top-edge-clearance) + 0.75rem)");
    expect(header[2]).toContain("color-mix(in srgb, var(--color-bg) 85%, transparent)");
    expect(html.indexOf("<header")).toBeLessThan(html.indexOf('aria-roledescription="carousel"'));
  });

  it("renders the five slides as a carousel of groups, each a full-bleed light/dark shot", () => {
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
    // Slides 2-5 load lazily, as does the wide-screen backdrop; the first slide does not.
    expect(count(html, 'loading="lazy"')).toBe(5);
    expect(count(html, 'loading="eager"')).toBe(1);
    // Each picture fills its slide, top-aligned: no frame, rounding or shadow.
    const shots = [...html.matchAll(/<img[^>]*alt="(?!")[^"]+"[^>]*class="([^"]*)"/g)].map((m) => m[1]);
    expect(shots).toHaveLength(5);
    for (const cls of shots) {
      expect(cls!.split(" ")).toEqual(["absolute", "inset-0", "h-full", "w-full", "object-cover", "object-top"]);
    }
  });

  it("sets each slide's words on a gradient to the page colour, clear of the panel's height", () => {
    const html = render();
    const captions = [...html.matchAll(/<div class="absolute inset-x-0 bottom-0 flex flex-col gap-1 px-4 pt-8 text-center" style="([^"]*)">/g)];
    expect(captions).toHaveLength(5);
    for (const [, style] of captions) {
      expect(style).toBe("padding-bottom:var(--panel-h);background:linear-gradient(to bottom, transparent, var(--color-bg) 1.75rem)");
    }
  });

  it("fills the sides of a wide screen with the current picture, blurred, dimmed and hidden from AT", () => {
    const html = render();
    const backdrop = html.match(/<div aria-hidden="true" class="([^"]*)">(.*?)<\/div>/)!;
    expect(backdrop[1]!.split(" ")).toEqual(expect.arrayContaining(["absolute", "w-screen", "overflow-hidden", "hidden", "min-[33rem]:block"]));
    expect(backdrop[2]).toContain(`srcSet="/landing/${LANDING_SLIDES[0]!.shot}-dark.webp"`);
    const img = backdrop[2]!.match(/<img[^>]*alt=""[^>]*loading="lazy"[^>]*class="([^"]*)"/)![1]!.split(" ");
    expect(img).toEqual(expect.arrayContaining(["object-cover", "blur-2xl", "opacity-40"]));
    expect(html.indexOf(backdrop[0])).toBeLessThan(html.indexOf('aria-roledescription="carousel"'));
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

  it("has a 44px dot per slide, the current one wider, and no visible 'N of 5' (ledger 1003)", () => {
    const html = render();
    expect(count(html, /aria-label="Go to slide \d of 5"/)).toBe(5);
    expect(count(html, 'class="flex h-11 w-11 items-center justify-center"')).toBe(5);
    expect(count(html, 'aria-current="true"')).toBe(1);
    expect(count(html, /class="h-2 rounded-full[^"]* w-5"/)).toBe(1);
    expect(count(html, /class="h-2 rounded-full[^"]* w-2"/)).toBe(4);
    const text = html.replace(/<[^>]*>/g, " ");
    expect(text).not.toMatch(/\bof\s+5\b/);
    expect(html).not.toContain("aria-live");
  });

  it("renders Create an account, Sign in and About Little Meals once each, after the track closes", () => {
    const html = render();
    expect(count(html, /<a[^>]*href="\/signup"[^>]*>Create an account<\/a>/)).toBe(1);
    expect(count(html, /<a[^>]*href="\/login"[^>]*>Sign in<\/a>/)).toBe(1);
    expect(count(html, /<a[^>]*href="\/about"[^>]*>About Little Meals<\/a>/)).toBe(1);
    const lastSlideEnd = html.lastIndexOf("</section>");
    // Ledger 1001: after the track itself, not just after slide 5 inside it.
    const close = trackClose(html);
    expect(close).toBeGreaterThan(lastSlideEnd);
    for (const label of [">Go to slide 1 of 5<", 'aria-label="Go to slide 1 of 5"', ">Create an account<", ">Sign in<", ">About Little Meals<"]) {
      expect(html.indexOf(label) === -1 || html.indexOf(label) > close, `${label} after the track closes`).toBe(true);
    }
    expect(html.indexOf(">Create an account<")).toBeGreaterThan(close);
  });

  it("pins the dots and the ways in to the bottom, in one solid panel as tall as --panel-h", () => {
    const html = render();
    const open = html.indexOf("<div", trackClose(html));
    const panel = html.slice(open, closeOf(html, open));
    expect(panel).toMatch(/^<div class="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center bg-\[var\(--color-bg\)\] [^"]*" style="height:var\(--panel-h\)">/);
    for (const label of ['aria-label="Go to slide 5 of 5"', ">Create an account<", ">Sign in<", ">About Little Meals<"]) {
      expect(panel, label).toContain(label);
    }
    // One row of buttons at every width; a touch smaller under 360px.
    expect(count(panel, /class="[^"]*\bflex-1 max-\[22.5rem\]:px-2.5 max-\[22.5rem\]:text-\[0.8125rem\]"/)).toBe(2);
    expect(panel).toContain('<div class="flex w-full gap-2">');
  });

  it("is one app-width column with no fixed chrome (item 703, CLAUDE.md)", () => {
    const html = render();
    const root = html.match(/^<div class="([^"]*)"/)?.[1]?.split(" ") ?? [];
    expect(root).toEqual(expect.arrayContaining(["relative", "mx-auto", "max-w-lg", "[--panel-h:calc(8.25rem+max(1rem,env(safe-area-inset-bottom)))]"]));
    const classes = [...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1]!.split(" "));
    expect(classes).not.toContain("fixed");
    expect(classes).not.toContain("sticky");
    // The screen's height, pulled up over OutsideAppLayout's top clearance, so the page never scrolls.
    expect(html).toMatch(/^<div[^>]*style="height:100dvh;margin-top:calc\(-1 \* \(env\(safe-area-inset-top\) \+ var\(--top-edge-clearance\)\)\)"/);
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
    expect(count(html, /aria-label="Go to slide \d of 5"/)).toBe(5);
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

describe("LandingPage handlers (ledger 992, 1003)", () => {
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

  it("never moves past either end by key", () => {
    mount();
    press("ArrowLeft");
    el.scrollLeft = 1600; // slide 5
    press("ArrowRight");
    expect(goTo).not.toHaveBeenCalled();
  });

  it("goes to the next slide on a tap on the picture, none after the last", () => {
    const tree = mount();
    let onClick: (() => void) | undefined;
    const walk = (node: ReactNode) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!isValidElement(node)) return;
      const props = node.props as { "aria-roledescription"?: string; onClick?: () => void; children?: ReactNode };
      if (props["aria-roledescription"] === "carousel") onClick = props.onClick;
      walk(props.children);
    };
    walk(tree);
    for (const at of [0, 1, 2, 3]) {
      el.scrollLeft = at * 400;
      onClick!();
      expect(goTo).toHaveBeenLastCalledWith(at + 1);
    }
    goTo.mockReset();
    el.scrollLeft = 1600;
    onClick!();
    expect(goTo).not.toHaveBeenCalled();
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
