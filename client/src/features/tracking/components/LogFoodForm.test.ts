import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { CelebrationProvider } from "../../../components/ui/Celebration.js";
import { LogFoodForm } from "./LogFoodForm.js";

function renderWithProviders(element: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    createElement(QueryClientProvider, { client: queryClient }, createElement(CelebrationProvider, null, element)),
  );
}

describe("LogFoodForm (render)", () => {
  it("renders the same fields the quick-log form always has", () => {
    const html = renderWithProviders(createElement(LogFoodForm, { babyId: "baby-1", onDone: () => {} }));
    expect(html).toContain(">Food<");
    expect(html).toContain(">When<");
    expect(html).toContain("Reaction note (optional)");
    expect(html).toContain(">Save<");
    expect(html).toContain(">Cancel<");
  });

  it("disables the submit (Save) button while zero foods are selected", () => {
    const html = renderWithProviders(createElement(LogFoodForm, { babyId: "baby-1", onDone: () => {} }));
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled[^>]*>Save</);
  });
});
