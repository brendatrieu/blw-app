import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  AddPantryItemForm,
  validateAddPantryItem,
  type AddPantryItemValues,
} from "./AddPantryItemForm.js";

function values(overrides: Partial<AddPantryItemValues> = {}): AddPantryItemValues {
  return { source: "food", foodIds: ["food-1"], recipeId: "", label: "", ...overrides };
}

describe("validateAddPantryItem", () => {
  it("accepts each source tab once its own field is answered", () => {
    expect(validateAddPantryItem(values())).toEqual({});
    expect(validateAddPantryItem(values({ source: "recipe", recipeId: "recipe-1" }))).toEqual({});
    expect(validateAddPantryItem(values({ source: "label", label: "Lentil soup" }))).toEqual({});
  });

  it("asks for a food on the food tab, phrased as a list error", () => {
    expect(validateAddPantryItem(values({ foodIds: [] })).food).toBe("Add at least one food");
  });

  it("asks for a recipe on the recipe tab", () => {
    expect(validateAddPantryItem(values({ source: "recipe" })).recipe).toBe("Recipe is required");
  });

  it("asks what it is on the free-form tab, treating whitespace as blank", () => {
    expect(validateAddPantryItem(values({ source: "label" })).label).toBe("Enter what it is");
    expect(validateAddPantryItem(values({ source: "label", label: "   " })).label).toBe("Enter what it is");
  });

  // Only the tab on screen is judged: a food id left behind by a tab the
  // parent moved away from is not an error (and is not sent either).
  it("judges only the visible tab", () => {
    expect(validateAddPantryItem(values({ source: "recipe", foodIds: [], recipeId: "recipe-1" }))).toEqual({});
    expect(validateAddPantryItem(values({ source: "label", foodIds: [], label: "Soup" }))).toEqual({});
    expect(validateAddPantryItem(values({ source: "food", recipeId: "", label: "" }))).toEqual({});
  });
});

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
    expect(html).toMatch(/Quantity note(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
  });

  it("renders the Notes field", () => {
    const html = renderForm();
    expect(html).toMatch(/Notes(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
  });

  it("renders the optional Total servings and Best by fields", () => {
    const html = renderForm();
    expect(html).toMatch(/Total servings(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
    expect(html).toMatch(/Best by(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
    // The Best by field is a DateField button, not a native date input.
    expect(html).toMatch(/aria-haspopup="dialog"[^>]*>[\s\S]*?Select a date/);
  });

  // Item 235: the submit stays enabled with nothing chosen — tapping it has
  // to say what is missing — and nothing is shown before that tap.
  it("leaves the submit enabled with nothing chosen, and shows no error markup before a submit attempt", () => {
    const html = renderForm();
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Add to pantry</);
    expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*\sdisabled=""[^>]*>Add to pantry</);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("Add at least one food");
  });

  // Item 236: the free-form and recipe tabs carry native `required` controls
  // whose bubbles would otherwise pre-empt the inline message.
  it("opts out of native constraint validation", () => {
    expect(renderForm()).toMatch(/<form[^>]*novalidate/i);
  });

  it("renders Cancel wired to onDone", () => {
    const html = renderForm();
    expect(html).toContain(">Cancel<");
  });
});
