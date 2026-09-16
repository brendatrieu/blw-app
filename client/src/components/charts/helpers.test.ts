import { describe, expect, it } from "vitest";
import {
  CHART_LABEL_CHAR_UNITS,
  CHART_RAMP_STEPS,
  RAMP_INK_THRESHOLD,
  areaPath,
  axisLabelIndexes,
  axisMax,
  bandLayout,
  bandStart,
  barPath,
  deltaOf,
  donutArcs,
  fitLabel,
  formatCount,
  formatPercent,
  formatRate,
  formatTimestamp,
  heatStep,
  humanizeKey,
  linePath,
  niceStep,
  niceTicks,
  pointX,
  rampFill,
  rampInk,
  severityFill,
  truncateLabel,
  valueToLength,
  valueToY,
  weekFraction,
  weekLabel,
  weekRangeLabel,
} from "./helpers.js";

describe("ticks", () => {
  it("rounds a raw step up to the next 1 / 2 / 5 × 10ⁿ", () => {
    expect(niceStep(0.3)).toBe(0.5);
    expect(niceStep(1)).toBe(1);
    expect(niceStep(1.75)).toBe(2);
    expect(niceStep(4)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(120)).toBe(200);
  });

  it("never returns zero or a negative step, whatever it is handed", () => {
    // A zero step is an infinite loop in `niceTicks`, not a cosmetic bug.
    expect(niceStep(0)).toBe(1);
    expect(niceStep(-5)).toBe(1);
    expect(niceStep(Number.NaN)).toBe(1);
  });

  it("covers the data and stops on a round number", () => {
    expect(niceTicks(3)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(250)).toEqual([0, 100, 200, 300]);
  });

  it("never steps below a whole number — every axis here counts things", () => {
    // A max of 2 used to step by 0.5, and `formatCount` printed the ticks as
    // 0, 1, 1, 2, 2: each label twice, on gridlines that meant nothing.
    expect(niceTicks(1)).toEqual([0, 1]);
    expect(niceTicks(2)).toEqual([0, 1, 2]);
    expect(niceTicks(4)).toEqual([0, 1, 2, 3, 4]);
    expect(axisMax(2)).toBe(2);
  });

  it("still draws an axis for an all-zero series", () => {
    // Every week empty is a real answer this dashboard has to show, and a
    // single collapsed gridline reads as a broken chart rather than as zero.
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(axisMax(0)).toBe(1);
  });

  it("reports the top tick as the domain the plot height represents", () => {
    expect(axisMax(3)).toBe(3);
    expect(axisMax(7)).toBe(8);
  });
});

describe("scales", () => {
  it("puts zero on the baseline and the max at the top", () => {
    expect(valueToY(0, 10, 100)).toBe(100);
    expect(valueToY(10, 10, 100)).toBe(0);
    expect(valueToY(5, 10, 100)).toBe(50);
  });

  it("flattens to the baseline rather than dividing by zero", () => {
    expect(valueToY(0, 0, 100)).toBe(100);
    expect(valueToLength(5, 0, 100)).toBe(0);
  });

  it("clamps anything outside the domain instead of drawing off-canvas", () => {
    expect(valueToY(20, 10, 100)).toBe(0);
    expect(valueToY(-5, 10, 100)).toBe(100);
    expect(valueToLength(20, 10, 100)).toBe(100);
  });

  it("spreads points edge to edge, and centres a lone one", () => {
    expect(pointX(0, 3, 300)).toBe(0);
    expect(pointX(1, 3, 300)).toBe(150);
    expect(pointX(2, 3, 300)).toBe(300);
    expect(pointX(0, 1, 300)).toBe(150);
  });

  it("reads a fractional index, which is what a deploy marker is", () => {
    expect(pointX(1.5, 5, 400)).toBe(150);
  });
});

describe("band layout", () => {
  it("leaves the surface gap between neighbouring bars", () => {
    const layout = bandLayout(4, 100, { gap: 2 });
    expect(layout.band).toBe(25);
    expect(layout.thickness).toBe(23);
    expect(bandStart(0, layout)).toBe(1);
    expect(bandStart(1, layout)).toBe(26);
  });

  it("caps a bar at 24 units however much room it has", () => {
    // Two bars across 320 units would otherwise be two 158-wide blocks of
    // colour — the mark spec's cap is what keeps it reading as data.
    const layout = bandLayout(2, 320);
    expect(layout.thickness).toBe(24);
    expect(layout.offset).toBe(68);
  });

  it("keeps a bar at least one unit wide when the band is tiny", () => {
    expect(bandLayout(26, 20).thickness).toBe(1);
  });

  it("survives an empty series", () => {
    expect(bandLayout(0, 100)).toEqual({ band: 100, thickness: 0, offset: 0 });
  });
});

describe("axis labels", () => {
  it("labels every point when they all fit", () => {
    expect(axisLabelIndexes(4, 5)).toEqual([0, 1, 2, 3]);
  });

  it("always keeps the first and the last, spreading the rest", () => {
    expect(axisLabelIndexes(26, 4)).toEqual([0, 8, 17, 25]);
    expect(axisLabelIndexes(12, 4)).toEqual([0, 4, 7, 11]);
  });

  it("returns nothing for an empty axis", () => {
    expect(axisLabelIndexes(0)).toEqual([]);
  });
});

describe("paths", () => {
  it("draws a polyline through every value", () => {
    expect(linePath([0, 5, 10], { width: 100, height: 50, max: 10 })).toBe("M0 50 L50 25 L100 0");
  });

  it("closes the area down to the baseline, not to the first point", () => {
    const area = areaPath([5, 10], { width: 100, height: 50, max: 10 });
    expect(area.endsWith("L100 50 L0 50 Z")).toBe(true);
  });

  it("draws nothing for no data", () => {
    expect(linePath([], { width: 100, height: 50, max: 10 })).toBe("");
    expect(areaPath([], { width: 100, height: 50, max: 10 })).toBe("");
  });

  it("rounds a column's TOP corners and leaves its baseline square", () => {
    const d = barPath(0, 10, 20, 40, 4, "up");
    // Starts at the bottom-left corner, un-rounded, and closes along the
    // baseline: a bar that floats off its own zero misstates the value.
    expect(d.startsWith("M0 50")).toBe(true);
    expect(d).toContain("Q0 10 4 10");
    expect(d.endsWith("L20 50 Z")).toBe(true);
  });

  it("rounds a row bar's right-hand end — the data end there", () => {
    const d = barPath(0, 0, 40, 8, 4, "right");
    expect(d.startsWith("M0 0")).toBe(true);
    expect(d).toContain("Q40 0 40 4");
  });

  it("draws nothing for a zero-length bar", () => {
    expect(barPath(0, 0, 0, 8, 4, "right")).toBe("");
    expect(barPath(0, 0, 20, 0, 4, "up")).toBe("");
  });

  it("shrinks the radius rather than overshooting a short bar", () => {
    const d = barPath(0, 46, 20, 4, 4, "up");
    expect(d).toContain("Q0 46 4 46");
    expect(d).not.toContain("NaN");
  });
});

describe("heat steps", () => {
  it("keeps null null — an unfinished window is not a zero", () => {
    // The whole shape of the retention triangle is this distinction.
    expect(heatStep(null, 1)).toBeNull();
    expect(heatStep(undefined, 1)).toBeNull();
    expect(heatStep(Number.NaN, 1)).toBeNull();
  });

  it("spreads 0..max across the five ramp steps", () => {
    expect(heatStep(0, 1)).toBe(1);
    expect(heatStep(0.2, 1)).toBe(1);
    expect(heatStep(0.21, 1)).toBe(2);
    expect(heatStep(0.5, 1)).toBe(3);
    expect(heatStep(1, 1)).toBe(5);
  });

  it("never leaves the ramp, whatever the value", () => {
    expect(heatStep(5, 1)).toBe(5);
    expect(heatStep(-1, 1)).toBe(1);
    expect(heatStep(3, 0)).toBe(1);
  });
});

describe("ramp tokens", () => {
  it("reaches for a token, never a literal colour", () => {
    expect(rampFill(3)).toBe("var(--chart-ramp-3)");
    expect(severityFill(0)).toBe("var(--chart-sev-1)");
    expect(severityFill(3)).toBe("var(--chart-sev-4)");
  });

  it("clamps out-of-range steps into the ramp", () => {
    expect(rampFill(0)).toBe("var(--chart-ramp-1)");
    expect(rampFill(9)).toBe("var(--chart-ramp-5)");
    expect(severityFill(9)).toBe("var(--chart-sev-4)");
  });

  it("switches the cell ink at the documented threshold", () => {
    // styles/contrast.test.ts gates exactly these pairings; the two read the
    // same constant so a change to one cannot slip past the other.
    expect(RAMP_INK_THRESHOLD).toBe(3);
    for (const step of CHART_RAMP_STEPS) {
      expect(rampInk(step)).toBe(
        step < RAMP_INK_THRESHOLD ? "var(--chart-ramp-ink-low)" : "var(--chart-ramp-ink-high)",
      );
    }
  });
});

describe("donut arcs", () => {
  const size = 100;
  const thickness = 20;

  it("splits the ring by share", () => {
    const arcs = donutArcs(
      [
        { label: "a", value: 1 },
        { label: "b", value: 3 },
      ],
      { size, thickness },
    );
    expect(arcs.map((arc) => arc.share)).toEqual([0.25, 0.75]);
    expect(arcs.every((arc) => arc.d.startsWith("M"))).toBe(true);
  });

  it("draws a full ring for a lone slice rather than a degenerate arc", () => {
    // A 360° elliptical arc starts and ends at the same point and renders as
    // nothing — the classic "100% donut is invisible" bug.
    const [only] = donutArcs([{ label: "all", value: 7 }], { size, thickness });
    expect(only!.share).toBe(1);
    expect(only!.d).not.toBe("");
    expect(only!.d.split("A").length - 1).toBe(4);
  });

  it("draws nothing for a zero slice or an empty total", () => {
    const arcs = donutArcs(
      [
        { label: "a", value: 0 },
        { label: "b", value: 0 },
      ],
      { size, thickness },
    );
    expect(arcs.map((arc) => arc.d)).toEqual(["", ""]);
    expect(arcs.map((arc) => arc.share)).toEqual([0, 0]);
  });

  it("skips the gap when there is only one slice to separate", () => {
    const [single] = donutArcs(
      [
        { label: "a", value: 4 },
        { label: "b", value: 0 },
      ],
      { size, thickness },
    );
    expect(single!.share).toBe(1);
    expect(single!.d).not.toBe("");
  });

  it("flags the long way round past a half turn", () => {
    const arcs = donutArcs(
      [
        { label: "big", value: 3 },
        { label: "small", value: 1 },
      ],
      { size, thickness, gapDegrees: 0 },
    );
    expect(arcs[0]!.d).toContain("A50 50 0 1 1");
    expect(arcs[1]!.d).toContain("A50 50 0 0 1");
  });
});

describe("week buckets", () => {
  it("labels a bucket by its UTC date", () => {
    // The server floors these to UTC Mondays; reading them back through a
    // local timezone would slide every label a day for half the planet.
    expect(weekLabel("2026-09-07")).toBe("Sep 7");
    expect(weekLabel("2026-01-01")).toBe("Jan 1");
    expect(weekLabel("2026-12-31")).toBe("Dec 31");
  });

  it("spans the whole week in the long form", () => {
    expect(weekRangeLabel("2026-09-07")).toBe("Sep 7 – Sep 13");
  });

  it("hands back anything that is not a bucket unchanged", () => {
    expect(weekLabel("")).toBe("");
    expect(weekLabel("not-a-date")).toBe("not-a-date");
  });
});

describe("deploy markers", () => {
  const weeks = ["2026-08-31", "2026-09-07", "2026-09-14"];

  it("places a deploy at a fraction of the way through its week", () => {
    expect(weekFraction("2026-08-31T00:00:00Z", weeks)).toBe(0);
    expect(weekFraction("2026-09-07T00:00:00Z", weeks)).toBe(1);
    expect(weekFraction("2026-09-10T12:00:00Z", weeks)).toBeCloseTo(1.5, 5);
  });

  it("drops a deploy outside the plotted range instead of clamping it", () => {
    // A marker pinned to the edge would claim a deploy happened in a week it
    // did not, on the one chart used to read a change against a release.
    expect(weekFraction("2026-08-30T23:59:59Z", weeks)).toBeNull();
    expect(weekFraction("2026-09-21T00:00:00Z", weeks)).toBeNull();
    expect(weekFraction("nonsense", weeks)).toBeNull();
    expect(weekFraction("2026-09-07T00:00:00Z", [])).toBeNull();
  });

  it("includes the very end of the last week", () => {
    expect(weekFraction("2026-09-20T23:59:59Z", weeks)).toBeGreaterThan(2.9);
  });
});

describe("formatting", () => {
  it("groups counts and compacts the big ones", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(1284)).toBe("1,284");
    expect(formatCount(12_900)).toBe("12.9K");
    expect(formatCount(1_200_000)).toBe("1.2M");
    expect(formatCount(Number.NaN)).toBe("—");
  });

  it("prints a 0..1 share as a percentage", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(0.4823)).toBe("48%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0.4823, 1)).toBe("48.2%");
  });

  it("prints a rate to one decimal, trailing zero and all", () => {
    // 1.96 shown as a bare "2" would read as the quality gate tripping when
    // it has not — the decimal is the point.
    expect(formatRate(1.96)).toBe("2.0");
    expect(formatRate(1.25)).toBe("1.3");
    expect(formatRate(2)).toBe("2.0");
    expect(formatRate(0)).toBe("0.0");
    expect(formatRate(Number.NaN)).toBe("—");
  });

  it("spells a key out rather than showing the enum", () => {
    expect(humanizeKey("vitamin_c_level")).toBe("Vitamin C level");
    expect(humanizeKey("gagging-vs-choking")).toBe("Gagging vs choking");
    expect(humanizeKey("storage")).toBe("Storage");
    expect(humanizeKey("")).toBe("");
  });

  it("stamps a local time without leaning on toLocaleString", () => {
    expect(formatTimestamp(new Date(2026, 8, 13, 21, 40))).toBe("Sep 13, 21:40");
    expect(formatTimestamp(new Date(2026, 0, 1, 9, 5))).toBe("Jan 1, 09:05");
    expect(formatTimestamp("nonsense")).toBe("—");
  });
});

describe("deltas", () => {
  it("reports the direction and the size of the change", () => {
    expect(deltaOf(12, 9)).toMatchObject({ direction: "up", label: "+3" });
    expect(deltaOf(9, 12)).toMatchObject({ direction: "down", label: "-3" });
    expect(deltaOf(9, 9)).toMatchObject({ direction: "flat", label: "0" });
  });

  it("keeps direction and GOOD apart, so errors are not congratulated", () => {
    // The same arrow is good news for signups and bad news for errors; a
    // chip coloured by direction alone gets one of the two backwards.
    expect(deltaOf(12, 9).tone).toBe("good");
    expect(deltaOf(12, 9, { upIsGood: false }).tone).toBe("bad");
    expect(deltaOf(9, 12, { upIsGood: false }).tone).toBe("good");
    expect(deltaOf(9, 9, { upIsGood: false }).tone).toBe("neutral");
  });

  it("says the direction in words as well as in an arrow", () => {
    expect(deltaOf(12, 9).description).toBe("3 more than last week");
    expect(deltaOf(9, 12).description).toBe("3 fewer than last week");
    expect(deltaOf(9, 9).description).toBe("no change from last week");
    expect(deltaOf(12, 9, { unit: "parents" }).description).toBe("3 parents more than last week");
  });
});

describe("label fitting", () => {
  it("leaves a label that fits exactly as it is", () => {
    expect(truncateLabel("Storage", 10)).toBe("Storage");
    expect(truncateLabel("Storage", 7)).toBe("Storage");
  });

  it("cuts an over-long label rather than letting it run into its value", () => {
    expect(truncateLabel("Symptom check", 7)).toBe("Sympto…");
    expect(truncateLabel("", 5)).toBe("");
    expect(truncateLabel("Storage", 0)).toBe("");
  });

  it("gives a row's label whatever the value label leaves", () => {
    // A route that fits is left whole; one that cannot is cut, and the
    // ellipsis says so rather than the text simply running under the value.
    const route = "/babies/:id/allergens/:slug · Render crash";
    expect(fitLabel(route, "7 · 58%")).toBe(route);
    const longer = `${route} while offline and retrying`;
    expect(fitLabel(longer, "7 · 58%").length).toBeLessThan(longer.length);
    expect(fitLabel(longer, "7 · 58%").endsWith("…")).toBe(true);
  });

  it("never starves a label down to nothing, however long the value", () => {
    expect(fitLabel("Storage", "a".repeat(200)).length).toBeGreaterThanOrEqual(6);
  });

  it("keeps the fitted label inside the track it has to share", () => {
    const fitted = fitLabel("/babies/:id/allergens/:slug · Render crash", "7 · 58%");
    const used = (fitted.length + "7 · 58%".length) * CHART_LABEL_CHAR_UNITS;
    expect(used).toBeLessThanOrEqual(320);
  });
});
