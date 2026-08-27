import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { PantryEditPage } from "./PantryEditPage.js";

describe("PantryEditPage", () => {
  it("renders the loading state (header, Close control, skeleton) without throwing while the pantry list is still loading", () => {
    // A fresh QueryClient has no cached data yet, so usePantryItems("active")
    // is still pending at render time — this is the only branch reachable
    // synchronously via renderToString (the not-found redirect and the
    // loaded form both depend on the query settling, which needs a real DOM
    // effect loop — see BackButton/DateTimeField for the same convention).
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, { initialEntries: ["/pantry/some-id/edit"] }, createElement(PantryEditPage, null)),
      ),
    );
    expect(html).toContain("Edit item");
    expect(html).toContain('aria-label="Close"');
  });
});
