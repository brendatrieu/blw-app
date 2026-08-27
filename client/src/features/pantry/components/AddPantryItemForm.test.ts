import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { AddPantryItemForm } from "./AddPantryItemForm.js";

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    createElement(QueryClientProvider, { client: queryClient }, createElement(AddPantryItemForm, { onDone: () => {} })),
  );
}

describe("AddPantryItemForm (render)", () => {
  it("renders the source tabs, the default 'From a food' field, location segments, and Prepared field", () => {
    const html = renderForm();
    expect(html).toContain("From a food");
    expect(html).toContain("From a recipe");
    expect(html).toContain("Free-form");
    expect(html).toContain(">Food<");
    expect(html).toContain(">Location<");
    expect(html).toContain(">Prepared<");
    expect(html).toContain("Quantity note (optional)");
  });

  it("disables the submit button while zero foods are selected in the default 'food' source", () => {
    const html = renderForm();
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled[^>]*>Add to pantry</);
  });

  it("renders Cancel wired to onDone", () => {
    const html = renderForm();
    expect(html).toContain(">Cancel<");
  });
});
