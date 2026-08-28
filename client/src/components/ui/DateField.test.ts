import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LOOP_REPEAT_COUNT } from "./DateTimeField.js";
import {
  clampDayOverflow,
  clampFutureYmd,
  DateField,
  DateFieldPickerBody,
  DEFAULT_ALLOW_FUTURE,
  daysInMonth,
  formatYmd,
  parseYmd,
  resolveCommittedYmd,
  resolveYearsBack,
  resolveYearsForward,
  type YmdParts,
} from "./DateField.js";

// Wednesday, Aug 26 2026 — matches the DateTimeField test suite's "today".
const NOW = new Date(2026, 7, 26, 10, 36, 0, 0);

/**
 * Slices a rendered wheel-picker's HTML down to just one column's markup —
 * see the identical helper in DateTimeField.test.ts for why (isolating a
 * label count from sibling columns that might share it).
 */
function columnHtml(html: string, ariaLabel: string, nextAriaLabel?: string): string {
  const start = html.indexOf(`aria-label="${ariaLabel}"`);
  const end = nextAriaLabel ? html.indexOf(`aria-label="${nextAriaLabel}"`) : html.length;
  return html.slice(start, end);
}

describe("daysInMonth", () => {
  it("returns 28 for February in a non-leap year", () => {
    expect(daysInMonth(1, 2025)).toBe(28);
  });

  it("returns 29 for February in a leap year", () => {
    expect(daysInMonth(1, 2024)).toBe(29);
  });

  it("returns 28 for a century year not divisible by 400", () => {
    expect(daysInMonth(1, 1900)).toBe(28);
  });

  it("returns 29 for a century year divisible by 400", () => {
    expect(daysInMonth(1, 2000)).toBe(29);
  });

  it("returns the correct length for 30- and 31-day months", () => {
    expect(daysInMonth(3, 2026)).toBe(30); // April
    expect(daysInMonth(0, 2026)).toBe(31); // January
  });
});

describe("parseYmd / formatYmd round-trip", () => {
  it("round-trips a well-formed date string", () => {
    const parts = parseYmd("2026-08-26", NOW);
    expect(parts).toEqual({ year: 2026, month: 7, day: 26 });
    expect(formatYmd(parts)).toBe("2026-08-26");
  });

  it("round-trips a single-digit month and day with zero-padding", () => {
    const parts = parseYmd("2026-01-05", NOW);
    expect(parts).toEqual({ year: 2026, month: 0, day: 5 });
    expect(formatYmd(parts)).toBe("2026-01-05");
  });

  it("falls back to the given date's calendar day for an empty string", () => {
    expect(parseYmd("", NOW)).toEqual({ year: 2026, month: 7, day: 26 });
  });

  it("falls back to the given date's calendar day for a malformed string", () => {
    expect(parseYmd("not-a-date", NOW)).toEqual({ year: 2026, month: 7, day: 26 });
  });
});

describe("clampDayOverflow", () => {
  it("clamps a day that overflows the new month's length", () => {
    const parts: YmdParts = { year: 2026, month: 1, day: 30 }; // Feb 30 doesn't exist
    expect(clampDayOverflow(parts)).toEqual({ year: 2026, month: 1, day: 28 });
  });

  it("clamps to 29 for Feb 30 in a leap year", () => {
    const parts: YmdParts = { year: 2024, month: 1, day: 30 };
    expect(clampDayOverflow(parts)).toEqual({ year: 2024, month: 1, day: 29 });
  });

  it("leaves an in-range day untouched", () => {
    const parts: YmdParts = { year: 2026, month: 3, day: 15 };
    expect(clampDayOverflow(parts)).toEqual(parts);
  });
});

describe("clampFutureYmd", () => {
  it("leaves a past date untouched", () => {
    expect(clampFutureYmd("2026-08-20", NOW)).toBe("2026-08-20");
  });

  it("leaves today's date untouched", () => {
    expect(clampFutureYmd("2026-08-26", NOW)).toBe("2026-08-26");
  });

  it("clamps a future date to today", () => {
    expect(clampFutureYmd("2026-09-01", NOW)).toBe("2026-08-26");
  });

  it("clamps a far-future date to today", () => {
    expect(clampFutureYmd("2030-01-01", NOW)).toBe("2026-08-26");
  });
});

describe("resolveYearsBack", () => {
  it("keeps the default when the preset year is within the window", () => {
    expect(resolveYearsBack(6, 2022, 2026)).toBe(6);
  });

  it("extends the range to include a preset year older than the default window", () => {
    expect(resolveYearsBack(6, 2015, 2026)).toBe(11);
  });

  it("never shrinks below the requested default", () => {
    expect(resolveYearsBack(6, 2026, 2026)).toBe(6);
  });
});

describe("resolveYearsForward", () => {
  it("keeps the default when the preset year is within the window", () => {
    expect(resolveYearsForward(1, 2027, 2026)).toBe(1);
  });

  it("extends the range to include a preset year further out than the default window", () => {
    expect(resolveYearsForward(1, 2030, 2026)).toBe(4);
  });

  it("never shrinks below the requested default", () => {
    expect(resolveYearsForward(1, 2026, 2026)).toBe(1);
  });
});

describe("resolveCommittedYmd (allowFuture commit behavior)", () => {
  it("clamps a future draft to today by default (allowFuture: false), matching clampFutureYmd", () => {
    expect(resolveCommittedYmd("2030-01-01", false, NOW)).toBe("2026-08-26");
  });

  it("commits a future draft unclamped when allowFuture is true", () => {
    expect(resolveCommittedYmd("2030-01-01", true, NOW)).toBe("2030-01-01");
  });

  it("commits a past draft unchanged whether or not allowFuture is set", () => {
    expect(resolveCommittedYmd("2026-08-20", true, NOW)).toBe("2026-08-20");
    expect(resolveCommittedYmd("2026-08-20", false, NOW)).toBe("2026-08-20");
  });
});

describe("DateField's allowFuture default (item 107)", () => {
  // DateField's own `allowFuture = DEFAULT_ALLOW_FUTURE` destructuring
  // default is the ONLY place this value comes from — flipping the
  // constant here fails this test directly, and flipping DateField's
  // destructuring to stop reading it would leave that default undocumented
  // and untied to `resolveCommittedYmd`'s behavior below.
  it("defaults to false: future dates are refused unless a call site opts in with allowFuture", () => {
    expect(DEFAULT_ALLOW_FUTURE).toBe(false);
  });

  it("wired through resolveCommittedYmd (what DateField's Save button actually calls): the default clamps a future draft to today, exactly like every past-only field", () => {
    expect(resolveCommittedYmd("2030-01-01", DEFAULT_ALLOW_FUTURE, NOW)).toBe("2026-08-26");
  });
});

describe("DateField (render)", () => {
  it("renders a closed button showing the formatted value, with aria-haspopup wired", () => {
    const html = renderToString(
      createElement(DateField, { id: "birthdate", value: "2026-03-15", onChange: () => {}, now: NOW }),
    );
    expect(html).toContain("<button");
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/Mar 15, 2026/);
    expect(html).not.toContain('role="dialog"');
  });

  it("shows a placeholder for an unset (\"\") value", () => {
    const html = renderToString(createElement(DateField, { value: "", onChange: () => {}, now: NOW }));
    expect(html).toContain("Select a date");
  });
});

describe("DateFieldPickerBody (render)", () => {
  const draft: YmdParts = { year: 2026, month: 7, day: 26 };

  it("renders three spinbuttons with correct ARIA value wiring", () => {
    const html = renderToString(
      createElement(DateFieldPickerBody, { draft, onDraftChange: () => {}, yearsBack: 6, now: NOW }),
    );
    expect((html.match(/role="spinbutton"/g) ?? []).length).toBe(3);

    expect(html).toMatch(/aria-label="Month"[^>]*aria-valuemin="1"/);
    expect(html).toMatch(/aria-label="Month"[^>]*aria-valuemax="12"/);
    expect(html).toMatch(/aria-label="Month"[^>]*aria-valuenow="8"/);
    expect(html).toMatch(/aria-label="Month"[^>]*aria-valuetext="Aug"/);

    expect(html).toMatch(/aria-label="Day"[^>]*aria-valuemin="1"/);
    expect(html).toMatch(/aria-label="Day"[^>]*aria-valuemax="31"/);
    expect(html).toMatch(/aria-label="Day"[^>]*aria-valuenow="26"/);

    expect(html).toMatch(/aria-label="Year"[^>]*aria-valuenow="2026"/);
  });

  it("shortens the day wheel for February (leap-aware)", () => {
    const febDraft: YmdParts = { year: 2025, month: 1, day: 10 };
    const html = renderToString(
      createElement(DateFieldPickerBody, { draft: febDraft, onDraftChange: () => {}, yearsBack: 6, now: NOW }),
    );
    expect(html).toMatch(/aria-label="Day"[^>]*aria-valuemax="28"/);

    const leapDraft: YmdParts = { year: 2024, month: 1, day: 10 };
    const leapHtml = renderToString(
      createElement(DateFieldPickerBody, { draft: leapDraft, onDraftChange: () => {}, yearsBack: 6, now: NOW }),
    );
    expect(leapHtml).toMatch(/aria-label="Day"[^>]*aria-valuemax="29"/);
  });

  it("extends the year wheel to include a preset older than the default window", () => {
    const oldDraft: YmdParts = { year: 2015, month: 5, day: 1 };
    const html = renderToString(
      createElement(DateFieldPickerBody, { draft: oldDraft, onDraftChange: () => {}, yearsBack: 11, now: NOW }),
    );
    expect(html).toMatch(/aria-label="Year"[^>]*aria-valuemin="2015"/);
    // The year row itself renders even though it isn't the highlighted one.
    expect(html).toContain(">2015<");
  });

  it("renders every wheel column as tab-focusable", () => {
    const html = renderToString(
      createElement(DateFieldPickerBody, { draft, onDraftChange: () => {}, yearsBack: 6, now: NOW }),
    );
    expect((html.match(/tabindex="0"/g) ?? []).length).toBe(3);
  });

  it("renders a highlight band overlay", () => {
    const html = renderToString(
      createElement(DateFieldPickerBody, { draft, onDraftChange: () => {}, yearsBack: 6, now: NOW }),
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("height:44px");
  });

  it("centers the wheel block at ~75% width (item 48)", () => {
    const html = renderToString(
      createElement(DateFieldPickerBody, { draft, onDraftChange: () => {}, yearsBack: 6, now: NOW }),
    );
    expect(html).toContain("mx-auto");
    expect(html).toContain("w-3/4");
  });

  it("loops the month and day columns: LOOP_REPEAT_COUNT copies each (item 46)", () => {
    const html = renderToString(
      createElement(DateFieldPickerBody, { draft, onDraftChange: () => {}, yearsBack: 6, now: NOW }),
    );
    const monthHtml = columnHtml(html, "Month", "Day");
    const dayHtml = columnHtml(html, "Day", "Year");
    // draft = { year: 2026, month: 7 (Aug), day: 26 }.
    expect((monthHtml.match(/>Aug</g) ?? []).length).toBe(LOOP_REPEAT_COUNT);
    expect((dayHtml.match(/>26</g) ?? []).length).toBe(LOOP_REPEAT_COUNT);
  });

  it("extends the year wheel past the current year when yearsForward is set (allowFuture mode)", () => {
    const html = renderToString(
      createElement(DateFieldPickerBody, { draft, onDraftChange: () => {}, yearsBack: 6, yearsForward: 1, now: NOW }),
    );
    expect(html).toMatch(/aria-label="Year"[^>]*aria-valuemax="2027"/);
    expect(html).toContain(">2027<");
  });

  it("defaults to no forward range (yearsForward omitted): the current year is the latest selectable one", () => {
    const html = renderToString(
      createElement(DateFieldPickerBody, { draft, onDraftChange: () => {}, yearsBack: 6, now: NOW }),
    );
    expect(html).toMatch(/aria-label="Year"[^>]*aria-valuemax="2026"/);
    expect(html).not.toContain(">2027<");
  });

  it("does NOT loop the year column — oldest year top, current year bottom, each row once (item 45/46)", () => {
    const html = renderToString(
      createElement(DateFieldPickerBody, { draft, onDraftChange: () => {}, yearsBack: 3, now: NOW }),
    );
    const yearHtml = columnHtml(html, "Year");
    // yearsBack=3 from 2026 -> 2023..2026, oldest (2023) first in markup,
    // current year (2026) last, each rendered exactly once (no loop copies).
    expect((yearHtml.match(/>2026</g) ?? []).length).toBe(1);
    expect(yearHtml.indexOf(">2023<")).toBeLessThan(yearHtml.indexOf(">2026<"));
  });
});

describe("allowFuture default binding (item 108)", () => {
  it("the component destructures allowFuture from DEFAULT_ALLOW_FUTURE — pinned at source level because the open picker (portal) cannot render in this node-env suite", () => {
    const source = readFileSync(new URL("./DateField.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/allowFuture = DEFAULT_ALLOW_FUTURE,/);
    expect(source).not.toMatch(/allowFuture = true,/);
  });
});
