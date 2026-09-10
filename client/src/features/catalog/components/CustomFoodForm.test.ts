import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { FoodDetail } from "@blw/shared";
import { getCategoryEmoji } from "../foodEmoji.js";
import { ALLERGEN_SLUGS } from "../constants.js";
import {
  CustomFoodForm,
  buildCustomFoodInput,
  initialCustomFoodValues,
  resolveEmojiForCategory,
  validateCustomFood,
  type CustomFoodValues,
} from "./CustomFoodForm.js";

function values(overrides: Partial<CustomFoodValues> = {}): CustomFoodValues {
  return { name: "Banana bread", category: "grain", emoji: "🍞", allergenSlugs: [], notes: "", ...overrides };
}

function customFood(overrides: Partial<FoodDetail> = {}): FoodDetail {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "banana-bread-k3f9q1",
    name: "Banana bread",
    category: "grain",
    ironLevel: "low",
    vitaminCLevel: "low",
    fiberLevel: "low",
    chokingRisk: "low",
    minAgeMonths: 6,
    allergens: ["wheat", "egg"],
    isCustom: true,
    emoji: "🍞",
    prep6m: "",
    prep9m: "",
    prep12m: "",
    chokingNotes: null,
    notes: "Cut into strips",
    imageUrl: null,
    pairings: [],
    recipes: [],
    ...overrides,
  };
}

function render(element: Parameters<typeof renderToString>[0]) {
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      element,
    ),
  );
}

describe("validateCustomFood", () => {
  it("accepts a filled-in food with no errors at all", () => {
    expect(validateCustomFood(values())).toEqual({});
  });

  it("requires a name that isn't just whitespace", () => {
    expect(validateCustomFood(values({ name: "" })).name).toBe("Name is required");
    expect(validateCustomFood(values({ name: "   " })).name).toBe("Name is required");
  });

  it("caps the name at the shared schema's 60 characters", () => {
    expect(validateCustomFood(values({ name: "a".repeat(60) })).name).toBeUndefined();
    expect(validateCustomFood(values({ name: "a".repeat(61) })).name).toContain("60");
    // Trimmed before measuring — trailing spaces aren't part of the name.
    expect(validateCustomFood(values({ name: `${"a".repeat(60)}   ` })).name).toBeUndefined();
  });

  it("treats a blank emoji as valid (it falls back to the category) but rejects non-emoji text", () => {
    expect(validateCustomFood(values({ emoji: "" })).emoji).toBeUndefined();
    expect(validateCustomFood(values({ emoji: "  " })).emoji).toBeUndefined();
    expect(validateCustomFood(values({ emoji: "bread" })).emoji).toBe("Use a single emoji, or leave it blank");
    // Two emoji is not "an emoji" either — the field renders at display size.
    expect(validateCustomFood(values({ emoji: "🍞🍌" })).emoji).toBe("Use a single emoji, or leave it blank");
  });

  it("accepts a multi-codepoint emoji that is still one grapheme", () => {
    expect(validateCustomFood(values({ emoji: "👨‍👩‍👧" })).emoji).toBeUndefined();
    expect(validateCustomFood(values({ emoji: "👍🏽" })).emoji).toBeUndefined();
  });

  it("caps notes at the shared schema's 500 characters", () => {
    expect(validateCustomFood(values({ notes: "n".repeat(500) })).notes).toBeUndefined();
    expect(validateCustomFood(values({ notes: "n".repeat(501) })).notes).toContain("500");
  });
});

describe("buildCustomFoodInput", () => {
  it("trims the free text and passes the ticked allergens through", () => {
    expect(
      buildCustomFoodInput(values({ name: "  Banana bread  ", notes: "  soft  ", allergenSlugs: ["wheat", "egg"] })),
    ).toEqual({
      name: "Banana bread",
      category: "grain",
      emoji: "🍞",
      allergenSlugs: ["wheat", "egg"],
      notes: "soft",
    });
  });

  it("collapses a blank emoji and blank notes to null, so an edit can clear them", () => {
    const input = buildCustomFoodInput(values({ emoji: "   ", notes: "" }));
    expect(input.emoji).toBeNull();
    expect(input.notes).toBeNull();
  });

  it("copies the allergen array rather than aliasing the form's own state", () => {
    const state = values({ allergenSlugs: ["wheat"] });
    const input = buildCustomFoodInput(state);
    expect(input.allergenSlugs).not.toBe(state.allergenSlugs);
    expect(input.allergenSlugs).toEqual(["wheat"]);
  });
});

describe("resolveEmojiForCategory", () => {
  it("re-seeds a blank field from the new category", () => {
    expect(resolveEmojiForCategory("", "fruit", "protein")).toBe(getCategoryEmoji("protein"));
  });

  it("re-seeds a field still showing the OLD category's suggestion", () => {
    expect(resolveEmojiForCategory(getCategoryEmoji("fruit"), "fruit", "dairy")).toBe(getCategoryEmoji("dairy"));
  });

  it("never clobbers an emoji the parent chose themselves", () => {
    expect(resolveEmojiForCategory("🥯", "fruit", "protein")).toBe("🥯");
  });
});

describe("initialCustomFoodValues", () => {
  it("starts a new food from the category default emoji and the prefilled name", () => {
    const initial = initialCustomFoodValues(undefined, "Kale chips");
    expect(initial.name).toBe("Kale chips");
    expect(initial.emoji).toBe(getCategoryEmoji(initial.category));
    expect(initial.allergenSlugs).toEqual([]);
  });

  it("starts an edit from the food's own fields, including an emoji-less one", () => {
    expect(initialCustomFoodValues(customFood())).toEqual({
      name: "Banana bread",
      category: "grain",
      emoji: "🍞",
      allergenSlugs: ["wheat", "egg"],
      notes: "Cut into strips",
    });
    expect(initialCustomFoodValues(customFood({ emoji: null })).emoji).toBe(getCategoryEmoji("grain"));
  });

  it("copies the food's allergen array (editing must not mutate cached data)", () => {
    const food = customFood();
    expect(initialCustomFoodValues(food).allergenSlugs).not.toBe(food.allergens);
  });
});

describe("CustomFoodForm (render)", () => {
  it("renders name, category, emoji, the full allergen checklist and notes", () => {
    const html = render(createElement(CustomFoodForm, { onSaved: () => {} }));
    expect(html).toContain(">Name<");
    expect(html).toContain(">Category<");
    // Optional labels use Field's own de-emphasis convention.
    expect(html).toMatch(/Emoji(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
    expect(html).toMatch(/Notes(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
    for (const allergen of ALLERGEN_SLUGS) {
      expect(html).toContain(`>${allergen.label}<`);
    }
    expect(html).toContain(">Save<");
    // Item 257: Save is the only button — the page header's chevron/X (or
    // the picker sheet's own close) is the way out, so no Cancel.
    expect(html).not.toContain(">Cancel<");
    expect((html.match(/type="submit"/g) ?? []).length).toBe(1);
  });

  it("prefills the name from `initialName`", () => {
    const filled = render(
      createElement(CustomFoodForm, { initialName: "Kale chips", onSaved: () => {} }),
    );
    expect(filled).toContain('value="Kale chips"');
  });

  // Item 235: Save stays enabled even with the required name empty — a tap
  // must always produce feedback — and the form stays quiet until it happens.
  it("leaves Save enabled on an empty form, and shows no error markup before a submit attempt", () => {
    const empty = render(createElement(CustomFoodForm, { onSaved: () => {} }));
    expect(empty).toMatch(/<button[^>]*type="submit"[^>]*>Save</);
    expect(empty).not.toMatch(/<button[^>]*type="submit"[^>]*\sdisabled=""[^>]*>Save</);
    expect(empty).not.toContain('role="alert"');
    expect(empty).not.toContain("Name is required");
  });

  // Item 236: native constraint bubbles would pre-empt the inline message.
  it("opts out of native constraint validation", () => {
    expect(render(createElement(CustomFoodForm, { onSaved: () => {} }))).toMatch(
      /<form[^>]*novalidate/i,
    );
  });

  it("seeds the emoji field from the category and offers every category option", () => {
    const html = render(createElement(CustomFoodForm, { onSaved: () => {} }));
    expect(html).toContain(`value="${getCategoryEmoji("fruit")}"`);
    expect(html).toContain('<option value="protein">Protein</option>');
    expect(html).toContain('<option value="legume">Legume</option>');
  });

  it("renders allergen chips as a labelled group of pressed/unpressed toggles when editing", () => {
    const html = render(createElement(CustomFoodForm, { food: customFood(), onSaved: () => {} }));
    expect(html).toContain('role="group"');
    // The food's own two allergens come back pressed, the rest don't.
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(2);
    expect((html.match(/aria-pressed="false"/g) ?? []).length).toBe(ALLERGEN_SLUGS.length - 2);
    expect(html).toContain('value="Banana bread"');
    expect(html).toContain("Cut into strips");
  });

  it("uses `idPrefix` so two instances on one page never share a control id", () => {
    const html = render(
      createElement(CustomFoodForm, { idPrefix: "picker-custom", onSaved: () => {} }),
    );
    expect(html).toContain('id="picker-custom-name"');
    expect(html).toContain('for="picker-custom-name"');
    expect(html).toContain('id="picker-custom-category"');
  });
});
