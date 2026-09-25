import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { ALLERGEN_MAINTENANCE_DAYS, type AllergenProgressItem } from "@blw/shared";
import { trackingKeys } from "../features/tracking/hooks.js";
import { BabyAllergensPage } from "./BabyAllergensPage.js";

const BABY_ID = "22222222-2222-2222-2222-222222222222";

function item(overrides: Partial<AllergenProgressItem>): AllergenProgressItem {
  return {
    allergenSlug: "peanut",
    allergenName: "Peanut",
    introGuidance: "Introduce peanut butter thinned with water or breast milk.",
    exposures: 0,
    firstAt: null,
    lastServedAt: null,
    establishedAt: null,
    lastExposureAt: null,
    reactionNotedAt: null,
    dueAt: null,
    status: "not_started",
    overridden: false,
    ...overrides,
  };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** ISO for `days` ago, and the `dueAt` the server would derive from it — the
 * fixtures say "last met it then" and let the shared rule do the arithmetic. */
function agoIso(days: number): string {
  // Local date-field arithmetic, not raw milliseconds: a DST shift inside the
  // window would otherwise move the calendar-day count the row prints.
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function dueFrom(lastExposureIso: string): string {
  return new Date(Date.parse(lastExposureIso) + ALLERGEN_MAINTENANCE_DAYS * MS_PER_DAY).toISOString();
}

/** An established row that last met the allergen `days` ago, via a meal. */
function servedDaysAgo(days: number): AllergenProgressItem {
  const last = agoIso(days);
  return item({
    status: "established",
    exposures: 3,
    lastServedAt: last,
    lastExposureAt: last,
    dueAt: dueFrom(last),
  });
}

function renderAtAllergensRoute(babyId: string) {
  return createElement(
    MemoryRouter,
    { initialEntries: [`/babies/${babyId}/allergens`] },
    createElement(
      Routes,
      null,
      createElement(Route, { path: "/babies/:id/allergens", element: createElement(BabyAllergensPage, null) }),
    ),
  );
}

function renderWithItems(items: AllergenProgressItem[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(trackingKeys.allergenProgress(BABY_ID), { items });
  return renderToString(createElement(QueryClientProvider, { client: queryClient }, renderAtAllergensRoute(BABY_ID)));
}

describe("BabyAllergensPage row actions (item 136)", () => {
  it("offers 'Mark as established' for a not-yet-established row", () => {
    const html = renderWithItems([item({ status: "not_started" })]);
    expect(html).toContain("Mark as established");
    expect(html).not.toContain("Marked by you");
  });

  it("offers 'Mark as established' for a started (but not established) row", () => {
    const html = renderWithItems([item({ status: "started", exposures: 1 })]);
    expect(html).toContain("Mark as established");
  });

  it("shows the 'marked by you' hint and Undo for an override-established row", () => {
    const html = renderWithItems([item({ status: "established", overridden: true, exposures: 0 })]);
    expect(html).toContain("Marked by you");
    expect(html).toContain(">Undo<");
    expect(html).not.toContain("Mark as established");
  });

  it("offers neither action for a derived-established row (the meal log already proves it)", () => {
    const html = renderWithItems([item({ status: "established", overridden: false, exposures: 3 })]);
    expect(html).not.toContain("Mark as established");
    expect(html).not.toContain("Marked by you");
  });
});

describe("page-level backfill copy", () => {
  it("shows the 'Already established?' line once at the top of the page", () => {
    const html = renderWithItems([item({ status: "not_started" })]);
    expect(html).toContain("Already established? Mark it so your progress reflects it.");
    // One control per row, and the explanation lives once at the top — the
    // old inline confirm step is still gone (the sheet item 365 opens asks
    // for a date, it does not re-ask for confirmation).
    expect(html).toContain("Mark as established");
    expect(html).not.toContain("Already established before the app?");
    // The sheet is closed until tapped, so the row renders no When field.
    expect(html).not.toContain("allergen-established-when");
  });
});

describe("BabyAllergensPage recency fact + countdown (items 143/365)", () => {
  it("shows no recency fact for a not_started row (nothing served, '0 of 3 servings' already says so)", () => {
    const html = renderWithItems([item({ status: "not_started" })]);
    expect(html).not.toContain("last served");
    expect(html).not.toContain("no serves logged yet");
    expect(html).not.toContain("Serve again");
  });

  it("shows a relative 'last served' fact for a started row, with no countdown yet", () => {
    const now = new Date().toISOString();
    const html = renderWithItems([
      item({ status: "started", exposures: 1, lastServedAt: now, lastExposureAt: now }),
    ]);
    expect(html).toContain("last served today");
    expect(html).not.toContain("Serve again");
  });

  it("shows 'no serves logged yet' for a row with nothing behind it at all", () => {
    const html = renderWithItems([item({ status: "established", overridden: true, exposures: 0 })]);
    expect(html).toContain("no serves logged yet");
  });

  it("says 'marked Xd ago' when the parent's mark is the latest exposure", () => {
    const marked = agoIso(3);
    const html = renderWithItems([
      item({
        status: "established",
        overridden: true,
        exposures: 0,
        establishedAt: marked,
        lastExposureAt: marked,
        dueAt: dueFrom(marked),
      }),
    ]);
    expect(html).toContain("marked 3d ago");
    expect(html).not.toContain("last served");
  });

  it("counts down to the day the maintenance week is up, while it is not up yet", () => {
    const html = renderWithItems([servedDaysAgo(2)]);
    expect(html).toContain("last served 2d ago");
    expect(html).toContain("Serve again by ");
    expect(html).not.toContain(">Serve again soon<");
  });

  it("swaps the countdown for a caution badge once the week is up, keeping the old sentence as its title", () => {
    const html = renderWithItems([servedDaysAgo(ALLERGEN_MAINTENANCE_DAYS + 1)]);
    expect(html).toContain("last served 8d ago");
    expect(html).toContain("Serve again soon");
    expect(html).not.toContain("Serve again by");
    // The sentence the badge replaced is still reachable — tooltip + sr-only.
    expect(html).toContain('title="Consider serving again soon to maintain tolerance."');
    expect(html).toContain('<span class="sr-only"> — Consider serving again soon to maintain tolerance.</span>');
    // Caution tokens, not a new color.
    expect(html).toContain("bg-[var(--color-caution-soft)]");
  });
});

// The rule the ladder now states in words, and the two row facts that make
// it visible (item 370).
describe("BabyAllergensPage established rule + reaction pause (item 370)", () => {
  it("states the rule once, at the top of the page", () => {
    const html = renderWithItems([item({ status: "not_started" })]);
    expect(html).toContain("Established after 3 servings without a reaction.");
    // The Mark affordance's own explanation stays with it.
    expect(html).toContain("Already established? Mark it so your progress reflects it.");
  });

  // One count per row (item 518): "N of 3 servings" until established, then
  // nothing — one wording or none, never "exposures".
  it("prints one 'N of 3 servings' count on every row short of established", () => {
    const rows: AllergenProgressItem[] = [
      item({ status: "not_started", exposures: 0 }),
      item({ status: "started", exposures: 1 }),
      item({ status: "started", exposures: 2 }),
    ];
    for (const row of rows) {
      const html = renderWithItems([row]);
      expect(html.split(`${row.exposures} of 3 servings`).length - 1).toBe(1);
      expect(html).not.toMatch(/\d(?:<!-- -->)? exposures?\b/);
    }
  });

  it("prints no count on a row the parent marked on one serve, just 'Marked by you'", () => {
    const html = renderWithItems([item({ status: "established", overridden: true, exposures: 1 })]);
    expect(html).toContain("Marked by you");
    expect(html).not.toContain("of 3 servings");
    expect(html).not.toMatch(/\d(?:<!-- -->)? exposures?\b/);
  });

  it("prints no count once the log has established it", () => {
    const html = renderWithItems([item({ status: "established", exposures: 7 })]);
    expect(html).toContain(">Established<");
    expect(html).not.toContain("of 3 servings");
    expect(html).not.toMatch(/\d(?:<!-- -->)? exposures?\b/);
  });

  it("stops a paused row's count at 3 of 3", () => {
    const reacted = agoIso(2);
    const html = renderWithItems([item({ status: "started", exposures: 4, reactionNotedAt: reacted })]);
    expect(html).toContain("3 of 3 servings");
    expect(html).toContain("Reaction noted");
  });

  it("badges a paused row with the caution chip and the doctor sentence, and keeps the count", () => {
    const reacted = agoIso(2);
    const html = renderWithItems([
      item({ status: "started", exposures: 1, lastServedAt: reacted, lastExposureAt: reacted, reactionNotedAt: reacted }),
    ]);
    expect(html).toContain("Reaction noted");
    expect(html).toContain("Consider talking to your doctor.");
    // Caution tokens, the same chip the due nudge uses — no new color.
    expect(html).toContain("bg-[var(--color-caution-soft)]");
    // Still climbing, so the status chip stays Started...
    expect(html).toContain(">Started<");
    // ...and the count stays: the owner reversed item 370's suppression
    // (item 519), so the log's fact sits above the badge.
    expect(html).toContain("1 of 3 servings");
  });

  it("badges an established row whose log holds a later reaction, without downgrading it", () => {
    const reacted = agoIso(1);
    const html = renderWithItems([
      item({
        status: "established",
        exposures: 4,
        lastServedAt: reacted,
        lastExposureAt: reacted,
        dueAt: dueFrom(reacted),
        reactionNotedAt: reacted,
      }),
    ]);
    expect(html).toContain(">Established<");
    expect(html).toContain("Reaction noted");
    expect(html).toContain("Consider talking to your doctor.");
    expect(html).not.toContain("of 3 servings");
  });

  it("drops the badge once the parent has marked the allergen themselves", () => {
    const reacted = agoIso(4);
    const marked = agoIso(1);
    const html = renderWithItems([
      item({
        status: "established",
        overridden: true,
        exposures: 1,
        lastServedAt: reacted,
        establishedAt: marked,
        lastExposureAt: marked,
        dueAt: dueFrom(marked),
        reactionNotedAt: reacted,
      }),
    ]);
    expect(html).not.toContain("Reaction noted");
    expect(html).not.toContain("Consider talking to your doctor.");
    expect(html).toContain("Marked by you");
  });

  it("shows no reaction copy at all on an ordinary row", () => {
    const html = renderWithItems([item({ status: "started", exposures: 2 })]);
    expect(html).not.toContain("Reaction noted");
    expect(html).not.toContain("Talk to your doctor");
  });
});

describe("BabyAllergensPage rows open the allergen detail page (item 188)", () => {
  it("links each row's info block to /babies/:id/allergens/:slug", () => {
    const html = renderWithItems([item({ allergenSlug: "peanut" }), item({ allergenSlug: "egg", allergenName: "Egg" })]);
    expect(html).toContain(`href="/babies/${BABY_ID}/allergens/peanut"`);
    expect(html).toContain(`href="/babies/${BABY_ID}/allergens/egg"`);
    // One link per row — the row is the only navigation affordance it has.
    expect((html.match(/href="\/babies\/[^"]+\/allergens\/[^"]+"/g) ?? []).length).toBe(2);
  });

  it("carries no chevron glyph, matching storage rows (which open on tap without one)", () => {
    const html = renderWithItems([item({})]);
    expect(html).not.toContain('d="M9 6l6 6-6 6"');
  });

  it("keeps 'Mark as established' OUTSIDE the row anchor (no interactive element nested in a link)", () => {
    const html = renderWithItems([item({ status: "not_started" })]);
    const anchorClose = html.indexOf("</a>");
    const markIndex = html.indexOf(">Mark as established<");
    expect(anchorClose).toBeGreaterThan(-1);
    expect(markIndex).toBeGreaterThan(anchorClose);
    expect(html).not.toMatch(/<a [^>]*>(?:(?!<\/a>).)*<(?:button|a|input)\b/s);
  });

  it("keeps the override row's Undo OUTSIDE the row anchor too", () => {
    const html = renderWithItems([item({ status: "established", overridden: true })]);
    const anchorClose = html.indexOf("</a>");
    expect(html.indexOf(">Undo<")).toBeGreaterThan(anchorClose);
    expect(html).not.toMatch(/<a [^>]*>(?:(?!<\/a>).)*<(?:button|a|input)\b/s);
  });
});

describe("BabyAllergensPage sections", () => {
  /** A named row, so the rendered order can be read off the page. */
  function named(slug: string, name: string, row: AllergenProgressItem): AllergenProgressItem {
    return { ...row, allergenSlug: slug, allergenName: name };
  }

  /** Each section's heading with the row names under it, in page order. */
  function sectionsOf(html: string): { title: string; rows: string[] }[] {
    return [...html.matchAll(/<section[^>]*>(.*?)<\/section>/gs)].map(([, body]) => ({
      title: /<h2[^>]*>(.*?)<\/h2>/s.exec(body!)![1]!,
      rows: [...body!.matchAll(/text-sm font-semibold text-\[var\(--color-text\)\]">([^<]+)<\/span>/g)].map((m) => m[1]!),
    }));
  }

  it("groups rows by what to do next, in ladder order within each section", () => {
    // Every field a sort could use (dates, counts, names) differs between the
    // rows of each section, so a section's order can only come from the input.
    const started = (exposures: number, days: number, firstDays: number): AllergenProgressItem =>
      item({ status: "started", exposures, lastServedAt: agoIso(days), lastExposureAt: agoIso(days), firstAt: agoIso(firstDays) });
    // Marked established after an older reaction: the mark answers it, so the
    // row is due like any other (showsReactionBadge), not paused.
    const markedAfterReaction: AllergenProgressItem = {
      ...item({ status: "established", overridden: true, exposures: 1, firstAt: agoIso(50) }),
      lastServedAt: agoIso(25),
      reactionNotedAt: agoIso(20),
      establishedAt: agoIso(12),
      lastExposureAt: agoIso(12),
      dueAt: dueFrom(agoIso(12)),
    };
    const rows = [
      named("tree_nut", "Tree nut", { ...servedDaysAgo(1), exposures: 4, firstAt: agoIso(60) }),
      named("wheat", "Wheat", { ...servedDaysAgo(9), firstAt: agoIso(40) }),
      named("peanut", "Peanut", item({ status: "not_started" })),
      named("fish", "Fish", started(1, 6, 6)),
      // Due today: the boundary day counts as due.
      named("egg", "Egg", { ...servedDaysAgo(ALLERGEN_MAINTENANCE_DAYS), exposures: 5, firstAt: agoIso(30) }),
      named("soy", "Soy", item({ status: "not_started" })),
      named("sesame", "Sesame", started(2, 4, 20)),
      named("shellfish", "Shellfish", markedAfterReaction),
      // Due tomorrow: not yet.
      named("milk", "Milk", { ...servedDaysAgo(ALLERGEN_MAINTENANCE_DAYS - 1), firstAt: agoIso(45) }),
    ];
    const html = renderWithItems(rows);
    expect(sectionsOf(html)).toEqual([
      { title: "Due for a serve", rows: ["Wheat", "Egg", "Shellfish"] },
      { title: "Started", rows: ["Fish", "Sesame"] },
      { title: "Not started", rows: ["Peanut", "Soy"] },
      { title: "Established", rows: ["Tree nut", "Milk"] },
    ]);
    // The same rows in reverse must reverse every section. With every sortable
    // field distinct inside a section, any sort gives one output for both input
    // orders, so only order-preserving code can pass both assertions.
    expect(sectionsOf(renderWithItems([...rows].reverse()))).toEqual([
      { title: "Due for a serve", rows: ["Shellfish", "Egg", "Wheat"] },
      { title: "Started", rows: ["Sesame", "Fish"] },
      { title: "Not started", rows: ["Soy", "Peanut"] },
      { title: "Established", rows: ["Milk", "Tree nut"] },
    ]);
    expect(html).not.toContain("<hr");
    for (const key of ["due", "started", "not_started", "established"]) {
      expect(html).toMatch(new RegExp(`<section aria-labelledby="ladder-${key}"[^>]*><h2 id="ladder-${key}"`));
    }
  });

  it("keeps a row paused for a reaction in its status section, however overdue", () => {
    const pausedEstablished = { ...servedDaysAgo(10), reactionNotedAt: agoIso(10) };
    const pausedStarted = item({ status: "started", exposures: 1, reactionNotedAt: agoIso(3) });
    const html = renderWithItems([
      named("egg", "Egg", pausedEstablished),
      named("fish", "Fish", pausedStarted),
      named("wheat", "Wheat", servedDaysAgo(9)),
    ]);
    expect(sectionsOf(html)).toEqual([
      { title: "Due for a serve", rows: ["Wheat"] },
      { title: "Started", rows: ["Fish"] },
      { title: "Established", rows: ["Egg"] },
    ]);
  });

  it("shows only the sections that have rows", () => {
    const html = renderWithItems([
      named("milk", "Milk", item({ status: "not_started" })),
      named("egg", "Egg", item({ status: "not_started" })),
    ]);
    expect(sectionsOf(html)).toEqual([{ title: "Not started", rows: ["Milk", "Egg"] }]);
    expect(html).not.toContain("Due for a serve");
  });
});
