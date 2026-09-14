import { describe, expect, it } from "vitest";
import {
  BEST_BY_BEFORE_PREPARED_MESSAGE,
  isBestByBeforePrepared,
  resolveFreshness,
  sortActiveByFreshness,
  type FreshnessInput,
} from "./freshness.js";

// Every date in this file is built with the LOCAL-time `new Date(y, m, d, h)`
// constructor and every best-by string names the same local day, so the whole
// suite means the same thing in every timezone CI runs in — the one thing a
// "does the chip say Expired today?" rule can get wrong on someone else's
// machine. `2026-09-14` is month index 8.
const SEPT = 8;

/** A window-derived item: flags exactly as the server sent them. */
function windowItem(overrides: Partial<FreshnessInput> = {}): FreshnessInput {
  return {
    bestBy: null,
    expiresAt: new Date(2026, SEPT, 17, 10).toISOString(),
    useSoon: false,
    expired: false,
    ...overrides,
  };
}

/** The same item with a parent-entered best-by date on it. */
function bestByItem(bestBy: string, overrides: Partial<FreshnessInput> = {}): FreshnessInput {
  return { ...windowItem(overrides), bestBy };
}

describe("resolveFreshness — a best-by date decides it", () => {
  it("calls yesterday's best-by expired", () => {
    const result = resolveFreshness(bestByItem("2026-09-13"), new Date(2026, SEPT, 14, 9));
    expect(result.state).toBe("expired");
    expect(result.source).toBe("best_by");
  });

  it("calls today's best-by use_soon, at the first minute of the day and the last", () => {
    expect(resolveFreshness(bestByItem("2026-09-14"), new Date(2026, SEPT, 14, 0, 0)).state).toBe("use_soon");
    expect(resolveFreshness(bestByItem("2026-09-14"), new Date(2026, SEPT, 14, 23, 59)).state).toBe("use_soon");
  });

  it("calls tomorrow's best-by use_soon", () => {
    expect(resolveFreshness(bestByItem("2026-09-15"), new Date(2026, SEPT, 14, 9)).state).toBe("use_soon");
  });

  it("calls a best-by two days out fresh — even when the server's flags say expired", () => {
    const result = resolveFreshness(
      bestByItem("2026-09-16", { expired: true, useSoon: true }),
      new Date(2026, SEPT, 14, 9),
    );
    expect(result.state).toBe("fresh");
    expect(result.source).toBe("best_by");
  });

  it("calls a past best-by expired even when the server's flags say fresh", () => {
    const result = resolveFreshness(
      bestByItem("2026-09-13", { expired: false, useSoon: false }),
      new Date(2026, SEPT, 14, 9),
    );
    expect(result.state).toBe("expired");
  });

  it("flips at local midnight, not before it: 23:59 on the day is still good, 00:00 after is not", () => {
    expect(resolveFreshness(bestByItem("2026-09-14"), new Date(2026, SEPT, 14, 23, 59, 59)).state).toBe("use_soon");
    expect(resolveFreshness(bestByItem("2026-09-14"), new Date(2026, SEPT, 15, 0, 0, 0)).state).toBe("expired");
  });

  it("ends at local midnight AFTER the named day — the day itself is still good", () => {
    const result = resolveFreshness(bestByItem("2026-09-14"), new Date(2026, SEPT, 14, 9));
    expect(result.endsAt.getTime()).toBe(new Date(2026, SEPT, 15, 0, 0, 0, 0).getTime());
  });
});

describe("resolveFreshness — no best-by date passes the server's flags through", () => {
  it("reports fresh / use_soon / expired exactly as the flags say", () => {
    const now = new Date(2026, SEPT, 14, 9);
    expect(resolveFreshness(windowItem(), now).state).toBe("fresh");
    expect(resolveFreshness(windowItem({ useSoon: true }), now).state).toBe("use_soon");
    expect(resolveFreshness(windowItem({ expired: true, useSoon: true }), now).state).toBe("expired");
  });

  it("marks the source as the window and ends at the server's expiresAt", () => {
    const result = resolveFreshness(windowItem(), new Date(2026, SEPT, 14, 9));
    expect(result.source).toBe("window");
    expect(result.endsAt.getTime()).toBe(new Date(2026, SEPT, 17, 10).getTime());
  });

  it("treats an empty-string best-by (a cleared field) as unset", () => {
    expect(resolveFreshness(bestByItem("", { useSoon: true }), new Date(2026, SEPT, 14, 9)).source).toBe("window");
  });
});

describe("sortActiveByFreshness", () => {
  const now = new Date(2026, SEPT, 14, 9);

  it("puts a best-by-tomorrow item ahead of a window item with three days left", () => {
    const soon = { ...bestByItem("2026-09-15"), id: "soon" };
    const later = { ...windowItem({ expiresAt: new Date(2026, SEPT, 17, 9).toISOString() }), id: "later" };
    expect(sortActiveByFreshness([later, soon], now).map((i) => i.id)).toEqual(["soon", "later"]);
  });

  it("interleaves best-by and window items on the one scale", () => {
    const items = [
      { ...windowItem({ expiresAt: new Date(2026, SEPT, 18, 9).toISOString() }), id: "window-18th" },
      { ...bestByItem("2026-09-14"), id: "best-by-today" },
      { ...windowItem({ expiresAt: new Date(2026, SEPT, 16, 9).toISOString() }), id: "window-16th" },
      { ...bestByItem("2026-09-20"), id: "best-by-20th" },
    ];
    expect(sortActiveByFreshness(items, now).map((i) => i.id)).toEqual([
      "best-by-today",
      "window-16th",
      "window-18th",
      "best-by-20th",
    ]);
  });

  it("is stable: items ending at the same instant keep the order they arrived in", () => {
    const a = { ...bestByItem("2026-09-16"), id: "a" };
    const b = { ...bestByItem("2026-09-16"), id: "b" };
    const c = { ...bestByItem("2026-09-16"), id: "c" };
    expect(sortActiveByFreshness([a, b, c], now).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(sortActiveByFreshness([c, a, b], now).map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("never mutates the array it was given — it is a react-query cache value", () => {
    const items = [
      { ...windowItem({ expiresAt: new Date(2026, SEPT, 18, 9).toISOString() }), id: "late" },
      { ...bestByItem("2026-09-14"), id: "early" },
    ];
    sortActiveByFreshness(items, now);
    expect(items.map((i) => i.id)).toEqual(["late", "early"]);
  });
});

describe("isBestByBeforePrepared", () => {
  const prepared = new Date(2026, SEPT, 14, 10);

  it("is true only for a date before the prepared calendar day", () => {
    expect(isBestByBeforePrepared("2026-09-13", prepared)).toBe(true);
    expect(isBestByBeforePrepared("2026-08-31", prepared)).toBe(true);
    expect(isBestByBeforePrepared("2025-12-31", prepared)).toBe(true);
  });

  it("is false on the prepared day itself and after it", () => {
    expect(isBestByBeforePrepared("2026-09-14", prepared)).toBe(false);
    expect(isBestByBeforePrepared("2026-09-15", prepared)).toBe(false);
    expect(isBestByBeforePrepared("2027-01-01", prepared)).toBe(false);
  });

  it("compares LOCAL calendar days, so a late-evening prepare is not a day ahead of itself", () => {
    expect(isBestByBeforePrepared("2026-09-14", new Date(2026, SEPT, 14, 23, 45))).toBe(false);
    expect(isBestByBeforePrepared("2026-09-14", new Date(2026, SEPT, 14, 0, 1))).toBe(false);
  });

  it("treats an unset best-by, an unset prepared date, and an unparseable one as fine", () => {
    expect(isBestByBeforePrepared("", prepared)).toBe(false);
    expect(isBestByBeforePrepared(null, prepared)).toBe(false);
    expect(isBestByBeforePrepared("2026-09-13", null)).toBe(false);
    expect(isBestByBeforePrepared("2026-09-13", "not a date")).toBe(false);
  });

  it("accepts an ISO string for the prepared side, the shape the forms serialize", () => {
    expect(isBestByBeforePrepared("2026-09-13", new Date(2026, SEPT, 14, 10).toISOString())).toBe(true);
  });
});

describe("BEST_BY_BEFORE_PREPARED_MESSAGE", () => {
  it("is the one sentence all three forms show", () => {
    expect(BEST_BY_BEFORE_PREPARED_MESSAGE).toBe("Best by can't be before the prepared date");
  });
});
