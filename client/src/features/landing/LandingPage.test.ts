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
  ignoreTaps: vi.fn(),
}));

vi.mock("../../lib/tapGuard.js", () => ({ ignoreTapsBriefly: h.ignoreTaps }));

vi.mock("../../lib/auth.js", () => ({
  useSession: () => ({ data: h.session, isPending: h.isPending }),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  // Collected, never run by renderToString anyway; the handler tests run them.
  // useRef as a plain box, so the handler tests can call the page as a function.
  return { ...actual, useEffect: (fn: () => void) => void h.effects.push(fn), useRef: <T,>(current: T) => ({ current }) };
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

const N = LANDING_SLIDES.length;
const SHOTS = LANDING_SLIDES.flatMap((slide) => (slide.shot ? [slide] : []));
/** Renders as if the track were on slide `page` (renderToString never scrolls). */
const renderAt = (page: number) => {
  h.track = { pages: { page }, trackRef: { current: null }, near: null, onScroll: () => {}, onTouchStart: () => {}, onWheel: () => {}, goTo: () => {} };
  return render();
};

describe("LandingPage markup (ledger 992, 1003, 1008, 1012)", () => {
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

  it("hides the small brand row on the intro, whose big logo it would repeat, and shows it on the others (ledger 1008)", () => {
    const header = (html: string) => html.match(/<header class="([^"]*)"/)![1]!.split(" ");
    expect(header(render())).toContain("opacity-0");
    expect(header(renderAt(1))).toContain("opacity-100");
    // Still the page's one h1 for screen readers; the big name is decorative.
    expect(count(render(), "<h1")).toBe(1);
  });

  it("renders six slides: the plain intro, then five full-bleed light/dark shots", () => {
    const html = render();
    expect(N).toBe(6);
    expect(html).toContain('aria-roledescription="carousel"');
    expect(count(html, 'aria-roledescription="slide"')).toBe(6);
    for (let i = 1; i <= N; i++) expect(html).toContain(`aria-label="${i} of 6"`);
    for (const slide of SHOTS) {
      expect(html).toContain(`srcSet="/landing/${slide.shot}-dark.webp" media="(prefers-color-scheme: dark)"`);
      expect(html).toContain(`alt="${slide.alt.replace("'", "&#x27;")}"`);
    }
    // The first picture (slide 2, one tap from the intro) loads now; the rest lazily.
    expect(count(html, 'loading="lazy"')).toBe(4);
    expect(count(html, 'loading="eager"')).toBe(1);
    expect(html.indexOf('loading="eager"')).toBeGreaterThan(html.indexOf('aria-label="2 of 6"'));
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

  it("makes the intro the logo, the name and the tagline on the gradient, with first foods around the logo (ledger 1008)", () => {
    const html = render();
    const intro = html.slice(html.indexOf('aria-label="1 of 6"'), html.indexOf('aria-label="2 of 6"'));
    expect(intro).not.toContain("<picture");
    expect(intro).toMatch(/<div aria-hidden="true" class="absolute inset-0" style="background:linear-gradient\(to bottom, var\(--color-intro-from\) 15%, var\(--color-intro-to\) 70%\)">/);
    expect(intro).toContain('<img src="/icons/icon-512.png" alt=""');
    expect(intro).toMatch(/<p class="font-display[^"]*"[^>]*>Little Meals<\/p>/);
    expect(intro).toContain(">Starting solids, made simpler.</p>");
    // Avocado, banana, sweet potato, egg: placed, never animated.
    const foods = [...intro.matchAll(/<span class="absolute text-\[2rem\] leading-none ([^"]*)">([^<]*)<\/span>/g)];
    expect(foods.map((m) => m[2])).toEqual(["🥑", "🍌", "🍠", "🥚"]);
    for (const [, at] of foods) expect(at).not.toMatch(/animate|transition/);
    // The tagline is on the gradient; the sheet carries only the welcome line.
    expect(LANDING_SLIDES[0]).toMatchObject({ title: "Starting solids, made simpler.", shot: null });
  });

  it("gives screen readers each slide's words with its picture, once (ledger 1012)", () => {
    const html = render();
    const slides = html.split('aria-roledescription="slide"').slice(1);
    for (const [i, slide] of LANDING_SLIDES.entries()) {
      const words = slides[i]!.match(/<div class="sr-only"><h2 class="font-h2">([^<]*)<\/h2><p>([^<]*)<\/p>/)!;
      expect(words[1]).toBe(slide.title.replace("'", "&#x27;"));
      expect(words[2]).toBe(slide.body.replace("'", "&#x27;"));
    }
    // The sheet's copy is hidden from them, so nothing is read twice.
    const stack = sheetOf(html).match(/<div aria-hidden="true" class="grid w-full text-center">/);
    expect(stack).not.toBeNull();
  });

  it("shows the active slide's words in the sheet, the others stacked in the same cell but hidden", () => {
    const cellsAt = (page: number) =>
      [...sheetOf(renderAt(page)).matchAll(/<div class="col-start-1 row-start-1 flex flex-col justify-center gap-0.5 [^"]* (opacity-\d+)">(.*?)<p class="text-sm leading-\[1.125rem\] text-\[var\(--color-text-muted\)\]">([^<]*)<\/p>/g)].map(
        (m) => ({ shown: m[1] === "opacity-100", title: m[2]!.match(/^<p class="font-h2 text-\[var\(--color-text\)\]">([^<]*)<\/p>$/)?.[1] ?? null, body: m[3] }),
      );
    const escape = (text: string) => text.replace("'", "&#x27;");
    for (const page of [0, 3, 5]) {
      const cells = cellsAt(page);
      expect(cells.map((cell) => cell.body)).toEqual(LANDING_SLIDES.map((slide) => escape(slide.body)));
      expect(cells.map((cell) => cell.shown)).toEqual(LANDING_SLIDES.map((_, i) => i === page));
      // The intro's tagline is on its gradient, so its cell has no headline.
      expect(cells.map((cell) => cell.title)).toEqual(LANDING_SLIDES.map((slide) => (slide.shot ? escape(slide.title) : null)));
    }
    expect(cellsAt(0)[0]!.body).toBe("Here to help you start solids with confidence, one little meal at a time.");
    // Instant under reduced motion.
    expect(sheetOf(render())).toContain("transition-opacity duration-[var(--duration-fast)] motion-reduce:transition-none");
  });

  it("fills the sides of a wide screen with the current picture, blurred, dimmed and hidden from AT", () => {
    const html = renderAt(2);
    const backdrop = html.match(/<div aria-hidden="true" class="([^"]*)">(.*?)<\/div>/)!;
    expect(backdrop[1]!.split(" ")).toEqual(expect.arrayContaining(["absolute", "w-screen", "overflow-hidden", "hidden", "min-[33rem]:block"]));
    expect(backdrop[2]).toContain(`srcSet="/landing/${SHOTS[1]!.shot}-dark.webp"`);
    const img = backdrop[2]!.match(/<img[^>]*alt=""[^>]*loading="lazy"[^>]*class="([^"]*)"/)![1]!.split(" ");
    expect(img).toEqual(expect.arrayContaining(["object-cover", "blur-2xl", "opacity-40"]));
    expect(html.indexOf(backdrop[0])).toBeLessThan(html.indexOf('aria-roledescription="carousel"'));
    // On the intro, the sides are its gradient (no picture to fetch).
    const intro = renderAt(0).match(/<div aria-hidden="true" class="[^"]*min-\[33rem\]:block">(.*?)<\/div><header/)![1]!;
    expect(intro).toBe('<div class="h-full w-full" style="background:linear-gradient(to bottom, var(--color-intro-from) 15%, var(--color-intro-to) 70%)"></div>');
  });

  it("ships every shot it names, light and dark", () => {
    for (const slide of SHOTS) {
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

  it("has a 44px dot per slide, the current one wider, and no visible 'N of 6' or 'N of 5' (ledger 1003)", () => {
    const html = render();
    expect(count(html, /aria-label="Go to slide \d of 6"/)).toBe(6);
    // Ledger 1022: 9px above and below the dot; the 44px target reaches up over the words, never down over the buttons.
    expect(count(html, 'class="flex h-11 w-11 items-end justify-center pb-[0.5625rem]"')).toBe(6);
    expect(html).toContain('<div class="-mt-[1.125rem] flex shrink-0 items-center justify-center">');
    expect(count(html, 'aria-current="true"')).toBe(1);
    expect(count(html, /class="h-2 rounded-full[^"]* w-5"/)).toBe(1);
    expect(count(html, /class="h-2 rounded-full[^"]* w-2"/)).toBe(5);
    const text = html.replace(/<[^>]*>/g, " ");
    expect(text).not.toMatch(/\bof\s+[56]\b/);
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
    for (const label of [">Go to slide 1 of 6<", 'aria-label="Go to slide 1 of 6"', ">Create an account<", ">Sign in<", ">About Little Meals<"]) {
      expect(html.indexOf(label) === -1 || html.indexOf(label) > close, `${label} after the track closes`).toBe(true);
    }
    expect(html.indexOf(">Create an account<")).toBeGreaterThan(close);
  });

  it("pins the words, the dots and the ways in to the bottom in one sheet on its own surface (ledger 1012, 1022, 1023)", () => {
    const html = render();
    const sheet = sheetOf(html);
    // A frosted panel, square, blurred behind (both spellings), a translucent
    // tint, no shadow or hairline; .landing-sheet carries the fallback tint.
    // Half the old padding: 8px sides and top, half the bottom inset. Up/down
    // drags stay the browser's (pan-y); sideways ones are the sheet's swipe.
    expect(sheet).toMatch(
      /^<div class="landing-sheet absolute inset-x-0 bottom-0 z-10 flex flex-col items-center bg-\[var\(--color-landing-sheet\)\] px-2 pt-2 pb-\[calc\(env\(safe-area-inset-bottom\)\/2\)\]" style="backdrop-filter:blur\(24px\);-webkit-backdrop-filter:blur\(24px\);touch-action:pan-y">/,
    );
    const sheetTag = sheet.slice(0, sheet.indexOf(">") + 1);
    expect(sheetTag).not.toMatch(/rounded|shadow|border|divider/);
    // About: its words 6px under the buttons, the rest of its 44px target below them.
    expect(sheet).toMatch(/<a class="inline-flex min-h-11 items-start pt-1.5 [^"]*" href="\/about"[^>]*>About Little Meals<\/a>/);
    // Nothing drawn on the picture above it (no fade), on any slide.
    for (let page = 0; page < LANDING_SLIDES.length; page++) expect(sheetOf(renderAt(page))).not.toContain("bottom-full");
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
    expect(count(html, 'aria-roledescription="slide"')).toBe(6);
    expect(count(html, /aria-label="Go to slide \d of 6"/)).toBe(6);
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

describe("LandingPage handlers (ledger 992, 1003, 1008)", () => {
  type Listener = (event: { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; preventDefault: () => void }) => void;
  let listeners: Record<string, Listener>;
  const goTo = vi.fn();
  const el = { scrollLeft: 0, clientWidth: 400 };

  beforeEach(() => {
    listeners = {};
    goTo.mockReset();
    el.scrollLeft = 0;
    h.track = {
      pages: { page: 0, last: 5, start: 0, end: 1, total: 6 },
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
    el.scrollLeft = 2000; // slide 6
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
    for (const at of [0, 1, 2, 3, 4]) {
      el.scrollLeft = at * 400;
      onClick!();
      expect(goTo).toHaveBeenLastCalledWith(at + 1);
    }
    goTo.mockReset();
    el.scrollLeft = 2000;
    onClick!();
    expect(goTo).not.toHaveBeenCalled();
  });

  it("ignores other keys and modified arrows", () => {
    mount();
    press("Enter");
    press("ArrowRight", { metaKey: true });
    expect(goTo).not.toHaveBeenCalled();
  });

  const sheetOfTree = (tree: ReactNode) => {
    let found: Record<string, (event: object) => void> | undefined;
    const walk = (node: ReactNode) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!isValidElement(node)) return;
      const props = node.props as { className?: string; children?: ReactNode };
      if (props.className?.startsWith("landing-sheet ")) found = props as unknown as Record<string, (event: object) => void>;
      walk(props.children);
    };
    walk(tree);
    return found!;
  };
  const drag = (sheet: Record<string, (event: object) => void>, dx: number, dy: number, pointerType = "touch") => {
    sheet.onPointerDown!({ pointerType, pointerId: 1, clientX: 200, clientY: 700 });
    sheet.onPointerUp!({ pointerType, pointerId: 1, clientX: 200 + dx, clientY: 700 + dy });
  };

  it("moves one slide on a sideways swipe on the sheet, and eats the tap it would make (ledger 1024)", () => {
    h.ignoreTaps.mockReset();
    const sheet = sheetOfTree(mount());
    el.scrollLeft = 800; // slide 3
    drag(sheet, -120, 10);
    expect(goTo).toHaveBeenLastCalledWith(3);
    drag(sheet, 90, -20, "pen");
    expect(goTo).toHaveBeenLastCalledWith(1);
    expect(h.ignoreTaps).toHaveBeenCalledTimes(2);
  });

  it("never moves on a tap, an up/down drag, a mouse drag, a cancelled touch or past either end (ledger 1024)", () => {
    h.ignoreTaps.mockReset();
    const sheet = sheetOfTree(mount());
    el.scrollLeft = 800;
    drag(sheet, 3, 2); // a tap on a button keeps its click
    drag(sheet, -30, 200); // vertical
    drag(sheet, -200, 0, "mouse");
    sheet.onPointerDown!({ pointerType: "touch", pointerId: 1, clientX: 200, clientY: 700 });
    sheet.onPointerCancel!({});
    sheet.onPointerUp!({ pointerType: "touch", pointerId: 1, clientX: 0, clientY: 700 });
    sheet.onPointerDown!({ pointerType: "touch", pointerId: 1, clientX: 200, clientY: 700 });
    sheet.onPointerUp!({ pointerType: "touch", pointerId: 2, clientX: 0, clientY: 700 });
    el.scrollLeft = 2000; // last slide
    drag(sheet, -200, 0);
    expect(goTo).not.toHaveBeenCalled();
    expect(h.ignoreTaps).toHaveBeenCalledTimes(1); // the swipe past the end still is not a tap
  });

  it("moves one slide per sideways trackpad gesture over the sheet, never on a vertical one (ledger 1024)", () => {
    const sheet = sheetOfTree(mount());
    el.scrollLeft = 400; // slide 2
    for (const [i, deltaX] of [20, 40, 60, 40, 20].entries()) sheet.onWheel!({ deltaX, deltaY: 0, timeStamp: i * 16 });
    expect(goTo).toHaveBeenCalledTimes(1);
    expect(goTo).toHaveBeenLastCalledWith(2);
    sheet.onWheel!({ deltaX: -100, deltaY: 0, timeStamp: 1000 });
    expect(goTo).toHaveBeenLastCalledWith(0);
    sheet.onWheel!({ deltaX: 5, deltaY: 120, timeStamp: 2000 });
    expect(goTo).toHaveBeenCalledTimes(2);
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
    expect(dots).toHaveLength(6);
    dots[3]!.props.onClick();
    expect(goTo).toHaveBeenCalledWith(3);
  });
});
