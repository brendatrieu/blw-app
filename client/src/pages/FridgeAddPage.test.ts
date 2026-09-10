import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { FridgeAddPage } from "./FridgeAddPage.js";

describe("FridgeAddPage", () => {
  it("renders the page title, a Close control, and the add-item form", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(FridgeAddPage, null)),
      ),
    );
    expect(html).toContain("Add to fridge");
    expect(html).toContain('aria-label="Close"');
    expect(html).toContain("From a food");
    expect(html).toContain(">Location<");
  });
});
