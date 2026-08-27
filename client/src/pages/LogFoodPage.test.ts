import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { LogFoodPage } from "./LogFoodPage.js";

describe("LogFoodPage", () => {
  it("renders without throwing and shows the page title with a Close control (no active baby yet)", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(LogFoodPage, null)),
      ),
    );
    expect(html).toContain("Log meal");
    expect(html).toContain('aria-label="Close"');
  });
});
