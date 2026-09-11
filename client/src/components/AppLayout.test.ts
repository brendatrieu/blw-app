import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { Baby } from "@blw/shared";
import { babyKeys } from "../features/babies/api.js";
import { AppLayout, isChromelessPath, shouldScrollToTop } from "./AppLayout.js";

function renderLayout(queryClient: QueryClient, pathname = "/") {
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        MemoryRouter,
        { initialEntries: [pathname] },
        createElement(Routes, null, createElement(Route, { path: pathname, element: createElement(AppLayout, null) }, createElement(Route, { index: true, element: createElement("div", null, "content") }))),
      ),
    ),
  );
}

describe("AppLayout header", () => {
  it("renders a single gear settings link, not the old initial-circle avatar menu", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderLayout(queryClient);

    expect(html).toContain('aria-label="Settings"');
    expect(html).toContain('href="/settings"');
    expect(html).toMatch(/aria-label="Settings"[^>]*class="[^"]*min-h-11[^"]*min-w-11/);
    expect(html).not.toContain('aria-haspopup="menu"');
    expect(html).not.toContain("Sign out");
  });

  it("shows the time-of-day greeting alongside the baby's name and age", () => {
    const baby: Baby = {
      id: "baby-1",
      name: "Remy",
      birthDate: "2026-01-01",
      notes: null,
      archived: false,
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(babyKeys.list(false), [baby]);

    const html = renderLayout(queryClient);

    expect(html).toContain("Remy");
    expect(/Good morning|Good afternoon|Good evening/.test(html)).toBe(true);
  });
});

describe("isChromelessPath (item 303)", () => {
  it("is true for the tour and nothing else the app routes to", () => {
    expect(isChromelessPath("/tour")).toBe(true);
    for (const pathname of [
      "/",
      "/more",
      "/settings",
      "/storage",
      "/log-meal",
      "/safety",
      "/chat",
      // Neither a prefix nor a suffix match: only the exact route is chromeless.
      "/tour/",
      "/tour/2",
      "/tourism",
      "/detour",
    ]) {
      expect(isChromelessPath(pathname), pathname).toBe(false);
    }
  });
});

describe("AppLayout chrome", () => {
  it("drops the bottom nav, the header and the nav-height padding on the tour", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderLayout(queryClient, "/tour");

    expect(html).not.toContain("<nav");
    expect(html).not.toContain(">Home<");
    expect(html).not.toContain('aria-label="Settings"');
    expect(html).not.toContain("--nav-height");
    // The page itself still renders — the chrome went, not the outlet.
    expect(html).toContain("content");
  });

  it("keeps both on every other route", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderLayout(queryClient, "/more");

    expect(html).toContain("<nav");
    expect(html).toContain(">Home<");
    expect(html).toContain('aria-label="Settings"');
    expect(html).toContain("--nav-height");
  });
});

describe("shouldScrollToTop", () => {
  it("scrolls to the top on forward navigation but keeps the restored position on back/forward", () => {
    expect(shouldScrollToTop("PUSH")).toBe(true);
    expect(shouldScrollToTop("REPLACE")).toBe(true);
    expect(shouldScrollToTop("POP")).toBe(false);
  });
});
