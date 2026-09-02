import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { AllergenProgressItem } from "@blw/shared";
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
    status: "not_started",
    overridden: false,
    ...overrides,
  };
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

describe("page-level backfill copy (single-tap flow)", () => {
  it("shows the 'Already established?' line once at the top of the page", () => {
    const html = renderWithItems([item({ status: "not_started" })]);
    expect(html).toContain("Already established? Mark it so your progress reflects it.");
    // Single-tap: the button acts directly — the old inline confirm step is gone.
    expect(html).toContain("Mark as established");
    expect(html).not.toContain("Already established before the app?");
  });
});

describe("BabyAllergensPage recency fact + hint (items 143/144)", () => {
  it("shows no recency fact for a not_started row (nothing served, 0 exposures already says so)", () => {
    const html = renderWithItems([item({ status: "not_started" })]);
    expect(html).not.toContain("last served");
    expect(html).not.toContain("no serves logged yet");
    expect(html).not.toContain("serving again soon");
  });

  it("shows a relative 'last served' fact for a started row served recently", () => {
    const html = renderWithItems([
      item({ status: "started", exposures: 1, lastServedAt: new Date().toISOString() }),
    ]);
    expect(html).toContain("last served today");
    expect(html).not.toContain("serving again soon");
  });

  it("shows 'no serves logged yet' for an override-established row with no exposures", () => {
    const html = renderWithItems([item({ status: "established", overridden: true, exposures: 0, lastServedAt: null })]);
    expect(html).toContain("no serves logged yet");
  });

  it("appends the muted 'serving again soon' hint once the last serve is 14+ days old", () => {
    const stale = new Date();
    stale.setDate(stale.getDate() - 20);
    const html = renderWithItems([item({ status: "established", exposures: 4, lastServedAt: stale.toISOString() })]);
    expect(html).toContain("last served 20d ago");
    expect(html).toContain("Consider serving again soon to maintain tolerance.");
  });
});
