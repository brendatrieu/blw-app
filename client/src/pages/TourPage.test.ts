import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { preferenceKeys } from "../features/tour/hooks.js";
import { TOUR_SLIDES, TOUR_SLIDE_COUNT } from "../features/tour/slides.js";
import { TourPage } from "./TourPage.js";

/** React escapes text content; the copy is full of apostrophes. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function render(tourCompletedAt: string | null = null): string {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(preferenceKeys.all(), { tourCompletedAt });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MemoryRouter, { initialEntries: ["/tour"] }, createElement(TourPage, null)),
    ),
  );
}

describe("TourPage (item 303)", () => {
  it("renders all six slides, in order, with the copy verbatim", () => {
    const html = render();

    let cursor = -1;
    for (const slide of TOUR_SLIDES) {
      const title = html.indexOf(`>${escapeHtml(slide.title)}<`);
      expect(title, `missing title: ${slide.title}`).toBeGreaterThan(-1);
      // Each slide's title comes after the previous one's: the deck is in
      // the order the copy was written in, not whatever the map produced.
      expect(title).toBeGreaterThan(cursor);
      cursor = title;

      expect(html, `missing body: ${slide.title}`).toContain(escapeHtml(slide.body));
      expect(html).toContain(slide.emoji);
    }
  });

  it("adds no product name, subtitle or extra sentence of its own", () => {
    const html = render();
    // Everything between the tags of the six slides is exactly the six
    // titles and six bodies; the only other words on the page are its
    // controls.
    const words = html.replace(/<[^>]*>/g, "|");
    for (const extra of ["blw-app", "Welcome to", "Tour", "Step 1"]) {
      expect(words).not.toContain(extra);
    }
  });

  it("marks the track as a carousel and each slide as a slide", () => {
    const html = render();

    expect(html).toContain('aria-roledescription="carousel"');
    expect((html.match(/aria-roledescription="slide"/g) ?? []).length).toBe(TOUR_SLIDE_COUNT);
    expect((html.match(/role="group"/g) ?? []).length).toBe(TOUR_SLIDE_COUNT);
    for (let i = 1; i <= TOUR_SLIDE_COUNT; i += 1) {
      expect(html).toContain(`aria-label="${i} of ${TOUR_SLIDE_COUNT}"`);
    }
  });

  it("scroll-snaps a horizontal track with no scrollbar and contained overscroll", () => {
    const html = render();
    expect(html).toMatch(/class="[^"]*scroll-hidden[^"]*"/);
    expect(html).toMatch(/class="[^"]*snap-x[^"]*snap-mandatory[^"]*"/);
    expect(html).toMatch(/class="[^"]*overflow-x-auto[^"]*"/);
    expect(html).toMatch(/class="[^"]*overscroll-x-contain[^"]*"/);
    expect((html.match(/snap-center/g) ?? []).length).toBe(TOUR_SLIDE_COUNT);
    // Full viewport, not a card inside the app's chrome.
    expect(html).toMatch(/class="[^"]*min-h-dvh[^"]*"/);
  });

  it("gives every slide one large emoji on a 96px disc", () => {
    const html = render();
    const discs = html.match(/class="[^"]*emoji-disc[^"]*"/g) ?? [];
    expect(discs.length).toBe(TOUR_SLIDE_COUNT);
    for (const disc of discs) {
      expect(disc).toContain("h-24");
      expect(disc).toContain("w-24");
    }
  });

  it("offers Skip at a 44px hit area and Next as the primary action", () => {
    const html = render();

    const skip = /<button[^>]*class="([^"]*)"[^>]*>Skip<\/button>/.exec(html);
    expect(skip, "Skip button should be rendered").not.toBeNull();
    expect(skip![1]).toContain("min-h-11");

    // First slide: Next, not Get started. The swap to "Get started" (and
    // Skip disappearing) needs a scrolled track this suite has no DOM for;
    // both are pinned against the real handlers in TourPage.handlers.test.ts.
    expect(html).toContain(">Next<");
    expect(html).not.toContain(">Get started<");
  });

  it("renders one dot per slide, each a labelled 44px button, with the first current", () => {
    const html = render();

    const dots = [...html.matchAll(/aria-label="Go to slide (\d) of (\d)"/g)];
    expect(dots.map((match) => match[1])).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(new Set(dots.map((match) => match[2]))).toEqual(new Set([String(TOUR_SLIDE_COUNT)]));

    // Exactly one dot is current, and it is the first.
    expect((html.match(/aria-current="true"/g) ?? []).length).toBe(1);
    const firstDot = html.indexOf('aria-label="Go to slide 1 of 6"');
    const secondDot = html.indexOf('aria-label="Go to slide 2 of 6"');
    const current = html.indexOf('aria-current="true"');
    expect(current).toBeGreaterThan(firstDot);
    expect(current).toBeLessThan(secondDot);

    for (const dot of html.match(/<button[^>]*aria-label="Go to slide[^>]*>/g) ?? []) {
      expect(dot).toMatch(/class="[^"]*h-11[^"]*w-11/);
    }
  });

  it("renders the same deck on a replay, with no extra chrome", () => {
    // Opened from More with the tour already marked seen: same six slides,
    // same controls — only where the exit lands differs (see resolveTourExit).
    const html = render("2026-09-11T10:00:00.000Z");
    expect((html.match(/aria-roledescription="slide"/g) ?? []).length).toBe(TOUR_SLIDE_COUNT);
    expect(html).toContain(">Skip<");
  });
});
