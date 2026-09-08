import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { AllergenDetail } from "@blw/shared";
import { trackingKeys } from "../features/tracking/hooks.js";
import { formatAllergenDate } from "../features/tracking/allergenRow.js";
import { AllergenDetailPage } from "./AllergenDetailPage.js";

/** SSR escapes the apostrophe, so match the copy through it. */
const NOT_FOUND_COPY = /Couldn(?:&#x27;|')t find that allergen\./;

const BABY_ID = "22222222-2222-2222-2222-222222222222";
const SLUG = "egg";
const CATALOG_FOOD_ID = "33333333-3333-3333-3333-333333333333";
const CUSTOM_FOOD_ID = "44444444-4444-4444-4444-444444444444";
const MEAL_ID = "55555555-5555-5555-5555-555555555555";

function detail(overrides: Partial<AllergenDetail> = {}): AllergenDetail {
  return {
    progress: {
      allergenSlug: SLUG,
      allergenName: "Egg",
      introGuidance: "Offer well-cooked egg in the morning at home.",
      exposures: 2,
      firstAt: "2026-08-01T09:00:00.000Z",
      lastServedAt: "2026-08-20T09:00:00.000Z",
      status: "started",
      overridden: false,
    },
    foods: [
      {
        id: CATALOG_FOOD_ID,
        slug: "scrambled-egg",
        name: "Scrambled egg",
        category: "protein",
        emoji: null,
        isCustom: false,
      },
      {
        id: CUSTOM_FOOD_ID,
        slug: "nans-omelette",
        name: "Nan's omelette",
        category: "protein",
        emoji: "🍳",
        isCustom: true,
      },
    ],
    exposures: [
      {
        mealId: MEAL_ID,
        servedAt: "2026-08-20T09:00:00.000Z",
        foods: [{ id: CATALOG_FOOD_ID, name: "Scrambled egg", emoji: null }],
        reaction: "mild rash",
        notes: null,
      },
    ],
    ...overrides,
  };
}

/** `useParams` only resolves inside a matching `<Route>`, so every render
 * here goes through the real `/babies/:id/allergens/:slug` path. */
function renderAtRoute(queryClient: QueryClient) {
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        MemoryRouter,
        { initialEntries: [`/babies/${BABY_ID}/allergens/${SLUG}`] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: "/babies/:id/allergens/:slug",
            element: createElement(AllergenDetailPage, null),
          }),
        ),
      ),
    ),
  );
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderWithDetail(data: AllergenDetail) {
  const queryClient = newClient();
  queryClient.setQueryData(trackingKeys.allergenDetail(BABY_ID, SLUG), data);
  return renderAtRoute(queryClient);
}

/** The only way to express a failed query for an SSR render — `setQueryData`
 * can only seed success. Mirrors what a 404 from the detail route produces.
 * `retryOnMount: false` keeps the observer from optimistically re-opening the
 * query (which would report `pending` again) the moment the page mounts. */
function renderWithError() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
  const key = trackingKeys.allergenDetail(BABY_ID, SLUG);
  queryClient
    .getQueryCache()
    .build(queryClient, { queryKey: key })
    .setState({ status: "error", error: new Error("not_found"), fetchStatus: "idle" });
  return renderAtRoute(queryClient);
}

describe("AllergenDetailPage states (item 189)", () => {
  it("renders skeletons and a way back while the query is still pending", () => {
    const html = renderAtRoute(newClient());
    expect(html).toContain("Back");
    expect(html).toContain('aria-label="Loading"');
    expect(html).not.toContain("Egg");
    expect(html).not.toMatch(NOT_FOUND_COPY);
  });

  it("renders 'Couldn't find that allergen.' with a BackButton for an unknown slug (404)", () => {
    const html = renderWithError();
    expect(html).toMatch(NOT_FOUND_COPY);
    expect(html).toContain("Back");
    expect(html).not.toMatch(/Meals with /);
  });
});

describe("AllergenDetailPage header + facts (item 187)", () => {
  it("shows the allergen emoji, name, status badge, facts line, and guidance", () => {
    const html = renderWithDetail(detail());
    expect(html).toContain("🥚");
    expect(html).toContain("Egg");
    expect(html).toContain("Started");
    expect(html).toMatch(/2(?:<!-- -->)? exposures/);
    expect(html).toMatch(new RegExp(`First: (?:<!-- -->)?${formatAllergenDate("2026-08-01T09:00:00.000Z")}`));
    expect(html).toMatch(new RegExp(`Last served: (?:<!-- -->)?${formatAllergenDate("2026-08-20T09:00:00.000Z")}`));
    expect(html).toContain("Offer well-cooked egg in the morning at home.");
  });

  it("falls back to the recency helper's phrasing for an override-only row (nothing ever served)", () => {
    const html = renderWithDetail(
      detail({
        progress: {
          ...detail().progress,
          status: "established",
          overridden: true,
          exposures: 0,
          firstAt: null,
          lastServedAt: null,
        },
        exposures: [],
      }),
    );
    expect(html).toContain("no serves logged yet");
    expect(html).not.toContain("Last served:");
    expect(html).toContain("Established");
  });

  it("appends the muted recency hint once the last serve is 14+ days old", () => {
    const stale = new Date();
    stale.setDate(stale.getDate() - 20);
    const html = renderWithDetail(
      detail({ progress: { ...detail().progress, lastServedAt: stale.toISOString() } }),
    );
    expect(html).toContain("Consider serving again soon to maintain tolerance.");
  });
});

describe("AllergenDetailPage foods section (item 187)", () => {
  it("links each food to its food page and offers a 'Log meal' shortcut carrying the food id", () => {
    const html = renderWithDetail(detail());
    expect(html).toMatch(/Foods with (?:<!-- -->)?egg/);
    expect(html).toContain('href="/foods/scrambled-egg"');
    expect(html).toContain('href="/foods/nans-omelette"');
    expect(html).toContain(`href="/log-meal?food=${CATALOG_FOOD_ID}"`);
    expect(html).toContain(`href="/log-meal?food=${CUSTOM_FOOD_ID}"`);
    expect(html).toContain(">Log meal<");
  });

  it("badges a custom food and leaves the catalog food unbadged", () => {
    const html = renderWithDetail(detail());
    expect((html.match(/>Custom</g) ?? []).length).toBe(1);
  });

  it("keeps the 'Log meal' link OUTSIDE the food anchor — nothing interactive nested in a link", () => {
    const html = renderWithDetail(detail());
    const anchorClose = html.indexOf("</a>");
    expect(anchorClose).toBeGreaterThan(-1);
    expect(html).not.toMatch(/<a [^>]*>(?:(?!<\/a>).)*<(?:button|a|input)\b/s);
  });
});

describe("AllergenDetailPage exposure history (item 187)", () => {
  it("lists each exposure with its foods and reaction, linking the row to the meal editor", () => {
    const html = renderWithDetail(detail());
    expect(html).toMatch(/Meals with (?:<!-- -->)?[a-z]/);
    expect(html).toContain(`href="/log-meal?edit=${MEAL_ID}"`);
    expect(html).toContain("Scrambled egg");
    expect(html).toMatch(/Reaction: (?:<!-- -->)?mild rash/);
  });

  it("keeps the list newest-first, in the order the server returned", () => {
    const older = "2026-08-02T09:00:00.000Z";
    const olderMealId = "66666666-6666-6666-6666-666666666666";
    const html = renderWithDetail(
      detail({
        exposures: [
          ...detail().exposures,
          {
            mealId: olderMealId,
            servedAt: older,
            foods: [{ id: CUSTOM_FOOD_ID, name: "Nan's omelette", emoji: "🍳" }],
            reaction: null,
            notes: null,
          },
        ],
      }),
    );
    expect(html.indexOf(`href="/log-meal?edit=${MEAL_ID}"`)).toBeLessThan(
      html.indexOf(`href="/log-meal?edit=${olderMealId}"`),
    );
  });

  it("shows the empty state with the guidance nudge when nothing has been logged", () => {
    const html = renderWithDetail(detail({ exposures: [] }));
    expect(html).toContain("No exposures logged yet");
    expect(html).toContain("Offer well-cooked egg in the morning at home.");
    expect(html).not.toContain("/log-meal?edit=");
  });
});

describe("AllergenDetailPage mark/undo actions (item 187)", () => {
  it("offers the shared 'Mark as established' control for a not-yet-established allergen", () => {
    const html = renderWithDetail(detail());
    expect(html).toContain("Mark as established");
    expect(html).not.toContain("Marked by you");
  });

  it("offers the shared 'Marked by you · Undo' control for an override-established allergen", () => {
    const html = renderWithDetail(
      detail({ progress: { ...detail().progress, status: "established", overridden: true } }),
    );
    expect(html).toContain("Marked by you");
    expect(html).toContain(">Undo<");
    expect(html).not.toContain("Mark as established");
  });

  it("offers neither action once the meal log itself established the allergen", () => {
    const html = renderWithDetail(
      detail({ progress: { ...detail().progress, status: "established", overridden: false } }),
    );
    expect(html).not.toContain("Mark as established");
    expect(html).not.toContain("Marked by you");
  });
});
