import { describe, expect, it } from "vitest";
import {
  ALLERGEN_MAINTENANCE_DAYS,
  allergenDueAt,
  deriveAllergenStatus,
  markAllergenEstablishedInputSchema,
  unionAllergenStatus,
} from "./tracking.js";

// The full precedence table for the derived-ladder/manual-override union, in
// one place. The route (server/src/routes/meals.ts) and the AI baby-profile
// summary (server/src/ai/tools.ts) both call this function, so pinning it
// here pins both: any change to who wins fails right at the rule.
describe("unionAllergenStatus", () => {
  it("leaves every derived status alone when there is no override", () => {
    expect(unionAllergenStatus(0, false)).toEqual({ status: "not_started", overridden: false });
    expect(unionAllergenStatus(1, false)).toEqual({ status: "started", overridden: false });
    expect(unionAllergenStatus(2, false)).toEqual({ status: "started", overridden: false });
    expect(unionAllergenStatus(3, false)).toEqual({ status: "established", overridden: false });
    expect(unionAllergenStatus(9, false)).toEqual({ status: "established", overridden: false });
  });

  it("promotes to established — and flags it — when only the override says so", () => {
    expect(unionAllergenStatus(0, true)).toEqual({ status: "established", overridden: true });
    expect(unionAllergenStatus(1, true)).toEqual({ status: "established", overridden: true });
    expect(unionAllergenStatus(2, true)).toEqual({ status: "established", overridden: true });
  });

  it("lets real exposures win: a stray override on derived-established is not flagged", () => {
    expect(unionAllergenStatus(3, true)).toEqual({ status: "established", overridden: false });
    expect(unionAllergenStatus(50, true)).toEqual({ status: "established", overridden: false });
  });

  it("never downgrades what the meal log derived", () => {
    for (const exposures of [0, 1, 2, 3, 4, 10]) {
      for (const hasOverride of [false, true]) {
        const derived = deriveAllergenStatus(exposures);
        const { status } = unionAllergenStatus(exposures, hasOverride);
        const rank = { not_started: 0, started: 1, established: 2 } as const;
        expect(rank[status]).toBeGreaterThanOrEqual(rank[derived]);
      }
    }
  });

  it("only ever flags `overridden` on an established row", () => {
    for (const exposures of [0, 1, 2, 3, 10]) {
      for (const hasOverride of [false, true]) {
        const { status, overridden } = unionAllergenStatus(exposures, hasOverride);
        if (overridden) expect(status).toBe("established");
      }
    }
  });
});

// The maintenance countdown's whole rule (item 363). The server stamps `dueAt`
// with this and the client only renders what it is given, so the date a parent
// is shown is decided here and nowhere else.
describe("allergenDueAt", () => {
  const exposure = "2026-09-01T12:00:00.000Z";

  it("is one maintenance week after the last exposure, for an established row", () => {
    expect(ALLERGEN_MAINTENANCE_DAYS).toBe(7);
    expect(allergenDueAt(exposure, "established")).toBe("2026-09-08T12:00:00.000Z");
  });

  it("is null for a ladder still being climbed", () => {
    // A started row is paced by the intro guidance (days apart, three
    // exposures), not by a maintenance cadence — there is nothing to be late
    // for yet, so there is no date to show.
    expect(allergenDueAt(exposure, "started")).toBeNull();
    expect(allergenDueAt(exposure, "not_started")).toBeNull();
  });

  it("is null when there is no exposure to count from", () => {
    expect(allergenDueAt(null, "established")).toBeNull();
    expect(allergenDueAt(null, "started")).toBeNull();
    // Garbage in is a null, not an Invalid Date rendered at a parent.
    expect(allergenDueAt("not a date", "established")).toBeNull();
  });

  it("carries the exposure's time of day, so the boundary is an instant not a calendar day", () => {
    expect(allergenDueAt("2026-09-01T23:30:00.000Z", "established")).toBe("2026-09-08T23:30:00.000Z");
  });
});

describe("markAllergenEstablishedInputSchema", () => {
  it("accepts an absent body, an absent date, and a past date", () => {
    expect(markAllergenEstablishedInputSchema.parse({})).toEqual({});
    expect(markAllergenEstablishedInputSchema.parse({ establishedAt: undefined })).toEqual({
      establishedAt: undefined,
    });
    const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(markAllergenEstablishedInputSchema.parse({ establishedAt: past })).toEqual({ establishedAt: past });
  });

  it("refuses a date beyond the one day of slack, naming its own field", () => {
    const far = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const parsed = markAllergenEstablishedInputSchema.safeParse({ establishedAt: far });
    expect(parsed.success).toBe(false);
    // Same slack as `servedAt` — one rule, two fields — but the message says
    // which field a client actually sent wrong.
    expect(parsed.error?.issues[0]?.message).toBe("establishedAt cannot be more than 24h in the future");
  });

  it("keeps the slack, so a parent east of UTC can mark something 'today'", () => {
    const soon = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    expect(markAllergenEstablishedInputSchema.safeParse({ establishedAt: soon }).success).toBe(true);
  });

  it("refuses a non-datetime string", () => {
    expect(markAllergenEstablishedInputSchema.safeParse({ establishedAt: "2026-09-01" }).success).toBe(false);
    expect(markAllergenEstablishedInputSchema.safeParse({ establishedAt: "" }).success).toBe(false);
  });
});
