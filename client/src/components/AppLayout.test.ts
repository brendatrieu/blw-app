import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { Baby } from "@blw/shared";
import { babyKeys } from "../features/babies/api.js";
import { AppLayout, shouldScrollToTop } from "./AppLayout.js";

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

describe("AppLayout chrome (item 310 — the tour stopped being a route)", () => {
  it("renders the header and the bottom nav on every route", () => {
    // v1 had a chromeless branch for /tour. The tour is a dialog over the
    // app now, so there is no route left that hides the app's own chrome —
    // and /tour itself is just a Not found.
    for (const pathname of ["/", "/more", "/settings", "/storage", "/tour"]) {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const html = renderLayout(queryClient, pathname);

      expect(html, pathname).toContain("<nav");
      expect(html, pathname).toContain(">Home<");
      expect(html, pathname).toContain('aria-label="Settings"');
      // The outlet still renders under it.
      expect(html, pathname).toContain("content");
    }
  });
});

describe("AppLayout shell column (item 379 — the nav stopped being fixed)", () => {
  it("is at least a viewport tall, dvh preferred over the vh fallback, and reserves no bottom padding", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderLayout(queryClient);

    const column = html.match(/<div class="(mx-auto flex[^"]*max-w-lg flex-col)"/);
    expect(column, html.slice(0, 400)).not.toBeNull();
    const classes = column![1]!.split(" ");
    expect(classes).toContain("min-h-screen");
    // The dvh rule is wrapped in @supports, which is the only way round
    // Tailwind v4 emitting a bare `.min-h-[100dvh]` BEFORE `.min-h-screen` —
    // the fallback would otherwise override the thing it backs up.
    expect(classes).toContain("supports-[height:100dvh]:min-h-[100dvh]");
    expect(classes.indexOf("min-h-screen")).toBeLessThan(
      classes.indexOf("supports-[height:100dvh]:min-h-[100dvh]"),
    );

    // The nav occupies its own space now, so nothing reserves room for it.
    expect(html).not.toMatch(/padding-bottom:calc\(var\(--nav-height\)/);
    expect(html).not.toContain("min-h-full");
  });

  it("renders the nav INSIDE the column, after <main>, not as a sibling overlay", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderLayout(queryClient);

    const main = html.indexOf("<main");
    const mainEnd = html.indexOf("</main>");
    const nav = html.indexOf("<nav");
    expect(main).toBeGreaterThan(-1);
    expect(nav).toBeGreaterThan(mainEnd);
    // ...and still inside the shell column: the column's closing tag comes
    // after the nav, so the nav is the column's last flex child.
    expect(html.indexOf("</nav>")).toBeLessThan(html.lastIndexOf("</div>"));
    expect(html).toMatch(/<nav class="sticky bottom-0 /);
  });
});

describe("shouldScrollToTop", () => {
  it("scrolls to the top on forward navigation but keeps the restored position on back/forward", () => {
    expect(shouldScrollToTop("PUSH")).toBe(true);
    expect(shouldScrollToTop("REPLACE")).toBe(true);
    expect(shouldScrollToTop("POP")).toBe(false);
  });
});
