import { describe, expect, it } from "vitest";
import {
  lastServedLabel,
  resolveAllergenRecency,
  resolveAllergenRowAction,
  shouldShowRecencyHint,
} from "./allergenRow.js";

const NOW = new Date("2026-09-01T12:00:00.000Z");
function daysAgoIso(days: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  return d.toISOString();
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
    expect(lastServedLabel(new Date(NOW).toISOString(), NOW)).toBe("last served today");
  });

  it("reads 'last served yesterday' at the 1-day boundary", () => {
    expect(lastServedLabel(daysAgoIso(1), NOW)).toBe("last served yesterday");
  });

  it("reads 'last served Xd ago' well past 30 days", () => {
    expect(lastServedLabel(daysAgoIso(30), NOW)).toBe("last served 30d ago");
    expect(lastServedLabel(daysAgoIso(45), NOW)).toBe("last served 45d ago");
  });
});

describe("shouldShowRecencyHint (item 144, threshold edges)", () => {
  it("never fires when never served", () => {
    expect(shouldShowRecencyHint(null, NOW)).toBe(false);
  });

  it("stays false just under the 14-day threshold", () => {
    expect(shouldShowRecencyHint(daysAgoIso(13), NOW)).toBe(false);
  });

  it("flips true exactly at the 14-day threshold", () => {
    expect(shouldShowRecencyHint(daysAgoIso(14), NOW)).toBe(true);
  });

  it("stays true past the threshold", () => {
    expect(shouldShowRecencyHint(daysAgoIso(15), NOW)).toBe(true);
  });
});

describe("resolveAllergenRecency (items 143+144 combined gating)", () => {
  it("shows neither fact nor hint for a not_started row", () => {
    expect(resolveAllergenRecency({ status: "not_started", lastServedAt: null }, NOW)).toEqual({
      fact: null,
      hint: null,
    });
  });

  it("shows the fact but no hint for a recently-served started row", () => {
    expect(resolveAllergenRecency({ status: "started", lastServedAt: daysAgoIso(2) }, NOW)).toEqual({
      fact: "last served 2d ago",
      hint: null,
    });
  });

  it("shows both the fact and the hint once past threshold for an established row", () => {
    const result = resolveAllergenRecency({ status: "established", lastServedAt: daysAgoIso(20) }, NOW);
    expect(result.fact).toBe("last served 20d ago");
    expect(result.hint).toMatch(/serving again soon/);
  });

  it("shows 'no serves logged yet' with no hint for an override-established row with no exposures", () => {
    expect(resolveAllergenRecency({ status: "established", lastServedAt: null }, NOW)).toEqual({
      fact: "no serves logged yet",
      hint: null,
    });
  });
});
