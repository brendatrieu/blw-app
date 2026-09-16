import { describe, expect, it } from "vitest";
import { ALLERGEN_MAINTENANCE_DAYS, type AllergenProgressItem } from "@blw/shared";
import {
  ALLERGEN_RULE_COPY,
  DUE_BADGE_LABEL,
  REACTION_HINT_COPY,
  RECENCY_HINT_COPY,
  dueAllergens,
  isAllergenDue,
  lastExposureLabel,
  lastServedLabel,
  markedEstablishedAt,
  markIsLatestExposure,
  resolveAllergenRecency,
  resolveAllergenRowAction,
  serveAgainByLabel,
  servingsProgressLabel,
  showsReactionBadge,
} from "./allergenRow.js";

/** Local-time constructor: every day count in this module is measured on
 * LOCAL midnights, so the fixtures have to be local instants too (a UTC
 * literal would land on a different calendar day east/west of the runner). */
function at(year: number, month: number, day: number, hour = 12, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

const NOW = at(2026, 9, 1, 12, 0); // Tuesday, midday.

function daysAgo(days: number, hour = 12): Date {
  return at(2026, 9, 1 - days, hour, 0);
}

function iso(date: Date): string {
  return date.toISOString();
}

/** The weekday name the countdown should print, derived the same way the
 * helper does so the assertion pins the FORMAT and the date it names rather
 * than the runner's locale. */
function weekdayOf(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: "long" });
}

/** A progress item shaped like the server's, so the fixtures can't drift from
 * the contract (`lastExposureAt`/`dueAt` are required, nullable fields). */
function progress(overrides: Partial<AllergenProgressItem> = {}): AllergenProgressItem {
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

/** The server's own rule (`allergenDueAt`), applied to a fixture so each case
 * reads as "last met it then" rather than as a hand-computed date. */
function dueAfter(lastExposure: Date): string {
  return iso(new Date(lastExposure.getTime() + ALLERGEN_MAINTENANCE_DAYS * 24 * 60 * 60 * 1000));
}

/** An established row that last met the allergen at `lastExposure`, via a
 * logged meal. */
function servedAt(lastExposure: Date): AllergenProgressItem {
  return progress({
    status: "established",
    exposures: 3,
    lastServedAt: iso(lastExposure),
    lastExposureAt: iso(lastExposure),
    dueAt: dueAfter(lastExposure),
  });
}

/** An established row whose latest exposure is the parent's mark. */
function markedAt(mark: Date, lastServed: Date | null = null): AllergenProgressItem {
  return progress({
    status: "established",
    overridden: true,
    exposures: lastServed ? 1 : 0,
    lastServedAt: lastServed ? iso(lastServed) : null,
    establishedAt: iso(mark),
    lastExposureAt: iso(mark),
    dueAt: dueAfter(mark),
  });
}

describe("resolveAllergenRowAction", () => {
  it("offers nothing for a derived-established row (the meal log already proves it)", () => {
    expect(resolveAllergenRowAction({ status: "established", overridden: false })).toBe("none");
  });

  it("offers Undo for an override-established row", () => {
    expect(resolveAllergenRowAction({ status: "established", overridden: true })).toBe("undo");
  });

  it("offers Mark for a not_started row", () => {
    expect(resolveAllergenRowAction({ status: "not_started", overridden: false })).toBe("mark");
  });

  it("offers Mark for a started row", () => {
    expect(resolveAllergenRowAction({ status: "started", overridden: false })).toBe("mark");
  });
});

describe("lastServedLabel (item 143)", () => {
  it("reads 'no serves logged yet' when null (override-only row)", () => {
    expect(lastServedLabel(null, NOW)).toBe("no serves logged yet");
  });

  it("reads 'last served today' for a serve earlier the same calendar day", () => {
    expect(lastServedLabel(iso(at(2026, 9, 1, 1, 0)), NOW)).toBe("last served today");
  });

  it("reads 'last served yesterday' at the 1-day boundary", () => {
    expect(lastServedLabel(iso(daysAgo(1)), NOW)).toBe("last served yesterday");
  });

  it("reads 'last served Xd ago' well past 30 days", () => {
    expect(lastServedLabel(iso(daysAgo(30)), NOW)).toBe("last served 30d ago");
    expect(lastServedLabel(iso(daysAgo(45)), NOW)).toBe("last served 45d ago");
  });
});

describe("lastExposureLabel — the latest exposure, in its own words (item 365)", () => {
  it("says 'last served' when the meal log is the latest exposure", () => {
    expect(lastExposureLabel(servedAt(daysAgo(3)), NOW)).toBe("last served 3d ago");
  });

  it("says 'marked' when the parent's mark is newer than the last logged serve", () => {
    expect(lastExposureLabel(markedAt(daysAgo(2), daysAgo(10)), NOW)).toBe("marked 2d ago");
  });

  it("keeps the today/yesterday forms for a mark", () => {
    expect(lastExposureLabel(markedAt(at(2026, 9, 1, 9, 0)), NOW)).toBe("marked today");
    expect(lastExposureLabel(markedAt(daysAgo(1)), NOW)).toBe("marked yesterday");
  });

  it("stays 'last served' when the serve IS the exposure (the two dates agree)", () => {
    const item = servedAt(daysAgo(4));
    expect(markIsLatestExposure(item)).toBe(false);
    expect(lastExposureLabel(item, NOW)).toBe("last served 4d ago");
  });

  it("falls back to 'no serves logged yet' when nothing has happened at all", () => {
    expect(lastExposureLabel(progress({ status: "started" }), NOW)).toBe("no serves logged yet");
  });
});

describe("the maintenance boundary (item 365) — 7 days, counted on local midnights", () => {
  it("is not due the day before the week is up", () => {
    const item = servedAt(daysAgo(ALLERGEN_MAINTENANCE_DAYS - 1));
    expect(isAllergenDue(item.dueAt, NOW)).toBe(false);
  });

  it("flips due on the day the week is up, whatever the hour of the original serve", () => {
    const item = servedAt(daysAgo(ALLERGEN_MAINTENANCE_DAYS, 23));
    // The serve was at 23:00, so `dueAt` is 23:00 today — but the row is due
    // from local midnight, matching the "last served 7d ago" it prints.
    expect(isAllergenDue(item.dueAt, at(2026, 9, 1, 0, 30))).toBe(true);
    expect(lastExposureLabel(item, at(2026, 9, 1, 0, 30))).toBe(`last served ${ALLERGEN_MAINTENANCE_DAYS}d ago`);
  });

  it("is still not due one minute before that midnight", () => {
    const item = servedAt(daysAgo(ALLERGEN_MAINTENANCE_DAYS, 23));
    expect(isAllergenDue(item.dueAt, at(2026, 8, 31, 23, 59))).toBe(false);
  });

  it("stays due long past the boundary", () => {
    expect(isAllergenDue(servedAt(daysAgo(40)).dueAt, NOW)).toBe(true);
  });

  it("is never due without a dueAt (nothing established has no cadence)", () => {
    expect(isAllergenDue(null, NOW)).toBe(false);
  });
});

describe("serveAgainByLabel — the countdown copy (item 365)", () => {
  it("names the weekday the week is up on, not today's", () => {
    const due = at(2026, 9, 2, 12, 0); // Wednesday
    expect(serveAgainByLabel(iso(due), NOW)).toBe(`Serve again by ${weekdayOf(due)}`);
    expect(serveAgainByLabel(iso(due), NOW)).toBe("Serve again by Wednesday");
  });

  it("says 'next' for the full window out, where a bare weekday would read as today", () => {
    // Marked/served today: due is exactly a week away, i.e. today's own
    // weekday — "Serve again by Tuesday" on a Tuesday means nothing.
    const due = at(2026, 9, 8, 9, 0); // Tuesday, a week out
    expect(serveAgainByLabel(iso(due), NOW)).toBe(`Serve again by next ${weekdayOf(due)}`);
    expect(weekdayOf(due)).toBe(weekdayOf(NOW));
  });

  it("has nothing to say once the date has arrived, or with no date at all", () => {
    expect(serveAgainByLabel(iso(NOW), NOW)).toBeNull();
    expect(serveAgainByLabel(iso(daysAgo(1)), NOW)).toBeNull();
    expect(serveAgainByLabel(null, NOW)).toBeNull();
  });
});

describe("resolveAllergenRecency (items 143 + 365 combined gating)", () => {
  it("shows nothing at all for a not_started row", () => {
    expect(resolveAllergenRecency(progress(), NOW)).toEqual({ fact: null, countdown: null, due: false });
  });

  it("shows the fact but no countdown for a started row (the ladder is paced by the guidance)", () => {
    const item = progress({ status: "started", exposures: 1, lastServedAt: iso(daysAgo(2)), lastExposureAt: iso(daysAgo(2)) });
    expect(resolveAllergenRecency(item, NOW)).toEqual({ fact: "last served 2d ago", countdown: null, due: false });
  });

  it("counts down while an established allergen is inside its week", () => {
    const item = servedAt(daysAgo(5));
    const recency = resolveAllergenRecency(item, NOW);
    expect(recency.fact).toBe("last served 5d ago");
    expect(recency.countdown).toBe(`Serve again by ${weekdayOf(new Date(item.dueAt as string))}`);
    expect(recency.due).toBe(false);
  });

  it("drops the countdown and flags due once the week is up", () => {
    const recency = resolveAllergenRecency(servedAt(daysAgo(ALLERGEN_MAINTENANCE_DAYS)), NOW);
    expect(recency.fact).toBe("last served 7d ago");
    expect(recency.countdown).toBeNull();
    expect(recency.due).toBe(true);
  });

  it("counts down from the MARK when that is the latest exposure", () => {
    const recency = resolveAllergenRecency(markedAt(daysAgo(6), daysAgo(30)), NOW);
    expect(recency.fact).toBe("marked 6d ago");
    expect(recency.due).toBe(false);
    expect(recency.countdown).toBe(`Serve again by ${weekdayOf(at(2026, 9, 2))}`);
  });

  it("is due when the mark itself is old enough", () => {
    const recency = resolveAllergenRecency(markedAt(daysAgo(9)), NOW);
    expect(recency.fact).toBe("marked 9d ago");
    expect(recency.due).toBe(true);
  });
});

describe("the due badge's copy (item 365)", () => {
  it("keeps the old sentence available for the badge's title and screen-reader text", () => {
    expect(DUE_BADGE_LABEL).toBe("Serve again soon");
    expect(RECENCY_HINT_COPY).toBe("Consider serving again soon to maintain tolerance.");
  });
});

describe("dueAllergens — Home's nudge input (item 365)", () => {
  const due = servedAt(daysAgo(10));
  const counting = servedAt(daysAgo(2));
  const started = progress({ status: "started", exposures: 1, lastServedAt: iso(daysAgo(40)), lastExposureAt: iso(daysAgo(40)) });

  it("is empty when nothing is due", () => {
    expect(dueAllergens([counting, started, progress()], NOW)).toEqual([]);
  });

  it("returns only the due rows, in the order given", () => {
    expect(dueAllergens([counting, due, started], NOW)).toEqual([due]);
  });

  it("counts every due row", () => {
    expect(dueAllergens([due, markedAt(daysAgo(20)), counting], NOW)).toHaveLength(2);
  });

  it("never counts a row the server gave no dueAt — a stale serve on an unestablished row is not a nag", () => {
    expect(started.dueAt).toBeNull();
    expect(dueAllergens([started], NOW)).toEqual([]);
  });
});

describe("markedEstablishedAt — the date the detail page can name", () => {
  it("is the mark's date for an overridden row whose mark is its latest exposure", () => {
    const item = markedAt(daysAgo(3));
    expect(markedEstablishedAt(item)).toBe(item.establishedAt);
  });

  it("is null for a row nobody marked", () => {
    expect(markedEstablishedAt(servedAt(daysAgo(3)))).toBeNull();
  });

  // The case the inferred version used to drop on the floor: the parent marks
  // peanut in March, serves it yesterday, and the detail page owes them BOTH
  // dates — `lastExposureAt` has moved on to the serve, but the mark is still
  // its own field on the wire.
  it("still names the mark when a later serve has overtaken it in lastExposureAt", () => {
    const mark = daysAgo(90);
    const item = progress({
      status: "established",
      overridden: true,
      exposures: 1,
      lastServedAt: iso(daysAgo(1)),
      establishedAt: iso(mark),
      lastExposureAt: iso(daysAgo(1)),
      dueAt: dueAfter(daysAgo(1)),
    });
    expect(markedEstablishedAt(item)).toBe(iso(mark));
    // The fact line is still the serve's — the mark is older, so it is not
    // the latest exposure and must not be read as one.
    expect(markIsLatestExposure(item)).toBe(false);
    expect(lastExposureLabel(item, NOW)).toBe("last served yesterday");
  });

  // A mark on a row the meal log ALREADY establishes (`overridden: false`)
  // is still a mark the parent made, and the ladder row already says
  // "marked Nd ago" for it when it is the latest exposure.
  it("names the mark on a derived-established row too", () => {
    const mark = daysAgo(2);
    const item = progress({
      status: "established",
      overridden: false,
      exposures: 3,
      lastServedAt: iso(daysAgo(9)),
      establishedAt: iso(mark),
      lastExposureAt: iso(mark),
      dueAt: dueAfter(mark),
    });
    expect(markedEstablishedAt(item)).toBe(iso(mark));
  });
});

// The two facts item 370 adds to a row: how far up the ladder it is, and
// whether the log holds a reaction the parent should act on.
describe("servingsProgressLabel — 'N of 3 servings' (item 370)", () => {
  it("counts a started row toward the rule the header states", () => {
    expect(servingsProgressLabel(progress({ status: "started", exposures: 1 }))).toBe("1 of 3 servings");
    expect(servingsProgressLabel(progress({ status: "started", exposures: 2 }))).toBe("2 of 3 servings");
  });

  it("says nothing for a row with nothing to count or nothing left to count", () => {
    expect(servingsProgressLabel(progress({ status: "not_started", exposures: 0 }))).toBeNull();
    expect(servingsProgressLabel(progress({ status: "established", exposures: 3 }))).toBeNull();
    // Marked-established, no serves at all: the count would be "0 of 3"
    // under a row that already reads Established.
    expect(servingsProgressLabel(progress({ status: "established", overridden: true, exposures: 0 }))).toBeNull();
  });

  it("drops the count once a reaction has paused the row", () => {
    // "3 of 3 servings" next to a Started chip is a contradiction, and even
    // "1 of 3" reads as "two more to go" under advice to call a doctor.
    const paused = progress({ status: "started", exposures: 3, reactionNotedAt: iso(daysAgo(2)) });
    expect(servingsProgressLabel(paused)).toBeNull();
    expect(servingsProgressLabel({ ...paused, exposures: 1 })).toBeNull();
  });

  it("states the rule in the same words the count adds up to", () => {
    expect(ALLERGEN_RULE_COPY).toBe("Established after 3 servings without a reaction.");
    expect(REACTION_HINT_COPY).toBe("Consider talking to your doctor.");
  });
});

describe("showsReactionBadge (item 370)", () => {
  const REACTED = iso(daysAgo(3));

  it("badges a started row the log holds a reaction for", () => {
    expect(showsReactionBadge(progress({ status: "started", exposures: 3, reactionNotedAt: REACTED }))).toBe(true);
  });

  it("badges an established row too — a reaction after the ladder still matters", () => {
    expect(showsReactionBadge(progress({ status: "established", exposures: 4, reactionNotedAt: REACTED }))).toBe(true);
  });

  it("says nothing when the log holds no reaction", () => {
    expect(showsReactionBadge(progress({ status: "started", exposures: 2 }))).toBe(false);
  });

  it("stops once the parent has marked the allergen themselves", () => {
    // The mark IS the parent answering the badge ("we talked to the doctor"),
    // and a badge nobody can dismiss would outlive its own advice.
    const marked = progress({
      status: "established",
      overridden: true,
      exposures: 3,
      reactionNotedAt: REACTED,
      establishedAt: iso(daysAgo(1)),
    });
    expect(showsReactionBadge(marked)).toBe(false);
  });
});

describe("resolveAllergenRecency with a reaction on the log (item 370)", () => {
  const REACTED = iso(daysAgo(9));

  it("stands the maintenance nudge down while the reaction badge is up", () => {
    // Nine days since the last (reactive) serving: the week is up, and the
    // row would otherwise read "Serve again soon" directly above "Talk to
    // your doctor before serving again."
    const item = progress({
      status: "established",
      exposures: 4,
      lastServedAt: REACTED,
      lastExposureAt: REACTED,
      dueAt: dueAfter(daysAgo(9)),
      reactionNotedAt: REACTED,
    });
    expect(isAllergenDue(item.dueAt, NOW)).toBe(true);
    expect(resolveAllergenRecency(item, NOW)).toEqual({ fact: "last served 9d ago", countdown: null, due: false });
  });

  it("silences the countdown too, not just the badge", () => {
    const served = daysAgo(2);
    const item = progress({
      status: "established",
      exposures: 4,
      lastServedAt: iso(served),
      lastExposureAt: iso(served),
      dueAt: dueAfter(served),
      reactionNotedAt: iso(served),
    });
    expect(resolveAllergenRecency(item, NOW).countdown).toBeNull();
  });

  it("brings the nudge back once the parent marks the allergen", () => {
    // The mark clears the badge, so the maintenance cadence resumes — the
    // row is established on the parent's word and paced like any other.
    const item = progress({
      status: "established",
      overridden: true,
      exposures: 1,
      lastServedAt: REACTED,
      establishedAt: REACTED,
      lastExposureAt: REACTED,
      dueAt: dueAfter(daysAgo(9)),
      reactionNotedAt: REACTED,
    });
    expect(resolveAllergenRecency(item, NOW).due).toBe(true);
  });
});

describe("showsReactionBadge after a manual mark (chair tightening)", () => {
  it("hides a reaction the mark already answered, shows one logged after the mark", () => {
    const marked = progress({ status: "established", overridden: true, establishedAt: iso(daysAgo(5)) });
    expect(showsReactionBadge({ ...marked, reactionNotedAt: iso(daysAgo(9)) })).toBe(false);
    expect(showsReactionBadge({ ...marked, reactionNotedAt: iso(daysAgo(2)) })).toBe(true);
  });
});

describe("dueAllergens leaves a reaction-paused row out of Home's count", () => {
  it("counts a due row, but not one carrying the reaction badge", () => {
    const due = progress({
      status: "established",
      exposures: 3,
      lastServedAt: iso(daysAgo(10)),
      lastExposureAt: iso(daysAgo(10)),
      dueAt: dueAfter(daysAgo(10)),
    });
    expect(dueAllergens([due], NOW)).toEqual([due]);
    expect(dueAllergens([{ ...due, reactionNotedAt: iso(daysAgo(1)) }], NOW)).toEqual([]);
  });
});
