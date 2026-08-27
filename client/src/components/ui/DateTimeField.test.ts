import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildDateOptions,
  centeredRowForIndex,
  clampToNow,
  combineDateTime,
  dayIndexToRow,
  DateTimeField,
  formatDateTimeLabel,
  indexFromScrollTop,
  LOOP_REPEAT_COUNT,
  nowAtMinute,
  PickerSheetFooter,
  recenterRow,
  reindexForCountChange,
  resolveDaysBack,
  resolvePresetDraft,
  rowToDayIndex,
  splitDateTime,
  stepLoopIndex,
  trueIndexFromRow,
  WheelPickerBody,
  WHEEL_ROW_HEIGHT,
  wrapIndex,
  type SplitDateTime,
} from "./DateTimeField.js";

// Wednesday, Aug 26 2026, 10:36 AM local time — matches the memory-recorded
// "today" so relative labels ("Today"/"Yesterday") read naturally in test output.
const NOW = new Date(2026, 7, 26, 10, 36, 0, 0);

/**
 * Slices a rendered wheel-picker's HTML down to just one column's markup, so
 * row-count assertions (e.g. "this label appears N times") aren't polluted
 * by sibling columns that happen to share a label (hour "10" vs. minute
 * "10"). Bounds on `aria-label="<name>"` substrings, which appear only in
 * each column's own opening tag.
 */
function columnHtml(html: string, ariaLabel: string, nextAriaLabel?: string): string {
  const start = html.indexOf(`aria-label="${ariaLabel}"`);
  const end = nextAriaLabel ? html.indexOf(`aria-label="${nextAriaLabel}"`) : html.length;
  return html.slice(start, end);
}

describe("buildDateOptions", () => {
  it("puts Today at index 0 and Yesterday at index 1", () => {
    const options = buildDateOptions(NOW, 5);
    expect(options[0]).toMatchObject({ dayIndex: 0, label: "Today", year: 2026, month: 7, date: 26 });
    expect(options[1]).toMatchObject({ dayIndex: 1, label: "Yesterday", year: 2026, month: 7, date: 25 });
  });

  it("labels dates beyond yesterday as weekday + month + day", () => {
    const options = buildDateOptions(NOW, 5);
    expect(options[2]!.label).toMatch(/\w{3}, Aug 24/);
  });

  it("returns exactly daysBack + 1 options and never a future date", () => {
    const options = buildDateOptions(NOW, 90);
    expect(options).toHaveLength(91);
    for (const option of options) {
      const optionDate = new Date(option.year, option.month, option.date);
      expect(optionDate.getTime()).toBeLessThanOrEqual(new Date(2026, 7, 26).getTime());
    }
    expect(options[90]).toMatchObject({ dayIndex: 90 });
  });

  it("crosses a month boundary correctly", () => {
    const now = new Date(2026, 2, 2, 9, 0); // March 2, 2026
    const options = buildDateOptions(now, 3);
    // 2 days back from Mar 2 is Feb 28 (2026 is not a leap year).
    expect(options[2]).toMatchObject({ dayIndex: 2, year: 2026, month: 1, date: 28 });
  });

  it("crosses a year boundary correctly", () => {
    const now = new Date(2026, 0, 1, 9, 0); // Jan 1, 2026
    const options = buildDateOptions(now, 1);
    expect(options[1]).toMatchObject({ dayIndex: 1, year: 2025, month: 11, date: 31 });
  });
});

describe("resolveDaysBack", () => {
  it("keeps the default when the value is within the window", () => {
    const value = new Date(2026, 7, 20, 9, 0); // 6 days back
    expect(resolveDaysBack(90, value, NOW)).toBe(90);
  });

  it("extends the range to include a value older than the default window", () => {
    const value = new Date(2026, 4, 1, 9, 0); // ~117 days back
    const result = resolveDaysBack(90, value, NOW);
    expect(result).toBeGreaterThanOrEqual(117);
    const options = buildDateOptions(NOW, result);
    expect(options.some((o) => o.year === 2026 && o.month === 4 && o.date === 1)).toBe(true);
  });

  it("never shrinks below the requested default", () => {
    const value = NOW; // today, dayIndex 0
    expect(resolveDaysBack(90, value, NOW)).toBe(90);
  });
});

describe("splitDateTime", () => {
  it("splits midnight as 12 AM", () => {
    const date = new Date(2026, 7, 26, 0, 0);
    expect(splitDateTime(date, NOW)).toEqual({ dayIndex: 0, hour12: 12, minute: 0, meridiem: "AM" });
  });

  it("splits noon as 12 PM", () => {
    const date = new Date(2026, 7, 26, 12, 0);
    expect(splitDateTime(date, NOW)).toEqual({ dayIndex: 0, hour12: 12, minute: 0, meridiem: "PM" });
  });

  it("splits 1 AM and 1 PM correctly", () => {
    expect(splitDateTime(new Date(2026, 7, 26, 1, 15), NOW)).toEqual({
      dayIndex: 0,
      hour12: 1,
      minute: 15,
      meridiem: "AM",
    });
    expect(splitDateTime(new Date(2026, 7, 26, 13, 15), NOW)).toEqual({
      dayIndex: 0,
      hour12: 1,
      minute: 15,
      meridiem: "PM",
    });
  });

  it("splits 11 PM correctly", () => {
    expect(splitDateTime(new Date(2026, 7, 26, 23, 45), NOW)).toEqual({
      dayIndex: 0,
      hour12: 11,
      minute: 45,
      meridiem: "PM",
    });
  });

  it("computes dayIndex relative to now's calendar day, not raw hours", () => {
    // Yesterday at 11pm is only ~11.6h before "now" (10:36am today) but a
    // full calendar day back — dayIndex must be 1, not 0.
    const date = new Date(2026, 7, 25, 23, 0);
    expect(splitDateTime(date, NOW).dayIndex).toBe(1);
  });
});

describe("combineDateTime", () => {
  const base: SplitDateTime = { dayIndex: 0, hour12: 6, minute: 15, meridiem: "PM" };

  it("combines 12 AM to hour 0 (midnight)", () => {
    const result = combineDateTime({ ...base, hour12: 12, meridiem: "AM" }, NOW);
    expect(result.getHours()).toBe(0);
  });

  it("combines 12 PM to hour 12 (noon)", () => {
    const result = combineDateTime({ ...base, hour12: 12, meridiem: "PM" }, NOW);
    expect(result.getHours()).toBe(12);
  });

  it("combines 1 AM to hour 1 and 1 PM to hour 13", () => {
    expect(combineDateTime({ ...base, hour12: 1, meridiem: "AM" }, NOW).getHours()).toBe(1);
    expect(combineDateTime({ ...base, hour12: 1, meridiem: "PM" }, NOW).getHours()).toBe(13);
  });

  it("applies dayIndex against now's calendar day", () => {
    const result = combineDateTime({ ...base, dayIndex: 2 }, NOW);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(7);
    expect(result.getDate()).toBe(24);
  });

  it("round-trips through splitDateTime for every hour/meridiem combination", () => {
    for (let hour12 = 1; hour12 <= 12; hour12++) {
      for (const meridiem of ["AM", "PM"] as const) {
        const parts: SplitDateTime = { dayIndex: 3, hour12, minute: 37, meridiem };
        const combined = combineDateTime(parts, NOW);
        expect(splitDateTime(combined, NOW)).toEqual(parts);
      }
    }
  });
});

describe("clampToNow", () => {
  it("clamps a future date to now", () => {
    const future = new Date(2026, 7, 26, 23, 59);
    expect(clampToNow(future, NOW)).toEqual(NOW);
  });

  it("leaves a past date untouched", () => {
    const past = new Date(2026, 7, 26, 9, 0);
    expect(clampToNow(past, NOW)).toEqual(past);
  });

  it("leaves now itself untouched", () => {
    expect(clampToNow(NOW, NOW)).toEqual(NOW);
  });
});

describe("resolvePresetDraft", () => {
  it("presets normally for a past or present value", () => {
    const value = new Date(2026, 7, 25, 18, 15);
    expect(resolvePresetDraft(value, NOW)).toEqual(splitDateTime(value, NOW));
  });

  it("presets from now when the stored value is future-dated (negative dayIndex)", () => {
    const future = new Date(2026, 7, 28, 9, 0); // 2 calendar days ahead of NOW
    expect(resolvePresetDraft(future, NOW)).toEqual(splitDateTime(NOW, NOW));
  });
});

describe("nowAtMinute", () => {
  it("zeroes seconds and milliseconds off the real current time when called with no argument", () => {
    const result = nowAtMinute();
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it("truncates a given date down to the minute", () => {
    const withSeconds = new Date(2026, 7, 26, 10, 36, 47, 250);
    const result = nowAtMinute(withSeconds);
    expect(result).toEqual(new Date(2026, 7, 26, 10, 36, 0, 0));
  });
});

describe("formatDateTimeLabel", () => {
  it("formats today as 'Today, <time>'", () => {
    const label = formatDateTimeLabel(new Date(2026, 7, 26, 10, 36), NOW);
    expect(label).toMatch(/^Today, 10:36\s?AM$/);
  });

  it("formats yesterday as 'Yesterday, <time>'", () => {
    const label = formatDateTimeLabel(new Date(2026, 7, 25, 18, 15), NOW);
    expect(label).toMatch(/^Yesterday, 6:15\s?PM$/);
  });

  it("formats older dates as weekday, month day, time", () => {
    const label = formatDateTimeLabel(new Date(2026, 7, 24, 18, 15), NOW);
    expect(label).toMatch(/^\w{3}, Aug 24, 6:15\s?PM$/);
  });
});

describe("indexFromScrollTop", () => {
  it("maps scrollTop 0 to index 0", () => {
    expect(indexFromScrollTop(0, WHEEL_ROW_HEIGHT, 10)).toBe(0);
  });

  it("rounds to the nearest row", () => {
    expect(indexFromScrollTop(WHEEL_ROW_HEIGHT * 3 + 5, WHEEL_ROW_HEIGHT, 10)).toBe(3);
    expect(indexFromScrollTop(WHEEL_ROW_HEIGHT * 3 + WHEEL_ROW_HEIGHT / 2 + 1, WHEEL_ROW_HEIGHT, 10)).toBe(4);
  });

  it("clamps to the last valid index when overscrolled past the end", () => {
    expect(indexFromScrollTop(WHEEL_ROW_HEIGHT * 99, WHEEL_ROW_HEIGHT, 10)).toBe(9);
  });

  it("clamps to 0 for a negative scrollTop (rubber-band overscroll)", () => {
    expect(indexFromScrollTop(-20, WHEEL_ROW_HEIGHT, 10)).toBe(0);
  });

  it("returns 0 for an empty list", () => {
    expect(indexFromScrollTop(50, WHEEL_ROW_HEIGHT, 0)).toBe(0);
  });
});

describe("dayIndexToRow / rowToDayIndex (item 45 — reversed date order)", () => {
  it("puts dayIndex 0 (Today) at the LAST row", () => {
    expect(dayIndexToRow(0, 91)).toBe(90);
  });

  it("puts the oldest dayIndex at row 0 (top)", () => {
    expect(dayIndexToRow(90, 91)).toBe(0);
  });

  it("is its own inverse (rowToDayIndex undoes dayIndexToRow)", () => {
    for (let dayIndex = 0; dayIndex <= 10; dayIndex++) {
      const row = dayIndexToRow(dayIndex, 11);
      expect(rowToDayIndex(row, 11)).toBe(dayIndex);
    }
  });
});

describe("wrapIndex (item 46 — loop modulo normalization)", () => {
  it("leaves an in-range index untouched", () => {
    expect(wrapIndex(3, 12)).toBe(3);
  });

  it("wraps an index at or past count back to 0", () => {
    expect(wrapIndex(12, 12)).toBe(0);
    expect(wrapIndex(13, 12)).toBe(1);
  });

  it("wraps a negative offset to the high end", () => {
    expect(wrapIndex(-1, 12)).toBe(11);
    expect(wrapIndex(-13, 12)).toBe(11);
  });

  it("handles boundary rows 0 and count-1", () => {
    expect(wrapIndex(0, 60)).toBe(0);
    expect(wrapIndex(59, 60)).toBe(59);
  });

  it("stays safe for count=2 even though it is never used for a loop column", () => {
    expect(wrapIndex(0, 2)).toBe(0);
    expect(wrapIndex(1, 2)).toBe(1);
    expect(wrapIndex(2, 2)).toBe(0);
    expect(wrapIndex(-1, 2)).toBe(1);
  });

  it("returns 0 for count 0 rather than dividing by zero", () => {
    expect(wrapIndex(5, 0)).toBe(0);
  });
});

describe("centeredRowForIndex / trueIndexFromRow (item 46 — loop scrollTop <-> true index)", () => {
  it("centers a true index in the middle of the repeated copies", () => {
    // 5 copies of 12 hour items: middle copy is copy index 2 -> row 2*12+i.
    expect(centeredRowForIndex(0, 12, 5)).toBe(24);
    expect(centeredRowForIndex(11, 12, 5)).toBe(35);
  });

  it("defaults to LOOP_REPEAT_COUNT copies", () => {
    expect(LOOP_REPEAT_COUNT).toBeGreaterThanOrEqual(5);
    expect(centeredRowForIndex(0, 12)).toBe(centeredRowForIndex(0, 12, LOOP_REPEAT_COUNT));
  });

  it("recovers the true index from any absolute row via modulo", () => {
    expect(trueIndexFromRow(24, 12)).toBe(0);
    expect(trueIndexFromRow(35, 12)).toBe(11);
    expect(trueIndexFromRow(0, 12)).toBe(0);
    expect(trueIndexFromRow(-1, 12)).toBe(11);
  });

  it("round-trips true index -> centered row -> true index for every item", () => {
    for (let i = 0; i < 60; i++) {
      expect(trueIndexFromRow(centeredRowForIndex(i, 60), 60)).toBe(i);
    }
  });

  it("stays safe for count=2 (never used for loop, math must not break)", () => {
    expect(trueIndexFromRow(centeredRowForIndex(1, 2), 2)).toBe(1);
  });
});

describe("recenterRow (item 46 — silent re-center never changes the selected value)", () => {
  it("re-centers a settled row back into the middle copy at the SAME true index", () => {
    // Settled in the first copy (row 3) of a 12-item column -> re-centers to
    // the middle copy at the same true index (3), never a different value.
    const settledRow = 3; // copy 0, true index 3
    const recentered = recenterRow(settledRow, 12);
    expect(trueIndexFromRow(recentered, 12)).toBe(trueIndexFromRow(settledRow, 12));
    expect(recentered).toBe(centeredRowForIndex(3, 12));
  });

  it("re-centers correctly from the last copy too", () => {
    const settledRow = 4 * 60 + 59; // last copy (copy 4 of 5), true index 59
    const recentered = recenterRow(settledRow, 60);
    expect(trueIndexFromRow(recentered, 60)).toBe(59);
  });

  it("is idempotent — re-centering an already-centered row is a no-op", () => {
    const centered = centeredRowForIndex(5, 12);
    expect(recenterRow(centered, 12)).toBe(centered);
  });
});

describe("reindexForCountChange (item 51 — loop column count-change re-derivation)", () => {
  it("wraps a loop column's index into the new (smaller) count and re-centers it", () => {
    // Aug (31 days), day 26 selected (index 25) -> switch to Feb (28 days).
    // clampDayOverflow leaves day 26 untouched (26 <= 28), so the incoming
    // index is already in range: it must be preserved, not silently shifted.
    const result = reindexForCountChange(25, 28, true);
    expect(result.trueIndex).toBe(25);
    expect(result.row).toBe(centeredRowForIndex(25, 28));
  });

  it("wraps a genuinely out-of-range loop index for the new count (defensive)", () => {
    // Aug 31 (index 30) -> Feb (28 days, valid indices 0-27): 30 is now
    // out of range even though a real caller would have clamped it upstream
    // via clampDayOverflow — the wheel itself must not trust that blindly.
    const result = reindexForCountChange(30, 28, true);
    expect(result.trueIndex).toBe(wrapIndex(30, 28));
    expect(result.row).toBe(centeredRowForIndex(wrapIndex(30, 28), 28));
  });

  it("re-centers correctly when the count grows (Feb -> Aug)", () => {
    const result = reindexForCountChange(27, 31, true);
    expect(result.trueIndex).toBe(27);
    expect(result.row).toBe(centeredRowForIndex(27, 31));
  });

  it("clamps a non-loop column's index into the new count instead of wrapping it", () => {
    expect(reindexForCountChange(9, 6, false)).toEqual({ row: 5, trueIndex: 5 });
    expect(reindexForCountChange(2, 6, false)).toEqual({ row: 2, trueIndex: 2 });
  });

  it("never divides by zero for an empty (count 0) column", () => {
    expect(reindexForCountChange(3, 0, false)).toEqual({ row: 0, trueIndex: 0 });
  });
});

describe("stepLoopIndex (item 52 — keyboard-repeat-safe loop stepping)", () => {
  const MIDDLE_BAND_START = Math.floor(LOOP_REPEAT_COUNT / 2) * 12;
  const MIDDLE_BAND_END = MIDDLE_BAND_START + 12 - 1;

  it("steps forward by one true index and stays centered", () => {
    const start = centeredRowForIndex(5, 12);
    const { trueIndex, absRow } = stepLoopIndex(start, 1, 12);
    expect(trueIndex).toBe(6);
    expect(absRow).toBe(centeredRowForIndex(6, 12));
  });

  it("wraps forward past the last index back to 0", () => {
    const start = centeredRowForIndex(11, 12);
    const { trueIndex } = stepLoopIndex(start, 1, 12);
    expect(trueIndex).toBe(0);
  });

  it("wraps backward past 0 to the last index", () => {
    const start = centeredRowForIndex(0, 12);
    const { trueIndex } = stepLoopIndex(start, -1, 12);
    expect(trueIndex).toBe(11);
  });

  it("keeps absRow inside the middle band and trueIndex wrapping correctly over 200 consecutive ups, from every start", () => {
    for (let startIndex = 0; startIndex < 12; startIndex++) {
      let absRow = centeredRowForIndex(startIndex, 12);
      let expectedTrueIndex = startIndex;
      for (let step = 0; step < 200; step++) {
        const result = stepLoopIndex(absRow, -1, 12);
        expectedTrueIndex = wrapIndex(expectedTrueIndex - 1, 12);
        expect(result.trueIndex).toBe(expectedTrueIndex);
        expect(result.absRow).toBeGreaterThanOrEqual(MIDDLE_BAND_START);
        expect(result.absRow).toBeLessThanOrEqual(MIDDLE_BAND_END);
        expect(result.absRow).toBe(centeredRowForIndex(expectedTrueIndex, 12));
        absRow = result.absRow;
      }
    }
  });

  it("keeps absRow inside the middle band over 200 consecutive downs (positive direction) too", () => {
    let absRow = centeredRowForIndex(0, 60);
    let expectedTrueIndex = 0;
    const bandStart = Math.floor(LOOP_REPEAT_COUNT / 2) * 60;
    const bandEnd = bandStart + 60 - 1;
    for (let step = 0; step < 200; step++) {
      const result = stepLoopIndex(absRow, 1, 60);
      expectedTrueIndex = wrapIndex(expectedTrueIndex + 1, 60);
      expect(result.trueIndex).toBe(expectedTrueIndex);
      expect(result.absRow).toBeGreaterThanOrEqual(bandStart);
      expect(result.absRow).toBeLessThanOrEqual(bandEnd);
      absRow = result.absRow;
    }
  });

  it("a later settle at the resulting absRow reports the same true index (no drift on settle)", () => {
    let absRow = centeredRowForIndex(3, 12);
    for (let step = 0; step < 5; step++) {
      absRow = stepLoopIndex(absRow, 1, 12).absRow;
    }
    // Simulate handleScroll's settle path: recenterRow must agree with the
    // trueIndex stepLoopIndex already reported, never silently change it.
    expect(trueIndexFromRow(recenterRow(absRow, 12), 12)).toBe(trueIndexFromRow(absRow, 12));
  });
});

describe("PickerSheetFooter (item 53 — shared Done/Cancel footer)", () => {
  it("renders Done first then Cancel, matching the page forms' primary-first order", () => {
    const html = renderToString(createElement(PickerSheetFooter, { onCancel: () => {}, onSave: () => {} }));
    expect(html).toContain(">Done<");
    expect(html).toContain(">Cancel<");
    expect(html).not.toContain(">Save<");
    expect(html.indexOf(">Done<")).toBeLessThan(html.indexOf(">Cancel<"));
    expect((html.match(/<button/g) ?? []).length).toBe(2);
  });
});

describe("DateTimeField (render)", () => {
  it("renders a closed button showing the formatted value, with aria-haspopup wired", () => {
    const html = renderToString(
      createElement(DateTimeField, {
        id: "when",
        value: new Date(2026, 7, 26, 10, 36),
        onChange: () => {},
        now: NOW,
      }),
    );
    expect(html).toContain("<button");
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/Today, 10:36\s?AM/);
    // Closed: the sheet/dialog markup isn't rendered at all.
    expect(html).not.toContain('role="dialog"');
  });

  it("does not opt the button out of the global focus ring", () => {
    const html = renderToString(
      createElement(DateTimeField, { id: "when", value: NOW, onChange: () => {}, now: NOW }),
    );
    expect(html).not.toContain("data-no-focus-ring");
  });

  it("formats a preset value older than the default 90-day window (range auto-extends)", () => {
    // ~117 days before NOW — outside the default daysBack=90 window.
    const oldValue = new Date(2026, 4, 1, 9, 0);
    const html = renderToString(
      createElement(DateTimeField, { id: "prepared", value: oldValue, onChange: () => {}, now: NOW }),
    );
    expect(html).toMatch(/May 1, 9:00\s?AM/);
  });
});

describe("WheelPickerBody (render)", () => {
  const draft: SplitDateTime = { dayIndex: 0, hour12: 10, minute: 36, meridiem: "AM" };
  const dateOptions = buildDateOptions(NOW, 5);

  it("renders four spinbuttons with the correct ARIA value wiring", () => {
    const html = renderToString(
      createElement(WheelPickerBody, { draft, onDraftChange: () => {}, dateOptions }),
    );
    expect((html.match(/role="spinbutton"/g) ?? []).length).toBe(4);

    // Date column: aria-valuenow is the visual ROW (Today, dayIndex 0, sits
    // at the LAST row of 6 options -> row 5), monotonic with the reversed
    // top-to-bottom presentation; valuetext still names the actual date.
    expect(html).toContain('aria-label="Date"');
    expect(html).toMatch(/aria-label="Date"[^>]*aria-valuemin="0"/);
    expect(html).toMatch(/aria-label="Date"[^>]*aria-valuemax="5"/);
    expect(html).toMatch(/aria-label="Date"[^>]*aria-valuenow="5"/);
    expect(html).toMatch(/aria-label="Date"[^>]*aria-valuetext="Today"/);

    // Hour column: 1-12, no valuetext needed.
    expect(html).toMatch(/aria-label="Hour"[^>]*aria-valuemin="1"/);
    expect(html).toMatch(/aria-label="Hour"[^>]*aria-valuemax="12"/);
    expect(html).toMatch(/aria-label="Hour"[^>]*aria-valuenow="10"/);

    // Minute column: 0-59.
    expect(html).toMatch(/aria-label="Minute"[^>]*aria-valuemin="0"/);
    expect(html).toMatch(/aria-label="Minute"[^>]*aria-valuemax="59"/);
    expect(html).toMatch(/aria-label="Minute"[^>]*aria-valuenow="36"/);

    // AM/PM column: index-based value with a human valuetext.
    expect(html).toMatch(/aria-label="AM or PM"[^>]*aria-valuemin="0"/);
    expect(html).toMatch(/aria-label="AM or PM"[^>]*aria-valuemax="1"/);
    expect(html).toMatch(/aria-label="AM or PM"[^>]*aria-valuenow="0"/);
    expect(html).toMatch(/aria-label="AM or PM"[^>]*aria-valuetext="AM"/);
  });

  it("date column includes an old preset date once the range is extended (item 28)", () => {
    // ~117 days before NOW — outside the default daysBack=90 window; the
    // wheel must still be able to render/select it once extended.
    const oldValue = new Date(2026, 4, 1, 9, 0);
    const effectiveDaysBack = resolveDaysBack(90, oldValue, NOW);
    const extendedOptions = buildDateOptions(NOW, effectiveDaysBack);
    const oldDraft = splitDateTime(oldValue, NOW);
    const html = renderToString(
      createElement(WheelPickerBody, { draft: oldDraft, onDraftChange: () => {}, dateOptions: extendedOptions }),
    );
    expect(html).toMatch(/\w{3}, May 1/);
    expect(html).toMatch(new RegExp(`aria-valuemax="${extendedOptions.length - 1}"`));
  });

  it("reflects a PM draft's AM/PM value and valuetext", () => {
    const html = renderToString(
      createElement(WheelPickerBody, {
        draft: { ...draft, meridiem: "PM" },
        onDraftChange: () => {},
        dateOptions,
      }),
    );
    expect(html).toMatch(/aria-label="AM or PM"[^>]*aria-valuenow="1"/);
    expect(html).toMatch(/aria-label="AM or PM"[^>]*aria-valuetext="PM"/);
  });

  it("renders every wheel column as tab-focusable", () => {
    const html = renderToString(
      createElement(WheelPickerBody, { draft, onDraftChange: () => {}, dateOptions }),
    );
    expect((html.match(/tabindex="0"/g) ?? []).length).toBe(4);
  });

  it("renders a highlight band overlay", () => {
    const html = renderToString(
      createElement(WheelPickerBody, { draft, onDraftChange: () => {}, dateOptions }),
    );
    expect(html).toContain('aria-hidden="true"');
    // Literal 44, NOT the WHEEL_ROW_HEIGHT constant: this pins the 44px
    // touch-target requirement itself, so shrinking the constant fails here.
    expect(WHEEL_ROW_HEIGHT).toBe(44);
    expect(html).toContain("height:44px");
  });

  it("centers the wheel block at ~75% width (item 48)", () => {
    const html = renderToString(
      createElement(WheelPickerBody, { draft, onDraftChange: () => {}, dateOptions }),
    );
    expect(html).toContain("mx-auto");
    expect(html).toContain("w-3/4");
  });

  it("renders the date column oldest-first, Today LAST (item 45)", () => {
    const html = renderToString(
      createElement(WheelPickerBody, { draft, onDraftChange: () => {}, dateOptions }),
    );
    // dateOptions(NOW, 5) -> "Today", "Yesterday", then 4 weekday labels. In
    // the reversed presentation the oldest label renders first in markup
    // order and "Today" renders last.
    const oldestLabel = dateOptions[dateOptions.length - 1]!.label;
    expect(html.indexOf(`>${oldestLabel}<`)).toBeGreaterThanOrEqual(0);
    expect(html.indexOf(`>${oldestLabel}<`)).toBeLessThan(html.indexOf(">Today<"));
    expect(html.indexOf(">Yesterday<")).toBeLessThan(html.indexOf(">Today<"));
  });

  it("renders LOOP_REPEAT_COUNT copies for the hour and minute columns (item 46)", () => {
    const html = renderToString(
      createElement(WheelPickerBody, { draft, onDraftChange: () => {}, dateOptions }),
    );
    const hourHtml = columnHtml(html, "Hour", "Minute");
    const minuteHtml = columnHtml(html, "Minute", "AM or PM");
    // Every logical hour/minute label appears once per repeated copy.
    expect((hourHtml.match(/>10</g) ?? []).length).toBe(LOOP_REPEAT_COUNT);
    expect((minuteHtml.match(/>36</g) ?? []).length).toBe(LOOP_REPEAT_COUNT);
  });

  it("does NOT loop the date or AM/PM columns — each row renders exactly once (item 46)", () => {
    const html = renderToString(
      createElement(WheelPickerBody, { draft, onDraftChange: () => {}, dateOptions }),
    );
    const dateColumnHtml = columnHtml(html, "Date", "Hour");
    const meridiemHtml = columnHtml(html, "AM or PM");
    expect((dateColumnHtml.match(/>Today</g) ?? []).length).toBe(1);
    expect((meridiemHtml.match(/>AM</g) ?? []).length).toBe(1);
    expect((meridiemHtml.match(/>PM</g) ?? []).length).toBe(1);
  });
});
