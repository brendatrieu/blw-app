import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { DashboardPage } from "./DashboardPage.js";

describe("DashboardPage", () => {
  it("renders without throwing (no active baby yet, in the loading/empty states)", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(DashboardPage, null)),
      ),
    );
    // With no babies loaded yet the page is in its loading skeleton state —
    // this is primarily a smoke test that the new sheet-based wiring doesn't
    // crash render, matching the loading branch already covered elsewhere.
    expect(typeof html).toBe("string");
  });
});
