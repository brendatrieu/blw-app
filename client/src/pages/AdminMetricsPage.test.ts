import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  METRICS_FEATURES,
  RETENTION_WEEKS,
  USAGE_TOUR_SLIDE_MAX,
  type AdminFeedbackItem,
  type AdminMetricsResponse,
} from "@blw/shared";

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
  feedback: {
    data: undefined as { items: AdminFeedbackItem[] } | undefined,
    isLoading: false,
    isError: false,
  },
  summary: { data: undefined as { new: number; read: number; resolved: number; archived: number } | undefined },
}));

// A whole-module replacement: every admin hook the page (or a panel inside
// it) calls has to appear here, or the page throws before it renders a thing.
vi.mock("../features/admin/hooks.js", () => ({
  useIsAdmin: () => h.admin,
  useAdminMetrics: () => h.metrics,
  useCollaborators: () => h.collaborators,
  useGrantCollaborator: () => ({ mutate: () => {}, isPending: false }),
  useRevokeCollaborator: () => ({ mutate: () => {}, isPending: false }),
  useFeedbackSummary: () => h.summary,
  useAdminFeedback: () => h.feedback,
  useUpdateFeedback: () => ({ mutate: () => {}, isPending: false }),
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
    // The newest week's 28-day window has not closed for everybody in it, so
    // the last stage is null rather than a count that can still only go up.
    { weekStart: "2026-09-07", signups: 8, withBaby: 6, loggedMeal: 4, threeLoggingDays: null },
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
    topRoutes: [
      {
        route: "/foods/:slug",
        kind: "render_crash",
        status: "none",
        count: 3,
        share: 1,
        lastAt: "2026-09-14T09:12:00.000Z",
      },
    ],
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

const FEEDBACK_ITEM: AdminFeedbackItem = {
  id: "11111111-2222-4333-8444-555555555555",
  message: "The storage list\n\nkeeps scrolling to the top.",
  senderEmail: "parent@example.com",
  routePattern: "/storage",
  appVersion: "abc1234",
  status: "new",
  archived: false,
  createdAt: "2026-09-13T15:30:00.000Z",
  readAt: null,
  resolvedAt: null,
};

function render(): string {
  return renderToString(createElement(MemoryRouter, null, createElement(AdminMetricsPage, null)));
}

beforeEach(() => {
  h.admin = { isAdmin: true, isResolved: true };
  h.metrics = { data: FULL, isLoading: false, isError: false, isFetching: false, refetch: () => {} };
  h.collaborators = { data: { collaborators: [] }, isLoading: false, isError: false };
  h.feedback = { data: { items: [FEEDBACK_ITEM] }, isLoading: false, isError: false };
  h.summary = { data: { new: 2, read: 1, resolved: 4, archived: 5 } };
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

  it("reads each signup week's activation against its own signups, and dashes an open window", () => {
    const html = render();
    for (const column of ["Baby ≤24h", "First meal ≤48h", "3 days ≤28d"]) {
      expect(html).toContain(`>${column}<`);
    }
    // Aug 31: 3 of its 4 signups added a baby inside 24 hours. The count comes
    // first because these weeks are small — "75%" alone is three parents.
    expect(html).toContain(">3 · 75%<");
    expect(html).toContain(">2 · 50%<");
    // The newest week's 28-day window is still open: a dash, never a zero.
    // The dash glyph and the bare "not measured yet" both also come from the
    // retention triangle's own nulls in this same HTML, so the pin that has to
    // hold is the cell's own <title> — it names the week and the stage, and
    // only the activation panel can produce it. Turn the null into a zero and
    // this line reads "6 of 8" instead.
    expect(html).toContain(">–<");
    expect(html).toContain("Sep 7, 3 days ≤28d: not measured yet");
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

  it("names the routes the errors land on, in words rather than in kind slugs", () => {
    const html = render();
    expect(html).toContain("/foods/:slug · Screen crashed");
    expect(html).not.toContain("Render crash");
  });

  it("explains every kind that is present, and none that is not", () => {
    const html = render();
    expect(html).toContain("What these mean");
    expect(html).toContain("A page hit a bug and showed the error screen.");
    expect(html).toContain("A code bug: reproduce on that route and fix it.");
    // No api_5xx row in this payload, so no api_5xx entry in the key.
    expect(html).not.toContain("The server failed to answer the request.");
    expect(html).not.toContain("Server error");
  });

  it("dates the most recent error and repeats the rule about what is stored", () => {
    const html = render();
    expect(html).toContain(`the last on ${formatTimestamp("2026-09-14T09:12:00.000Z")}`);
    // renderToString escapes the apostrophe-free sentence as-is; the em dash
    // and the promise are the pins.
    expect(html).toContain("Only the route and kind are recorded");
    expect(html).toContain("messages and stacks never leave the phone.");
    // The status and the last-seen instant reach a screen reader too.
    expect(html).toContain("<th scope=\"col\">Last seen</th>");
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
    // which has nowhere to put an id, an email or a name.
    //
    // The METRICS region is everything from the first KPI tile to the Access
    // panel's heading. It is bounded that way because the page now has two
    // documented exceptions, one at each end: the Inbox above the tiles,
    // which shows one parent's words and the address to answer them at (item
    // 361, pinned below with a real message in the fixture), and the Access
    // panel below, which lists admins to admins. Everything between them is
    // aggregates, and stays that way even with a populated inbox.
    const html = render();
    const start = html.indexOf(">Logging parents<");
    const heading = html.indexOf('id="admin-access-heading"');
    expect(start).toBeGreaterThan(-1);
    expect(heading).toBeGreaterThan(start);
    const metrics = html.slice(start, heading);
    expect(metrics).not.toContain("@");
    expect(metrics).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/);
  });
});

describe("the feedback inbox on the dashboard (item 361)", () => {
  it("leads the page — above the range picker, the tiles and every chart", () => {
    const html = render();
    const inbox = html.indexOf(">Inbox</h2>");
    expect(inbox).toBeGreaterThan(-1);
    expect(inbox).toBeLessThan(html.indexOf('aria-label="Range"'));
    expect(inbox).toBeLessThan(html.indexOf(">Logging parents<"));
    expect(inbox).toBeLessThan(html.indexOf(">Weekly logging parents</h2>"));
  });

  it("offers the three tabs with their counts, opening on Open", () => {
    const html = render();
    expect(html).toContain('aria-label="Feedback filter"');
    // Open is new + read; the other two are their own buckets.
    expect(html).toContain(">Open (3)<");
    expect(html).toContain(">Resolved (4)<");
    expect(html).toContain(">Archived (5)<");
    expect(html).toMatch(/aria-checked="true"[^>]*>(?:<[^>]*>)*Open \(3\)/);
  });

  it("shows the sender as a mailto, with the screen, the build and the age", () => {
    const html = render();
    expect(html).toContain('href="mailto:parent@example.com"');
    expect(html).toContain(">parent@example.com<");
    expect(html).toContain("/storage · vabc1234 · ");
  });

  it("keeps the message exactly as it was typed, blank lines and all", () => {
    const html = render();
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("keeps scrolling to the top.");
  });

  it("offers an unread message Mark read, Resolve and Clear", () => {
    const html = render();
    for (const label of ["Mark read", "Resolve", "Archive"]) {
      expect(html, label).toContain(`>${label}<`);
    }
    // Nothing here deletes: Clear archives, and Archived is the undo.
    expect(html).not.toContain(">Delete<");
  });

  it("drops Mark read once the message has been read", () => {
    h.feedback = { data: { items: [{ ...FEEDBACK_ITEM, status: "read", readAt: "2026-09-13T16:00:00.000Z" }] }, isLoading: false, isError: false };
    const html = render();
    expect(html).not.toContain(">Mark read<");
    expect(html).toContain(">Resolve<");
    expect(html).toContain(">Archive<");
  });

  it("says so plainly when a tab is empty", () => {
    h.feedback = { data: { items: [] }, isLoading: false, isError: false };
    const html = render();
    expect(html).toContain(">Nothing here.<");
    expect(html).not.toContain("parent@example.com");
  });

  it("shows a skeleton while the first list is in flight", () => {
    h.feedback = { data: undefined, isLoading: true, isError: false };
    const html = render();
    expect(html).toContain("skeleton");
    expect(html).not.toContain(">Nothing here.<");
  });

  it("renders even when the metrics payload failed — it has its own queries", () => {
    h.metrics = { data: undefined, isLoading: false, isError: true, isFetching: false, refetch: () => {} };
    const html = render();
    expect(html).toContain(">Inbox</h2>");
    expect(html).toContain(">parent@example.com<");
    expect(html).toContain("Couldn&#x27;t load metrics.");
  });

  it("stays invisible to a non-admin, like the rest of the page", () => {
    h.admin = { isAdmin: false, isResolved: true };
    const html = render();
    for (const word of ["Inbox", "parent@example.com", "Nothing here."]) {
      expect(html, word).not.toContain(word);
    }
  });
});
