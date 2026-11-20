import { readFileSync } from "node:fs";
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
const escape = (text: string) => text.replaceAll("'", "&#x27;");
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
/** The bottom block: the first element after the track. */
const footOf = (html: string) => {
  const open = html.indexOf("<div", trackClose(html));
  return html.slice(open, closeOf(html, open));
};
const slidesOf = (html: string) => html.slice(0, trackClose(html)).split('aria-roledescription="slide"').slice(1);

beforeEach(() => {
  h.session = null;
  h.isPending = false;
  h.effects = [];
  h.track = null;
});

const N = LANDING_SLIDES.length;
/** Renders as if the track were on slide `page` (renderToString never scrolls). */
const renderAt = (page: number) => {
  h.track = { pages: { page }, trackRef: { current: null }, near: null, onScroll: () => {}, onTouchStart: () => {}, onWheel: () => {}, goTo: () => {} };
  return render();
};

describe("LandingPage markup (ledger 992, 1003, 1040)", () => {
  it("renders six slides in a carousel, labelled for screen readers only", () => {
    const html = render();
    expect(N).toBe(6);
    expect(html).toContain('aria-roledescription="carousel"');
    expect(count(html, 'aria-roledescription="slide"')).toBe(6);
    for (let i = 1; i <= N; i++) expect(html).toContain(`aria-label="${i} of 6"`);
    // No visible "N of 6" anywhere (ledger 1003), and nothing announced on every move.
    expect(html.replace(/<[^>]*>/g, " ")).not.toMatch(/\bof\s+[56]\b/);
    expect(html).not.toContain("aria-live");
  });

  it("makes the intro the icon, the name (the page's one h1), the tagline, the welcome line and About", () => {
    const intro = slidesOf(render())[0]!;
    expect(count(render(), "<h1")).toBe(1);
    expect(intro).toMatch(/<img src="\/icons\/icon-512.png" alt="" width="108" height="108" class="h-\[6.75rem\] w-\[6.75rem\] rounded-\[27px\]" style="box-shadow:var\(--shadow-landing-icon\)"/);
    expect(intro).toMatch(/<h1 class="font-display text-\[var\(--color-text\)\]"[^>]*>Little Meals<\/h1>/);
    expect(intro).toContain('<p class="text-lg font-semibold text-[var(--color-accent)]">Starting solids, made simpler.</p>');
    expect(intro).toContain(">Here to help you start solids with confidence, one little meal at a time.</p>");
    expect(intro).toMatch(/<a class="inline-flex min-h-11 items-center px-2 text-\[0.8125rem\] font-semibold text-\[var\(--color-accent\)\] underline" href="\/about"[^>]*>About Little Meals<\/a>/);
    expect(intro).not.toContain("<img alt=");
    expect(intro).not.toContain("/landing/chips/");
  });

  it("gives slides 2-6 a display headline (h2), its line and the app's cards with their alt text", () => {
    const slides = slidesOf(render());
    for (const [i, slide] of LANDING_SLIDES.entries()) {
      if (i === 0) continue;
      const html = slides[i]!;
      expect(html).toContain(
        `<h2 class="font-h2 max-w-[19.5rem] text-[var(--color-text)]" style="font-family:var(--font-family-display);font-size:clamp(1.75rem, 4.8dvh, 2.5rem);line-height:1.08;letter-spacing:-0.6px">${escape(slide.title)}</h2>`,
      );
      expect(html).toContain(`>${escape(slide.body)}</p>`);
      const imgs = [...html.matchAll(/<img src="\/landing\/chips\/([\w-]+)\.webp" alt="([^"]+)" width="(\d+)" height="(\d+)" loading="(\w+)"/g)];
      expect(imgs.map((m) => [m[1], m[2], Number(m[3]), Number(m[4])])).toEqual(slide.chips.map((chip) => [chip.name, escape(chip.alt), chip.width, chip.height]));
      // Slide 2 is one tap from the intro: its cards load now, the rest lazily.
      for (const m of imgs) expect(m[5]).toBe(i === 1 ? "eager" : "lazy");
      // Light cards in both modes, rounded, with the token shadow.
      expect(count(html, /<div class="absolute overflow-hidden rounded-\[17px\]" style="left:[\d.]+%;top:[\d.]+%;width:[\d.]+%;box-shadow:var\(--shadow-landing-chip\)">/)).toBe(slide.chips.length);
      expect(html).not.toContain("<picture");
      // The cards shrink to the room they have (a size container), never past their own size.
      expect(html).toMatch(/style="container-type:size"/);
      expect(html).toMatch(/style="width:min\(\d+(\.\d+)?px, 100cqw, [\d.]+ \* 100cqh\);aspect-ratio:[\d.]+ \/ [\d.]+"/);
    }
  });

  it("puts the disclaimer under the last slide only", () => {
    const slides = slidesOf(render());
    expect(slides.map((slide) => count(slide, DISCLAIMER))).toEqual(LANDING_SLIDES.map((_, i) => (i === N - 1 ? 1 : 0)));
    expect(count(render(), DISCLAIMER)).toBe(1);
  });

  it("moves the glows per slide: one layer each behind the track, the current one shown, instant under reduced motion", () => {
    for (const page of [0, 3, 5]) {
      const html = renderAt(page);
      const ground = html.match(/<div aria-hidden="true" class="pointer-events-none absolute inset-y-0 left-1\/2 w-screen -translate-x-1\/2 overflow-hidden bg-\[var\(--color-bg\)\]">(.*?)<\/div><div[^>]*aria-roledescription="carousel"/)!;
      const layers = [...ground[1]!.matchAll(/<div class="absolute inset-0 transition-opacity duration-\[var\(--duration-slow\)\] motion-reduce:transition-none (opacity-\d+)" style="background:([^"]*)">/g)];
      expect(layers.map((m) => m[1] === "opacity-100")).toEqual(LANDING_SLIDES.map((_, i) => i === page));
      for (const [i, m] of layers.entries()) {
        const { glow } = LANDING_SLIDES[i]!;
        expect(m[2]).toBe(
          `radial-gradient(circle at ${glow.sea}, var(--color-landing-glow-sea), transparent 55%), radial-gradient(circle at ${glow.apricot}, var(--color-landing-glow-apricot), transparent 50%)`,
        );
      }
    }
  });

  it("has a 44px dot per slide, the current one longer", () => {
    for (const page of [0, 4]) {
      const foot = footOf(renderAt(page));
      expect(count(foot, /aria-label="Go to slide \d of 6"/)).toBe(6);
      expect(count(foot, 'class="flex h-11 w-11 items-end justify-center pb-3.5"')).toBe(6);
      expect(count(foot, 'aria-current="true"')).toBe(1);
      expect(foot.indexOf('aria-current="true"')).toBeGreaterThan(foot.indexOf(`aria-label="Go to slide ${page + 1} of 6"`));
      expect(count(foot, /class="h-\[7px\] rounded-full[^"]* w-\[22px\]" style="background-color:var\(--color-accent\)"/)).toBe(1);
      expect(count(foot, /class="h-\[7px\] rounded-full[^"]* w-\[7px\]" style="background-color:var\(--color-landing-dot\)"/)).toBe(5);
    }
  });

  it("puts the dots, Create an account and Sign in in the bottom block, after the track closes, once each", () => {
    const html = render();
    const close = trackClose(html);
    expect(close).toBeGreaterThan(html.lastIndexOf("</section>"));
    const foot = footOf(html);
    expect(foot).toMatch(/^<div class="landing-foot relative flex shrink-0 flex-col items-center [^"]*" style="padding-bottom:max\(3.3dvh, env\(safe-area-inset-bottom\)\);touch-action:pan-y">/);
    expect(count(html, /<a[^>]*href="\/signup"[^>]*>Create an account<\/a>/)).toBe(1);
    expect(count(html, /<a[^>]*href="\/login"[^>]*>Sign in<\/a>/)).toBe(1);
    expect(foot).toMatch(/<a class="flex min-h-\[3.25rem\] w-full items-center justify-center rounded-full bg-\[var\(--color-accent\)\] text-base font-semibold text-\[var\(--color-bg-elevated\)\][^"]*" href="\/signup"/);
    expect(foot).toMatch(/Already have an account\?<a class="inline-flex min-h-11 items-center font-semibold text-\[var\(--color-accent\)\] underline" href="\/login"[^>]*>Sign in<\/a>/);
    // Dots, then Create, then Sign in.
    const at = ['aria-label="Go to slide 6 of 6"', ">Create an account<", ">Sign in<"].map((label) => foot.indexOf(label));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // The frosted sheet is gone.
    expect(html).not.toMatch(/landing-sheet|backdrop-filter/);
  });

  it("is one app-width column with no fixed chrome (item 703, CLAUDE.md)", () => {
    const html = render();
    const root = html.match(/^<div class="([^"]*)"/)?.[1]?.split(" ") ?? [];
    expect(root).toEqual(expect.arrayContaining(["relative", "mx-auto", "max-w-lg", "flex", "flex-col"]));
    const classes = [...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1]!.split(" "));
    expect(classes).not.toContain("fixed");
    expect(classes).not.toContain("sticky");
    // The screen's height, pulled up over OutsideAppLayout's top clearance, so the page never scrolls.
    expect(html).toMatch(/^<div[^>]*style="height:100dvh;margin-top:calc\(-1 \* \(env\(safe-area-inset-top\) \+ var\(--top-edge-clearance\)\)\)"/);
    // The words clear the iOS band and status bar.
    const tops = [...html.matchAll(/aria-roledescription="slide"[^>]*style="padding-top:([^"]*)"/g)].map((m) => m[1]);
    expect(tops[0]).toBe("calc(env(safe-area-inset-top) + var(--top-edge-clearance))");
    for (const top of tops.slice(1)) expect(top).toBe("max(calc(env(safe-area-inset-top) + var(--top-edge-clearance) + 1.5rem), 11.4dvh)");
  });

  it("never moves by itself: no timers in the source", () => {
    const source = readFileSync(new URL("./LandingPage.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/);
  });

  it("hides the ways in and the About link while the session loads, keeping their space", () => {
    h.isPending = true;
    const html = render();
    expect(html).not.toContain('href="/signup"');
    expect(html).not.toContain('href="/login"');
    expect(html).not.toContain('href="/about"');
    expect(count(html, 'aria-roledescription="slide"')).toBe(6);
    expect(count(html, /aria-label="Go to slide \d of 6"/)).toBe(6);
    expect(footOf(html)).toContain('<div class="h-[6.875rem]"></div>');
    expect(slidesOf(html)[0]).toContain('<div class="h-11"></div>');
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

describe("LandingPage handlers (ledger 992, 1003, 1024, 1040)", () => {
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

  const footOfTree = (tree: ReactNode) => {
    let found: Record<string, (event: object) => void> | undefined;
    const walk = (node: ReactNode) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!isValidElement(node)) return;
      const props = node.props as { className?: string; children?: ReactNode };
      if (props.className?.startsWith("landing-foot ")) found = props as unknown as Record<string, (event: object) => void>;
      walk(props.children);
    };
    walk(tree);
    return found!;
  };
  const drag = (foot: Record<string, (event: object) => void>, dx: number, dy: number, pointerType = "touch") => {
    foot.onPointerDown!({ pointerType, pointerId: 1, clientX: 200, clientY: 700 });
    foot.onPointerUp!({ pointerType, pointerId: 1, clientX: 200 + dx, clientY: 700 + dy });
  };

  it("moves one slide on a sideways swipe on the bottom block, and eats the tap it would make (ledger 1024)", () => {
    h.ignoreTaps.mockReset();
    const foot = footOfTree(mount());
    el.scrollLeft = 800; // slide 3
    drag(foot, -120, 10);
    expect(goTo).toHaveBeenLastCalledWith(3);
    drag(foot, 90, -20, "pen");
    expect(goTo).toHaveBeenLastCalledWith(1);
    expect(h.ignoreTaps).toHaveBeenCalledTimes(2);
  });

  it("never moves on a tap, an up/down drag, a mouse drag, a cancelled touch or past either end (ledger 1024)", () => {
    h.ignoreTaps.mockReset();
    const foot = footOfTree(mount());
    el.scrollLeft = 800;
    drag(foot, 3, 2); // a tap on a button keeps its click
    drag(foot, -30, 200); // vertical
    drag(foot, -200, 0, "mouse");
    foot.onPointerDown!({ pointerType: "touch", pointerId: 1, clientX: 200, clientY: 700 });
    foot.onPointerCancel!({});
    foot.onPointerUp!({ pointerType: "touch", pointerId: 1, clientX: 0, clientY: 700 });
    foot.onPointerDown!({ pointerType: "touch", pointerId: 1, clientX: 200, clientY: 700 });
    foot.onPointerUp!({ pointerType: "touch", pointerId: 2, clientX: 0, clientY: 700 });
    el.scrollLeft = 2000; // last slide
    drag(foot, -200, 0);
    expect(goTo).not.toHaveBeenCalled();
    expect(h.ignoreTaps).toHaveBeenCalledTimes(1); // the swipe past the end still is not a tap
  });

  it("moves one slide per sideways trackpad gesture over the bottom block, never on a vertical one (ledger 1024)", () => {
    const foot = footOfTree(mount());
    el.scrollLeft = 400; // slide 2
    for (const [i, deltaX] of [20, 40, 60, 40, 20].entries()) foot.onWheel!({ deltaX, deltaY: 0, timeStamp: i * 16 });
    expect(goTo).toHaveBeenCalledTimes(1);
    expect(goTo).toHaveBeenLastCalledWith(2);
    foot.onWheel!({ deltaX: -100, deltaY: 0, timeStamp: 1000 });
    expect(goTo).toHaveBeenLastCalledWith(0);
    foot.onWheel!({ deltaX: 5, deltaY: 120, timeStamp: 2000 });
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
  it("opens About from the intro without also moving to the next slide", () => {
    const tree = mount();
    let about: ReactElement<{ onClick: (event: { stopPropagation: () => void }) => void }> | undefined;
    const walk = (node: ReactNode) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!isValidElement(node)) return;
      const props = node.props as { to?: string; children?: ReactNode };
      if (props.to === "/about") about = node as typeof about;
      walk(props.children);
    };
    walk(tree);
    const stopPropagation = vi.fn();
    about!.props.onClick({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalled();
  });
});
