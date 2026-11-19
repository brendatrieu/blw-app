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
/** The bottom sheet: the first element after the track. */
const sheetOf = (html: string) => {
  const open = html.indexOf("<div", trackClose(html));
  return html.slice(open, closeOf(html, open));
};

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
    // It starts below the iOS band + status bar, as the header's padding does,
    // so the brand stays on the shot's blank top (ledger 1007).
    const shots = [...html.matchAll(/<img[^>]*alt="(?!")[^"]+"[^>]*class="([^"]*)" style="([^"]*)"/g)];
    expect(shots).toHaveLength(5);
    for (const [, cls, style] of shots) {
      expect(cls!.split(" ")).toEqual(["absolute", "inset-0", "h-full", "w-full", "object-cover", "object-top"]);
      expect(style).toBe("padding-top:calc(env(safe-area-inset-top) + var(--top-edge-clearance))");
    }
  });

  it("gives screen readers each slide's words with its picture, once (ledger 1012)", () => {
    const html = render();
    const slides = html.split('aria-roledescription="slide"').slice(1);
    for (const [i, slide] of LANDING_SLIDES.entries()) {
      const words = slides[i]!.match(/<div class="sr-only"><h2>([^<]*)<\/h2><p>([^<]*)<\/p>/)!;
      expect(words[1]).toBe(slide.title.replace("'", "&#x27;"));
      expect(words[2]).toBe(slide.body.replace("'", "&#x27;"));
    }
    // The sheet's copy is hidden from them, so nothing is read twice.
    const stack = sheetOf(html).match(/<div aria-hidden="true" class="grid w-full text-center">/);
    expect(stack).not.toBeNull();
  });

  it("shows the active slide's words in the sheet, the others stacked in the same cell but hidden", () => {
    const html = render();
    const sheet = sheetOf(html);
    const cells = [...sheet.matchAll(/<div class="col-start-1 row-start-1 flex flex-col justify-center gap-1 [^"]* (opacity-\d+)"><p class="font-h2 text-\[var\(--color-text\)\]">([^<]*)<\/p><p class="text-sm text-\[var\(--color-text-muted\)\]">([^<]*)<\/p>/g)];
    expect(cells.map((m) => m[2])).toEqual(LANDING_SLIDES.map((slide) => slide.title.replace("'", "&#x27;")));
    expect(cells.map((m) => m[1])).toEqual(LANDING_SLIDES.map((_, i) => (i === 0 ? "opacity-100" : "opacity-0")));
    // Instant under reduced motion.
    expect(sheet).toContain("transition-opacity duration-[var(--duration-fast)] motion-reduce:transition-none");
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

  it("puts the disclaimer with the last slide only: its words, and its words in the sheet", () => {
    const html = render();
    const last = LANDING_SLIDES.at(-1)!;
    const slides = html.slice(0, trackClose(html)).split('aria-roledescription="slide"').slice(1);
    expect(slides.map((slide) => count(slide, DISCLAIMER))).toEqual(LANDING_SLIDES.map((_, i) => (i === LANDING_SLIDES.length - 1 ? 1 : 0)));
    const sheet = sheetOf(html);
    expect(count(sheet, DISCLAIMER)).toBe(1);
    expect(sheet.indexOf(DISCLAIMER)).toBeGreaterThan(sheet.indexOf(last.body));
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

  it("pins the words, the dots and the ways in to the bottom in one sheet on its own surface (ledger 1012)", () => {
    const html = render();
    const sheet = sheetOf(html);
    expect(sheet).toMatch(
      /^<div class="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center rounded-t-\[var\(--radius-lg\)\] bg-\[var\(--color-landing-sheet\)\] [^"]*" style="box-shadow:var\(--shadow-sheet\)">/,
    );
    // Only a short fade on the picture just above it.
    expect(sheet).toMatch(/^<div[^>]*><div aria-hidden="true" class="pointer-events-none absolute inset-x-0 bottom-full h-6" style="background:linear-gradient\(to bottom, transparent, color-mix\(in srgb, var\(--color-bg\) 60%, transparent\)\)"><\/div>/);
    // Words, then dots, then the two buttons, then About.
    const order = ['class="grid w-full text-center"', `aria-label="Go to slide ${LANDING_SLIDES.length} of ${LANDING_SLIDES.length}"`, ">Create an account<", ">Sign in<", ">About Little Meals<"];
    const at = order.map((label) => sheet.indexOf(label));
    expect(at.every((i) => i > 0), JSON.stringify(at)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // One row of buttons at every width; a touch smaller under 360px.
    expect(count(sheet, /class="[^"]*\bflex-1 max-\[22.5rem\]:px-2.5 max-\[22.5rem\]:text-\[0.8125rem\]"/)).toBe(2);
    expect(sheet).toContain('<div class="flex w-full gap-2">');
  });

  it("is one app-width column with no fixed chrome (item 703, CLAUDE.md)", () => {
    const html = render();
    const root = html.match(/^<div class="([^"]*)"/)?.[1]?.split(" ") ?? [];
    expect(root).toEqual(expect.arrayContaining(["relative", "mx-auto", "max-w-lg"]));
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
    // The space stays, so the sheet does not grow when they arrive.
    expect(sheetOf(html)).toContain('<div class="h-[5.5rem]"></div>');
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
