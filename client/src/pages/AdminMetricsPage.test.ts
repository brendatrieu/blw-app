import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { METRICS_FEATURES, RETENTION_WEEKS, USAGE_TOUR_SLIDE_MAX, type AdminMetricsResponse } from "@blw/shared";

/**
 * The dashboard's render pins.
 *
 * Two classes of thing are worth testing here and they are different. One is
 * "did every panel render" — a metrics page that quietly loses a panel looks
 * completely fine, which is exactly why the list of headings is a constant
 * the page exports and this file walks. The other is the page's two
 * *security-shaped* behaviours: a non-admin sees the ordinary not-found page
 * with nothing added, and the payload's shape means no email, name or id can
 * reach the screen.
 */

const h = vi.hoisted(() => ({
  admin: { isAdmin: true, isResolved: true },
  metrics: {
    data: undefined as AdminMetricsResponse | undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: () => {},
  },
  collaborators: { data: { collaborators: [] }, isLoading: false, isError: false },
}));

vi.mock("../features/admin/hooks.js", () => ({
  useIsAdmin: () => h.admin,
  useAdminMetrics: () => h.metrics,
  useCollaborators: () => h.collaborators,
  useGrantCollaborator: () => ({ mutate: () => {}, isPending: false }),
  useRevokeCollaborator: () => ({ mutate: () => {}, isPending: false }),
}));

import { formatTimestamp } from "../components/charts/helpers.js";
import { AdminMetricsPage, METRICS_PANEL_TITLES, METRICS_TILE_LABELS } from "./AdminMetricsPage.js";
import { NotFoundPage } from "./NotFoundPage.js";

const FULL: AdminMetricsResponse = {
  meta: {
    range: "12w",
    weeks: 2,
    from: "2026-08-31T00:00:00.000Z",
    to: "2026-09-13T18:30:00.000Z",
    generatedAt: "2026-09-13T18:30:00.000Z",
  },
  signupsPerWeek: [
    { weekStart: "2026-08-24", signups: 2 },
    { weekStart: "2026-08-31", signups: 4 },
    { weekStart: "2026-09-07", signups: 7 },
  ],
  activeUsers: { dau: 6, wau: 14, mau: 31 },
  weeklyLoggingParents: [
    { weekStart: "2026-08-24", parents: 2 },
    { weekStart: "2026-08-31", parents: 5 },
    { weekStart: "2026-09-07", parents: 9 },
  ],
  activationFunnel: [
    { weekStart: "2026-08-31", signups: 4, withBaby: 3, loggedMeal: 2, threeLoggingDays: 1 },
    { weekStart: "2026-09-07", signups: 8, withBaby: 6, loggedMeal: 4, threeLoggingDays: 2 },
  ],
  retentionTriangle: [
    {
      weekStart: "2026-08-31",
      size: 4,
      retained: [3, 2, ...Array.from({ length: RETENTION_WEEKS - 2 }, () => null)],
    },
  ],
  featureAdoption: {
    windowDays: 28,
    denominator: 9,
    features: METRICS_FEATURES.map((feature, index) => ({
      feature,
      users: 9 - index,
      share: (9 - index) / 9,
    })),
  },
  tourOutcomes: {
    opened: 11,
    completed: 6,
    skipped: 5,
    completionRate: 6 / 11,
    skipsBySlide: Array.from({ length: USAGE_TOUR_SLIDE_MAX + 1 }, (_, slide) => ({ slide, skips: slide })),
  },
  catalogFilters: {
    events: 40,
    zeroResults: 6,
    zeroResultRate: 0.15,
    byFilter: [
      { filter: "category", uses: 20, share: 0.5 },
      { filter: "vitamin_c_level", uses: 4, share: 0.1 },
    ],
    zeroResultCombos: [
      { catalog: "foods", filters: ["iron_level", "vitamin_c_level"], hasQuery: false, count: 4 },
    ],
  },
  storageServeThrough: { added: 20, finished: 12, discarded: 3, stillActive: 5, serveThrough: 0.8 },
  learnRanking: [
    { article: "gagging-vs-choking", views: 12, share: 0.6 },
    { article: "unsafe-foods", views: 8, share: 0.4 },
  ],
  symptomTriage: {
    started: 10,
    completed: 7,
    completionRate: 0.7,
    byLevel: [
      { level: "emergency", checks: 1, share: 1 / 7 },
      { level: "monitor_at_home", checks: 4, share: 4 / 7 },
      { level: "contact_doctor_24h", checks: 2, share: 2 / 7 },
    ],
  },
  clientErrors: {
    sessions: 200,
    errors: 3,
    perHundredSessions: 1.5,
    topRoutes: [{ route: "/foods/:slug", kind: "render_crash", count: 3, share: 1 }],
  },
  recentDeploys: [{ sha: "abc1234def56", deployedAt: "2026-09-08T10:00:00.000Z", note: null }],
};

const EMPTY: AdminMetricsResponse = {
  meta: { ...FULL.meta, weeks: 0 },
  signupsPerWeek: [],
  activeUsers: { dau: 0, wau: 0, mau: 0 },
  weeklyLoggingParents: [],
  activationFunnel: [],
  retentionTriangle: [],
  featureAdoption: { windowDays: 28, denominator: 0, features: [] },
  tourOutcomes: { opened: 0, completed: 0, skipped: 0, completionRate: 0, skipsBySlide: [] },
  catalogFilters: { events: 0, zeroResults: 0, zeroResultRate: 0, byFilter: [], zeroResultCombos: [] },
  storageServeThrough: { added: 0, finished: 0, discarded: 0, stillActive: 0, serveThrough: 0 },
  learnRanking: [],
  symptomTriage: { started: 0, completed: 0, completionRate: 0, byLevel: [] },
  clientErrors: { sessions: 0, errors: 0, perHundredSessions: 0, topRoutes: [] },
  recentDeploys: [],
};

function render(): string {
  return renderToString(createElement(MemoryRouter, null, createElement(AdminMetricsPage, null)));
}

beforeEach(() => {
  h.admin = { isAdmin: true, isResolved: true };
  h.metrics = { data: FULL, isLoading: false, isError: false, isFetching: false, refetch: () => {} };
  h.collaborators = { data: { collaborators: [] }, isLoading: false, isError: false };
});

describe("who can see it (item 327)", () => {
  it("gives a non-admin the app's ordinary not-found page, byte for byte", () => {
    // Not a custom "no access" screen, and not a redirect: either one would
    // confirm the route exists, which is the whole thing the server's 404
    // was built to avoid.
    h.admin = { isAdmin: false, isResolved: true };
    const html = render();
    const notFound = renderToString(createElement(MemoryRouter, null, createElement(NotFoundPage, null)));
    expect(html).toBe(notFound);
  });

  it("leaks nothing about the dashboard to a non-admin", () => {
    h.admin = { isAdmin: false, isResolved: true };
    const html = render();
    for (const word of ["Metrics", "admin", "Access", "Retention", "logging parents"]) {
      expect(html).not.toContain(word);
    }
  });

  it("renders nothing at all until the answer lands", () => {
    // A spinner (or a flash of "not found") would be a timing side channel:
    // it would distinguish this route from a genuinely unknown one, which
    // answers instantly.
    h.admin = { isAdmin: false, isResolved: false };
    expect(render()).toBe("");
    h.admin = { isAdmin: true, isResolved: false };
    expect(render()).toBe("");
  });
});

describe("dashboard chrome", () => {
  it("renders every panel, in the order the page declares", () => {
    // Anchored on the heading's own `</h2>`, not on the words: "Signups"
    // is also a KPI tile label, and matching that would pass while the panel
    // itself had gone.
    const html = render();
    let cursor = -1;
    for (const title of METRICS_PANEL_TITLES) {
      const at = html.indexOf(`>${title}</h2>`);
      expect(at, `panel "${title}" is missing`).toBeGreaterThan(-1);
      expect(at, `panel "${title}" is out of order`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it("leads with the KPI tiles", () => {
    const html = render();
    for (const label of METRICS_TILE_LABELS) {
      expect(html, `tile "${label}" is missing`).toContain(`>${label}<`);
    }
    // The first panel heading comes after the last tile label.
    expect(html.indexOf(">Errors per 100 sessions<")).toBeLessThan(
      html.indexOf(">Weekly logging parents</h2>"),
    );
  });

  it("shows the last full week with a delta against the week before, and the running week as 'so far'", () => {
    const html = render();
    // The series' last bucket (9, 7) is the week in progress: it is shown as
    // "so far" and never drives the headline or the delta.
    expect(html).toContain(">5<"); // logging parents, last full week
    expect(html).toContain(">+3<"); // 5 vs 2
    expect(html).toContain("so far this week 9");
    expect(html).toContain(">4<"); // signups, last full week
    expect(html).toContain(">+2<"); // 4 vs 2
    expect(html).toContain("so far this week 7");
    expect(html).toContain(">14<"); // WAU
    expect(html).toContain(">31<"); // MAU
    expect(html).toContain(">1.5<"); // errors per 100 sessions
  });

  it("says the direction in words, never in colour alone", () => {
    const html = render();
    expect(html).toContain("3 more than last week");
    expect(html).toContain("2 more than last week");
  });

  it("offers the three ranges as one radiogroup, defaulting to 12 weeks", () => {
    const html = render();
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Range"');
    for (const label of ["4 weeks", "12 weeks", "26 weeks"]) {
      expect(html).toContain(`>${label}<`);
    }
    expect(html).toMatch(/aria-checked="true"[^>]*>(?:<[^>]*>)*12 weeks/);
  });

  it("stamps the payload's own as-of instant, and offers a refresh", () => {
    const html = render();
    expect(html).toContain(`As of ${formatTimestamp(FULL.meta.to)}`);
    expect(html).toContain(">Refresh<");
  });

  it("shows skeletons while the first payload is in flight", () => {
    h.metrics = { data: undefined, isLoading: true, isError: false, isFetching: true, refetch: () => {} };
    const html = render();
    expect(html).toContain('aria-label="Loading"');
    expect(html).toContain("skeleton");
    expect(html).toContain(">Refreshing…<");
    expect(html).not.toContain(">Retention<");
  });

  it("says so plainly when the payload fails", () => {
    h.metrics = { data: undefined, isLoading: false, isError: true, isFetching: false, refetch: () => {} };
    const html = render();
    // renderToString escapes the apostrophe; the sentence is the pin.
    expect(html).toContain("Couldn&#x27;t load metrics.");
    expect(html).toContain('role="alert"');
  });
});

describe("panels", () => {
  it("marks deploys on the weekly-logging-parents line", () => {
    const html = render();
    expect(html).toContain("Deploy abc1234");
    // Dashed, so it cannot be mistaken for a gridline (which the mark spec
    // fixes as solid).
    expect(html).toContain('stroke-dasharray="3 3"');
  });

  it("runs the activation funnel across the last cohorts, each on its own denominator", () => {
    const html = render();
    for (const stage of ["Signed up", "Added a baby", "First meal", "3 logging days"]) {
      expect(html).toContain(`>${stage}<`);
    }
    // Newest cohort: 2 of 8 reached three logging days.
    expect(html).toContain("2 · 25%");
  });

  it("paints a finished retention window and leaves an unfinished one blank", () => {
    const html = render();
    expect(html).toContain(">75%<"); // 3 of 4 in W1
    expect(html).toContain(">50%<"); // 2 of 4 in W2
    expect(html).toContain(">–<"); // W3 has not closed for the whole cohort
    expect(html).toContain("not measured yet");
    expect(html).toContain(`>W${RETENTION_WEEKS}<`);
  });

  it("reads adoption against the parents who actually log", () => {
    const html = render();
    expect(html).toContain("Share of the 9 parents");
    expect(html).toContain(">Storage<");
    expect(html).toContain(">Symptom check<");
  });

  it("shows tour outcomes and where the skips cluster", () => {
    const html = render();
    expect(html).toContain(">Completion<");
    expect(html).toContain(">55%<"); // 6 of 11
    expect(html).toContain(">Slide 6<");
  });

  it("lists the filter combinations that came back empty", () => {
    const html = render();
    expect(html).toContain("Combinations with no results");
    expect(html).toContain("Iron level, Vitamin C level");
    expect(html).toContain(">Foods<");
  });

  it("reports storage serve-through and the outcomes behind it", () => {
    const html = render();
    expect(html).toContain(">Serve-through<");
    expect(html).toContain(">80%<");
    for (const label of ["Finished", "Discarded", "Still active"]) {
      expect(html).toContain(`>${label}<`);
    }
  });

  it("ranks the Learn articles by share of views", () => {
    const html = render();
    expect(html).toContain(">Gagging vs choking<");
    expect(html).toContain("60% · 12");
  });

  it("splits completed symptom checks by triage level, least urgent first", () => {
    const html = render();
    expect(html.indexOf(">Watch at home<")).toBeLessThan(html.indexOf(">Emergency<"));
    expect(html).toContain(">Call the doctor<");
    expect(html).toContain(">Seen today<"); // present at zero, so the scale is complete
    expect(html).toContain("checks");
  });

  it("names the routes the errors land on", () => {
    const html = render();
    expect(html).toContain("/foods/:slug · Render crash");
  });
});

describe("empty range", () => {
  beforeEach(() => {
    h.metrics = { data: EMPTY, isLoading: false, isError: false, isFetching: false, refetch: () => {} };
  });

  it("still renders every panel, each saying what is missing", () => {
    const html = render();
    for (const title of METRICS_PANEL_TITLES) {
      expect(html, `panel "${title}" disappeared on an empty range`).toContain(`>${title}</h2>`);
    }
    expect(html).toContain("No weeks in this range yet.");
    expect(html).toContain("No signup cohorts in this range yet.");
    expect(html).toContain("Nobody has logged three meals in a week yet.");
    expect(html).toContain("No filtering in this range yet.");
    expect(html).toContain("Nothing has been put in storage in this range.");
    expect(html).toContain("No articles opened in this range.");
    expect(html).toContain("No completed checks in this range.");
  });

  it("reads no errors as good news rather than as a blank", () => {
    expect(render()).toContain("No client errors in this range.");
  });

  it("draws no chart at all rather than an axis with nothing on it", () => {
    // `role="img"` is what a chart is here — the page still has the header's
    // back chevron, which is an `<svg>` and not a chart.
    expect(render()).not.toContain('role="img"');
  });
});

describe("accessibility and privacy", () => {
  it("gives every chart a title, a description and a table of its numbers", () => {
    const html = render();
    const charts = html.split('role="img"').length - 1;
    expect(charts).toBeGreaterThanOrEqual(8);
    expect(html.split("<title").length - 1).toBeGreaterThanOrEqual(charts);
    // Every chart but the stat tiles' sparklines carries a table: a
    // sparkline's numbers are the tile's own value and delta, so a second
    // copy of them would just be noise to a screen reader.
    const sparklines = [...html.matchAll(/aria-label="[^"]*trend"/g)].length;
    expect(sparklines).toBeGreaterThan(0);
    expect(html.split('<table class="sr-only">').length - 1).toBe(charts - sparklines);
  });

  it("paints every mark from a chart token, never a literal colour", () => {
    const html = render();
    const fills = [...html.matchAll(/fill="([^"]+)"/g)].map((match) => match[1]!);
    expect(fills.length).toBeGreaterThan(0);
    for (const fill of fills) {
      expect(fill === "none" || fill.startsWith("var(--"), `unexpected fill ${fill}`).toBe(true);
    }
  });

  it("puts nothing on screen that could identify one parent", () => {
    // Not a promise about the queries — a property of the payload type,
    // which has nowhere to put an id, an email or a name. The Access panel
    // is the one exception and it lists admins, not parents.
    // Everything above the Access panel, which is the documented exception:
    // it lists admins' addresses to admins, and its own field placeholder is
    // the only "@" the page is allowed to hold.
    const html = render();
    const heading = html.indexOf('id="admin-access-heading"');
    expect(heading).toBeGreaterThan(-1);
    const metrics = html.slice(0, heading);
    expect(metrics).not.toContain("@");
    expect(metrics).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/);
  });
});
