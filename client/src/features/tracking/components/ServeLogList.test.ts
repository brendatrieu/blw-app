import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { dayKey, dayLabel, timeLabel, ServeLogList } from "./ServeLogList.js";

describe("dayKey", () => {
  it("formats an ISO timestamp as local yyyy-mm-dd", () => {
    expect(dayKey(new Date(2026, 7, 6, 23, 30).toISOString())).toBe("2026-08-06");
  });

  it("pads single-digit months and days", () => {
    expect(dayKey(new Date(2026, 0, 5, 9, 0).toISOString())).toBe("2026-01-05");
  });
});

describe("dayLabel", () => {
  it("labels today's key as 'Today'", () => {
    const todayKey = dayKey(new Date().toISOString());
    expect(dayLabel(todayKey)).toBe("Today");
  });

  it("labels yesterday's key as 'Yesterday'", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(dayLabel(dayKey(yesterday.toISOString()))).toBe("Yesterday");
  });

  it("labels an older date with weekday, month, and day", () => {
    const olderDate = new Date();
    olderDate.setDate(olderDate.getDate() - 10);
    const label = dayLabel(dayKey(olderDate.toISOString()));
    expect(label).toMatch(/^\w+, \w{3} \d{1,2}$/);
  });
});

describe("timeLabel", () => {
  it("formats an ISO timestamp as a localized hour:minute", () => {
    const label = timeLabel(new Date(2026, 7, 26, 14, 5).toISOString());
    expect(label).toMatch(/2:05\s?PM/);
  });

  it("pads minutes under 10", () => {
    const label = timeLabel(new Date(2026, 7, 26, 9, 5).toISOString());
    expect(label).toMatch(/:05/);
  });
});

describe("ServeLogList (render)", () => {
  it("renders the Food log heading (empty/loading branches need a live query client, out of reach here)", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(
      createElement(QueryClientProvider, { client: queryClient }, createElement(ServeLogList, { babyId: "baby-1" })),
    );
    expect(html).toContain("Food log");
  });
});
