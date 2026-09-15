// The usage contract (item 315). Two things are being pinned here, and the
// second matters more than the first:
//
//   1. every P1 event in the plan's table round-trips with the props it is
//      documented to carry, so the client and the metrics SQL are written
//      against the same names;
//   2. the schema is structurally incapable of carrying anything personal —
//      not "we checked the call sites", but "there is no field of a type that
//      could hold a name, a note or an address". `props are closed sets`
//      below walks every event in the catalog and fails on the first plain
//      string anybody adds.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ARTICLE_SLUGS,
  ROUTE_PATTERNS,
  USAGE_BATCH_MAX,
  USAGE_EVENT_NAMES,
  USAGE_MAX_STRING_LENGTH,
  USAGE_OCCURRED_AT_MAX_FUTURE_MS,
  USAGE_OCCURRED_AT_MAX_PAST_MS,
  USAGE_TOUR_SLIDE_MAX,
  clampOccurredAt,
  findPiiIssue,
  ingestUsageInputSchema,
  usageContextSchema,
  usageEventEnvelopeSchema,
  usageEventSchema,
  type UsageEventName, appVersionSchema } from "./usage.js";

const APP_VERSION = "abc123def456";

const context = {
  app_version: APP_VERSION,
  standalone: true,
  theme: "dark",
  platform: "ios",
  online: true,
  baby_age_bucket: "9-11",
  baby_count: "1",
  has_ai_key: false,
} as const;

/** One valid props object per catalog entry — the shape the client sends. */
const SAMPLE_PROPS: Record<UsageEventName, Record<string, unknown>> = {
  session_started: {},
  screen_viewed: { route_pattern: "/foods/:slug", from_route: "/foods" },
  meal_logged: {
    food_count: "4-5",
    recipe_kind: "basic",
    from_storage: false,
    via: "log_page",
    leftovers_saved: true,
    has_notes: true,
    is_first_meal: false,
    backdated: "<1d",
    offline: false,
  },
  meal_save_failed: { via: "storage_serve", kind: "5xx", offline: false },
  storage_item_added: {
    location: "freezer",
    source: "recipe",
    via: "log_leftovers",
    has_servings: true,
    has_best_by: false,
    // `food_count` is absent here on purpose: a recipe container names no
    // foods of its own, and the prop is optional for exactly that case.
    split: false,
  },
  storage_item_closed: {
    to: "finished",
    via: "serve_depleted",
    freshness_at_change: "use_soon",
    age_days_bucket: "2-3",
  },
  catalog_filtered: {
    catalog: "recipes",
    filters: ["scope", "iron_focus"],
    has_query: true,
    results: "6-20",
    zero_results: false,
  },
  article_viewed: { article: "gagging-vs-choking", from_route: "/safety" },
  symptom_check_started: {},
  ai_key_saved: { outcome: "invalid_key", attempt: "2" },
  tour_opened: { source: "first_run" },
  tour_completed: { source: "more" },
  tour_skipped: { source: "first_run", slide: 3, via: "escape" },
  pwa_installed: { display: "standalone" },
  pwa_launch: { display: "browser" },
  offline_entered: { route_pattern: "/log-meal" },
  client_error: { route_pattern: "/chat/:threadId", kind: "api_5xx", status: "502" },
  usage_sharing_changed: { enabled: false },
  feedback_sent: {},
};

function envelopeFor(name: UsageEventName, overrides: Record<string, unknown> = {}) {
  return {
    id: "8f1b1a9e-6a3d-4b7f-9c2e-0d5a6b7c8d9e",
    name,
    props: SAMPLE_PROPS[name],
    route: "/settings",
    appVersion: APP_VERSION,
    occurredAt: "2026-09-13T10:00:00.000Z",
    context,
    ...overrides,
  };
}

describe("the P1 catalog", () => {
  it("is exactly the 19 events the plan lists, in order", () => {
    expect(USAGE_EVENT_NAMES).toEqual([
      "session_started",
      "screen_viewed",
      "meal_logged",
      "meal_save_failed",
      "storage_item_added",
      "storage_item_closed",
      "catalog_filtered",
      "article_viewed",
      "symptom_check_started",
      "ai_key_saved",
      "tour_opened",
      "tour_completed",
      "tour_skipped",
      "pwa_installed",
      "pwa_launch",
      "offline_entered",
      "client_error",
      "usage_sharing_changed",
      "feedback_sent",
    ]);

    // The exported list and the union it documents cannot drift apart.
    const fromUnion = usageEventSchema.innerType().options.map((option) => option.shape.name.value);
    expect(fromUnion).toEqual([...USAGE_EVENT_NAMES]);
    expect(usageEventEnvelopeSchema.innerType().options.map((o) => o.shape.name.value)).toEqual([
      ...USAGE_EVENT_NAMES,
    ]);
  });

  it("round-trips every event, bare and enveloped", () => {
    for (const name of USAGE_EVENT_NAMES) {
      const event = { name, props: SAMPLE_PROPS[name] };
      expect(usageEventSchema.parse(event), name).toEqual(event);

      const envelope = envelopeFor(name);
      expect(usageEventEnvelopeSchema.parse(envelope), name).toEqual(envelope);
    }
  });

  it("rejects an unknown event name and an unknown prop on a known one", () => {
    expect(usageEventSchema.safeParse({ name: "meal_eaten", props: {} }).success).toBe(false);
    expect(
      usageEventSchema.safeParse({
        name: "tour_opened",
        props: { source: "first_run", note: "Robin loved it" },
      }).success,
    ).toBe(false);
    // And a missing prop is a rejection too, so a half-wired call site is loud.
    expect(usageEventSchema.safeParse({ name: "tour_opened", props: {} }).success).toBe(false);
  });

  it("keeps every prop inside a closed set — no field can hold free text", () => {
    // The privacy invariant, checked structurally rather than by reading the
    // call sites: a plain `z.string()` anywhere under an event's props would
    // be a place a name, a note or a search could be written, so the only
    // leaf types allowed are enums, booleans and bounded ints.
    const allowed = (schema: z.ZodTypeAny, path: string): void => {
      if (schema instanceof z.ZodNullable || schema instanceof z.ZodOptional) {
        allowed(schema.unwrap() as z.ZodTypeAny, path);
        return;
      }
      if (schema instanceof z.ZodArray) {
        allowed(schema.element as z.ZodTypeAny, `${path}[]`);
        return;
      }
      if (schema instanceof z.ZodEnum || schema instanceof z.ZodBoolean) return;
      if (schema instanceof z.ZodNumber) {
        // Bounded ints only: an unbounded number is a counter, and a counter
        // with enough range is an identifier.
        expect(schema.isInt, path).toBe(true);
        expect(schema.maxValue, path).not.toBeNull();
        return;
      }
      throw new Error(`${path}: ${schema.constructor.name} is not a closed set`);
    };

    for (const option of usageEventSchema.innerType().options) {
      const name = option.shape.name.value as string;
      const props = option.shape.props as z.ZodObject<z.ZodRawShape>;
      // Unknown keys are rejected, not stripped — otherwise a stray prop
      // would vanish silently instead of failing the client's own validation.
      expect(props._def.unknownKeys, name).toBe("strict");
      for (const [key, value] of Object.entries(props.shape)) {
        allowed(value as z.ZodTypeAny, `${name}.${key}`);
      }
    }
  });

  it("closes the route and article vocabularies", () => {
    expect(ROUTE_PATTERNS).toContain("/*");
    // A real slug in a path segment is the one way an id could ride along.
    expect(
      usageEventSchema.safeParse({
        name: "screen_viewed",
        props: { route_pattern: "/foods/sweet-potato", from_route: null },
      }).success,
    ).toBe(false);
    expect(
      usageEventSchema.safeParse({
        name: "article_viewed",
        props: { article: "a-note-about-robin", from_route: null },
      }).success,
    ).toBe(false);
    expect(ARTICLE_SLUGS).toContain("gagging-vs-choking");
    expect(USAGE_TOUR_SLIDE_MAX).toBe(5);
    expect(
      usageEventSchema.safeParse({
        name: "tour_skipped",
        props: { source: "more", slide: 6, via: "skip" },
      }).success,
    ).toBe(false);
  });
});

describe("the session context", () => {
  it("round-trips and rejects an unknown key", () => {
    expect(usageContextSchema.parse(context)).toEqual(context);
    expect(usageContextSchema.safeParse({ ...context, user_email: "a@b.com" }).success).toBe(false);
    expect(usageContextSchema.safeParse({ ...context, baby_age_bucket: "7" }).success).toBe(false);
  });
});

describe("findPiiIssue", () => {
  it("finds an address-shaped string anywhere in the payload", () => {
    expect(findPiiIssue("parent@example.com")).toEqual({ path: "", reason: "email_shaped" });
    expect(findPiiIssue({ props: { note: "parent@example.com" } })).toEqual({
      path: "props.note",
      reason: "email_shaped",
    });
    expect(findPiiIssue({ filters: ["ok", "who@where"] })).toEqual({
      path: "filters.1",
      reason: "email_shaped",
    });
  });

  it("finds prose — anything past the length a label or slug could need", () => {
    expect(findPiiIssue("x".repeat(USAGE_MAX_STRING_LENGTH))).toBeNull();
    expect(findPiiIssue({ a: { b: "x".repeat(USAGE_MAX_STRING_LENGTH + 1) } })).toEqual({
      path: "a.b",
      reason: "too_long",
    });
  });

  it("passes everything the catalog actually sends", () => {
    for (const name of USAGE_EVENT_NAMES) {
      expect(findPiiIssue(envelopeFor(name)), name).toBeNull();
    }
    expect(findPiiIssue({ n: 3, b: true, z: null })).toBeNull();
  });
});

describe("the envelope", () => {
  it("rejects a version string that smuggles an address or prose", () => {
    // `app_version` is the only string a build can set freely, which makes it
    // the one place the guard is load-bearing rather than belt-and-braces.
    const withVersion = (version: string) =>
      usageEventEnvelopeSchema.safeParse(
        envelopeFor("session_started", {
          appVersion: version,
          context: { ...context, app_version: version },
        }),
      ).success;

    expect(withVersion("abc123def456")).toBe(true);
    expect(withVersion("build@littlemeals.org")).toBe(false);
    expect(withVersion("x".repeat(USAGE_MAX_STRING_LENGTH + 1))).toBe(false);
  });

  it("refuses two app versions that disagree", () => {
    const parsed = usageEventEnvelopeSchema.safeParse(
      envelopeFor("session_started", { appVersion: "aaaaaaaaaaaa" }),
    );
    expect(parsed.success).toBe(false);
  });

  it("requires a uuid id, an ISO occurredAt and a known route", () => {
    expect(usageEventEnvelopeSchema.safeParse(envelopeFor("session_started", { id: "17" })).success).toBe(
      false,
    );
    expect(
      usageEventEnvelopeSchema.safeParse(envelopeFor("session_started", { occurredAt: "yesterday" }))
        .success,
    ).toBe(false);
    expect(
      usageEventEnvelopeSchema.safeParse(envelopeFor("session_started", { route: "/babies/abc-123" }))
        .success,
    ).toBe(false);
    // Null is a real value: a few events have no screen behind them.
    expect(
      usageEventEnvelopeSchema.safeParse(envelopeFor("session_started", { route: null })).success,
    ).toBe(true);
  });

  it("rejects an extra top-level key rather than quietly dropping it", () => {
    expect(
      usageEventEnvelopeSchema.safeParse(envelopeFor("session_started", { userId: "user-1" })).success,
    ).toBe(false);
  });
});

describe("ingestUsageInputSchema", () => {
  it("takes 1..50 events and nothing else", () => {
    const one = { events: [envelopeFor("pwa_launch")] };
    expect(ingestUsageInputSchema.parse(one)).toEqual(one);

    expect(ingestUsageInputSchema.safeParse({ events: [] }).success).toBe(false);
    expect(
      ingestUsageInputSchema.safeParse({
        events: Array.from({ length: USAGE_BATCH_MAX + 1 }, () => envelopeFor("pwa_launch")),
      }).success,
    ).toBe(false);
    expect(USAGE_BATCH_MAX).toBe(50);

    // No user id from the body, ever — the server takes it from the session.
    expect(
      ingestUsageInputSchema.safeParse({ events: [envelopeFor("pwa_launch")], userId: "user-1" }).success,
    ).toBe(false);
  });

  it("fails the whole batch when one event is bad", () => {
    const result = ingestUsageInputSchema.safeParse({
      events: [envelopeFor("pwa_launch"), envelopeFor("pwa_launch", { props: { display: "kiosk" } })],
    });
    expect(result.success).toBe(false);
  });
});

describe("clampOccurredAt", () => {
  const received = new Date("2026-09-13T12:00:00.000Z");

  it("leaves a sane timestamp alone", () => {
    const sane = new Date("2026-09-13T11:59:00.000Z");
    expect(clampOccurredAt(sane, received).toISOString()).toBe(sane.toISOString());
  });

  it("pulls a stale clock forward and a fast one back", () => {
    const ancient = new Date("2019-01-01T00:00:00.000Z");
    expect(clampOccurredAt(ancient, received).getTime()).toBe(
      received.getTime() - USAGE_OCCURRED_AT_MAX_PAST_MS,
    );

    const future = new Date("2031-01-01T00:00:00.000Z");
    expect(clampOccurredAt(future, received).getTime()).toBe(
      received.getTime() + USAGE_OCCURRED_AT_MAX_FUTURE_MS,
    );
  });

  it("keeps the boundaries themselves", () => {
    const edge = new Date(received.getTime() - USAGE_OCCURRED_AT_MAX_PAST_MS);
    expect(clampOccurredAt(edge, received).getTime()).toBe(edge.getTime());
  });
});

describe("appVersionSchema", () => {
  it("accepts a deploy SHA prefix and a local dev version, and nothing free-form", () => {
    expect(appVersionSchema.safeParse("a518f83c0d1e").success).toBe(true);
    expect(appVersionSchema.safeParse("0.0.0-dev").success).toBe(true);
    expect(appVersionSchema.safeParse("hello world").success).toBe(false);
    expect(appVersionSchema.safeParse("x".repeat(33)).success).toBe(false);
    expect(appVersionSchema.safeParse("").success).toBe(false);
  });
});
