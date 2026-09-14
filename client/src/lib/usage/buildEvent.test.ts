import { describe, expect, it } from "vitest";
import {
  ARTICLE_SLUGS,
  ROUTE_PATTERNS,
  USAGE_EVENT_NAMES,
  USAGE_MAX_STRING_LENGTH,
  USAGE_TOUR_SLIDE_MAX,
  usageContextSchema,
  usageEventEnvelopeSchema,
  type UsageContext,
  type UsageEvent,
} from "@blw/shared";
import { safetyArticles } from "../../features/safety/content.js";
import { TOUR_SLIDE_COUNT } from "../../features/tour/slides.js";
import { buildEvent, requiredRoutePattern, resolveEventRoute, usageEventId } from "./buildEvent.js";

/**
 * The privacy invariant, from the client's side: EVERY event the app can
 * send is built here, and every one of them round-trips the shared schema.
 * A prop added without a bucket, a route that arrived as a real pathname, an
 * email that found its way into a payload — all of them fail here rather
 * than at flush time, or worse, in the database.
 */

const CONTEXT: UsageContext = usageContextSchema.parse({
  app_version: "abc123def456",
  standalone: true,
  theme: "dark",
  platform: "ios",
  online: true,
  baby_age_bucket: "6-8",
  baby_count: "1",
  has_ai_key: false,
});

const NOW = new Date("2026-09-13T10:00:00.000Z");

/** One realistic sample per catalog entry. */
const SAMPLES: { [N in UsageEvent["name"]]: Extract<UsageEvent, { name: N }>["props"] } = {
  session_started: {},
  screen_viewed: { route_pattern: "/foods/:slug", from_route: "/foods" },
  meal_logged: {
    food_count: "4-5",
    recipe_kind: "basic",
    from_storage: false,
    via: "food_page",
    leftovers_saved: true,
    has_notes: true,
    is_first_meal: false,
    backdated: "<1h",
    offline: false,
  },
  meal_save_failed: { via: "log_page", kind: "5xx", offline: false },
  storage_item_added: {
    location: "freezer",
    source: "recipe",
    via: "log_leftovers",
    has_servings: true,
    has_best_by: false,
  },
  storage_item_closed: {
    to: "finished",
    via: "serve_depleted",
    freshness_at_change: "use_soon",
    age_days_bucket: "4-7",
  },
  catalog_filtered: {
    catalog: "foods",
    filters: ["iron_level", "max_age_months"],
    has_query: true,
    results: "6-20",
    zero_results: false,
  },
  article_viewed: { article: "gagging-vs-choking", from_route: "/safety" },
  symptom_check_started: {},
  ai_key_saved: { outcome: "invalid_key", attempt: "2" },
  tour_opened: { source: "first_run" },
  tour_completed: { source: "more" },
  tour_skipped: { source: "first_run", slide: 3, via: "overlay" },
  pwa_installed: { display: "standalone" },
  pwa_launch: { display: "browser" },
  offline_entered: { route_pattern: "/log-meal" },
  client_error: { route_pattern: "/*", kind: "chunk_load", status: "none" },
  usage_sharing_changed: { enabled: false },
};

describe("buildEvent — every catalog entry round-trips", () => {
  it("covers exactly the shared catalog, with nothing invented and nothing missed", () => {
    expect(Object.keys(SAMPLES).sort()).toEqual([...USAGE_EVENT_NAMES].sort());
  });

  it.each(USAGE_EVENT_NAMES)("builds a valid envelope for %s", (name) => {
    const envelope = buildEvent(name, SAMPLES[name], { context: CONTEXT, now: NOW, pathname: "/foods/sweet-potato" });
    expect(envelope).not.toBeNull();
    // The envelope the server will parse, parsed the same way the server does.
    expect(() => usageEventEnvelopeSchema.parse(envelope)).not.toThrow();
    expect(envelope!.name).toBe(name);
    expect(envelope!.occurredAt).toBe(NOW.toISOString());
    // A real pathname NEVER survives: what travels is the pattern.
    expect(envelope!.route).toBe("/foods/:slug");
    expect(envelope!.appVersion).toBe(CONTEXT.app_version);
  });

  it("stamps appVersion from the context, so the two copies cannot disagree", () => {
    const envelope = buildEvent("session_started", {}, { context: CONTEXT, now: NOW, pathname: null });
    expect(envelope!.appVersion).toBe(envelope!.context.app_version);
  });

  it("gives each event its own uuid, which is what makes a replayed batch safe", () => {
    const a = buildEvent("session_started", {}, { context: CONTEXT, pathname: null })!;
    const b = buildEvent("session_started", {}, { context: CONTEXT, pathname: null })!;
    expect(a.id).not.toBe(b.id);
    expect(a.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(usageEventId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("pins the tour's slide ceiling against the deck the dialog actually renders", () => {
    expect(USAGE_TOUR_SLIDE_MAX).toBe(TOUR_SLIDE_COUNT - 1);
  });

  it("pins the article slug set against the manifest the Learn pages actually render", () => {
    // `article_viewed` is a closed enum in shared; the articles are MDX files
    // globbed at build time. An article added to one and not the other is a
    // slug that either cannot be reported or reports one that does not exist.
    expect([...ARTICLE_SLUGS].sort()).toEqual(safetyArticles.map((article) => article.slug).sort());
  });
});

describe("buildEvent — what it refuses", () => {
  const options = { context: CONTEXT, now: NOW, pathname: null as string | null, strict: false };

  it("refuses an address-shaped string ANYWHERE in the payload, including the context", () => {
    // Every prop in the catalog is already a closed set, so the PII walk can
    // only ever fire on a mistake — which is exactly what it is for. The
    // context's version string is the one free-form string that exists.
    const context = { ...CONTEXT, app_version: "build@2026-09-13" };
    expect(buildEvent("session_started", {}, { ...options, context })).toBeNull();
  });

  it("refuses a route that arrived as a real pathname rather than a pattern", () => {
    const props = { ...SAMPLES.screen_viewed, from_route: "/foods/sweet-potato" } as never;
    expect(buildEvent("screen_viewed", props, options)).toBeNull();
  });

  it("refuses prose — a note, a search, a stack — by length", () => {
    const context = { ...CONTEXT, app_version: "v".repeat(USAGE_MAX_STRING_LENGTH + 1) };
    expect(buildEvent("session_started", {}, { ...options, context })).toBeNull();
  });

  it("refuses a prop that is not in the closed set, and an extra prop nobody declared", () => {
    expect(buildEvent("meal_logged", { ...SAMPLES.meal_logged, food_count: "7" } as never, options)).toBeNull();
    expect(buildEvent("tour_opened", { source: "first_run", extra: true } as never, options)).toBeNull();
  });

  it("refuses a tour slide past the end of the deck", () => {
    const props = { ...SAMPLES.tour_skipped, slide: TOUR_SLIDE_COUNT } as never;
    expect(buildEvent("tour_skipped", props, options)).toBeNull();
  });

  it("THROWS in a dev build instead, so a bad call site fails where the mistake is", () => {
    expect(() =>
      buildEvent("screen_viewed", { ...SAMPLES.screen_viewed, from_route: "a@b.c" } as never, {
        context: CONTEXT,
        pathname: null,
        strict: true,
      }),
    ).toThrowError(/refused to build "screen_viewed"/);
  });
});

describe("route resolution", () => {
  it("sends null for an event with no screen, and a pattern otherwise", () => {
    expect(resolveEventRoute(null)).toBeNull();
    expect(resolveEventRoute("/storage/6f1c/edit")).toBe("/storage/:id/edit");
    // No browser to ask, no explicit pathname: no route rather than a guess.
    expect(resolveEventRoute(undefined)).toBeNull();
  });

  it("falls back to the catch-all where a pattern is REQUIRED (client_error, offline_entered)", () => {
    expect(requiredRoutePattern()).toBe("/*");
    expect(requiredRoutePattern("/settings")).toBe("/settings");
    expect(ROUTE_PATTERNS).toContain(requiredRoutePattern());
  });
});
