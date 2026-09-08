import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { RecipeDetail } from "@blw/shared";
import {
  addExtraIngredient,
  buildCustomRecipeInput,
  CustomRecipeForm,
  initialCustomRecipeValues,
  resolveChipKey,
  validateCustomRecipe,
  type CustomRecipeValues,
} from "./CustomRecipeForm.js";

function values(overrides: Partial<CustomRecipeValues> = {}): CustomRecipeValues {
  return {
    title: "Lentil mash",
    minAgeMonths: 6,
    foodIds: ["food-1"],
    quantityNotes: { "food-1": "half a cup" },
    extraIngredients: [],
    steps: ["Cook the lentils"],
    notes: "",
    prepMinutes: "",
    ...overrides,
  };
}

function recipe(overrides: Partial<RecipeDetail> = {}): RecipeDetail {
  return {
    id: "recipe-9",
    slug: "lentil-mash-k3f9q1",
    title: "Lentil mash",
    minAgeMonths: 9,
    prepMinutes: 20,
    ironFocus: false,
    vitaminCHigh: false,
    imageUrl: null,
    fridgeHoursOverride: null,
    freezerDaysOverride: null,
    allergens: [],
    ingredients: [
      {
        foodId: "food-1",
        foodSlug: "lentil",
        foodName: "Lentils",
        isCustom: false,
        foodEmoji: null,
        quantityNote: "half a cup",
      },
      { foodId: "food-2", foodSlug: "carrot", foodName: "Carrot", isCustom: false, foodEmoji: null, quantityNote: "" },
    ],
    extraIngredients: ["olive oil"],
    variants: [{ ageStage: "9", textureNote: "", steps: ["Cook", "Mash"] }],
    isCustom: true,
    notes: "Freezes well",
    ...overrides,
  };
}

describe("validateCustomRecipe", () => {
  it("accepts a filled-in recipe", () => {
    expect(validateCustomRecipe(values())).toEqual({});
  });

  it("requires a title, treating whitespace as blank", () => {
    expect(validateCustomRecipe(values({ title: "   " })).title).toBe("Title is required");
  });

  it("caps the title at the shared maximum", () => {
    expect(validateCustomRecipe(values({ title: "a".repeat(81) })).title).toContain("80 characters or fewer");
  });

  it("requires at least one ingredient", () => {
    expect(validateCustomRecipe(values({ foodIds: [], quantityNotes: {} })).ingredients).toBe(
      "Add at least one ingredient",
    );
  });

  it("caps a quantity note", () => {
    const errors = validateCustomRecipe(values({ quantityNotes: { "food-1": "x".repeat(81) } }));
    expect(errors.ingredients).toContain("80 characters or fewer");
  });

  it("requires at least one non-blank step (an empty step box is not a step)", () => {
    expect(validateCustomRecipe(values({ steps: ["", "   "] })).steps).toBe("Add at least one step");
  });

  it("caps a single step's length", () => {
    expect(validateCustomRecipe(values({ steps: ["x".repeat(501)] })).steps).toContain("500 characters or fewer");
  });

  it("caps the notes", () => {
    expect(validateCustomRecipe(values({ notes: "x".repeat(501) })).notes).toContain("500 characters or fewer");
  });

  it("rejects a fractional, negative or oversized prep time but allows a blank one", () => {
    expect(validateCustomRecipe(values({ prepMinutes: "" })).prepMinutes).toBeUndefined();
    expect(validateCustomRecipe(values({ prepMinutes: "12" })).prepMinutes).toBeUndefined();
    expect(validateCustomRecipe(values({ prepMinutes: "12.5" })).prepMinutes).toBe("Use a whole number of minutes");
    expect(validateCustomRecipe(values({ prepMinutes: "-3" })).prepMinutes).toBe("Use a whole number of minutes");
    expect(validateCustomRecipe(values({ prepMinutes: "abc" })).prepMinutes).toBe("Use a whole number of minutes");
    expect(validateCustomRecipe(values({ prepMinutes: "601" })).prepMinutes).toContain("600 minutes or fewer");
  });

  it("caps an extra ingredient's length", () => {
    expect(validateCustomRecipe(values({ extraIngredients: ["x".repeat(61)] })).extraIngredients).toContain(
      "60 characters or fewer",
    );
  });
});

describe("buildCustomRecipeInput", () => {
  it("trims the title and pairs each food with its quantity, in picker order", () => {
    const input = buildCustomRecipeInput(
      values({
        title: "  Lentil mash  ",
        foodIds: ["food-2", "food-1"],
        quantityNotes: { "food-1": " half a cup ", "food-2": "" },
      }),
    );
    expect(input.title).toBe("Lentil mash");
    expect(input.ingredients).toEqual([
      { foodId: "food-2", quantityNote: "" },
      { foodId: "food-1", quantityNote: "half a cup" },
    ]);
  });

  it("drops blank steps and blank extras, trimming what survives", () => {
    const input = buildCustomRecipeInput(
      values({ steps: [" Cook ", "", "   ", "Mash"], extraIngredients: [" olive oil ", "  "] }),
    );
    expect(input.steps).toEqual(["Cook", "Mash"]);
    expect(input.extraIngredients).toEqual(["olive oil"]);
  });

  it("collapses blank notes to null", () => {
    expect(buildCustomRecipeInput(values({ notes: "   " })).notes).toBeNull();
    expect(buildCustomRecipeInput(values({ notes: " Freezes well " })).notes).toBe("Freezes well");
  });

  // Always sent, never omitted: on a PATCH an absent key leaves the column
  // alone, so an omitted prepMinutes would make clearing one impossible.
  it("sends prepMinutes as 0 when the field is blank, and as a number otherwise", () => {
    expect(buildCustomRecipeInput(values({ prepMinutes: "  " })).prepMinutes).toBe(0);
    expect(buildCustomRecipeInput(values({ prepMinutes: "20" })).prepMinutes).toBe(20);
  });
});

describe("initialCustomRecipeValues", () => {
  it("starts a new recipe at 6 months with exactly one empty step box", () => {
    expect(initialCustomRecipeValues()).toEqual({
      title: "",
      minAgeMonths: 6,
      foodIds: [],
      quantityNotes: {},
      extraIngredients: [],
      steps: [""],
      notes: "",
      prepMinutes: "",
    });
  });

  it("loads an existing recipe: ingredients, its single variant's steps, notes and prep time", () => {
    const initial = initialCustomRecipeValues(recipe());
    expect(initial.title).toBe("Lentil mash");
    expect(initial.minAgeMonths).toBe(9);
    expect(initial.foodIds).toEqual(["food-1", "food-2"]);
    expect(initial.quantityNotes).toEqual({ "food-1": "half a cup", "food-2": "" });
    expect(initial.extraIngredients).toEqual(["olive oil"]);
    expect(initial.steps).toEqual(["Cook", "Mash"]);
    expect(initial.notes).toBe("Freezes well");
    expect(initial.prepMinutes).toBe("20");
  });

  it("shows a blank prep field for the 'not stated' 0 the server stores", () => {
    expect(initialCustomRecipeValues(recipe({ prepMinutes: 0 })).prepMinutes).toBe("");
  });

  it("never leaves the steps list empty, even for a recipe with no variant at all", () => {
    expect(initialCustomRecipeValues(recipe({ variants: [] })).steps).toEqual([""]);
  });

  it("copies the arrays rather than aliasing the cached recipe", () => {
    const source = recipe();
    const initial = initialCustomRecipeValues(source);
    initial.extraIngredients.push("salt");
    initial.steps.push("Serve");
    expect(source.extraIngredients).toEqual(["olive oil"]);
    expect(source.variants[0]!.steps).toEqual(["Cook", "Mash"]);
  });
});

describe("resolveChipKey (Enter never submits the recipe)", () => {
  it("swallows Enter and commits the trimmed draft", () => {
    expect(resolveChipKey("Enter", "  olive oil  ")).toEqual({ prevent: true, commit: "olive oil" });
  });

  // The important half: even with nothing to add, Enter must not fall
  // through to the browser's implicit form submission (item 211).
  it("still swallows Enter on a blank draft, with nothing to commit", () => {
    expect(resolveChipKey("Enter", "   ")).toEqual({ prevent: true, commit: null });
    expect(resolveChipKey("Enter", "")).toEqual({ prevent: true, commit: null });
  });

  it("leaves every other key alone", () => {
    expect(resolveChipKey("a", "olive")).toEqual({ prevent: false, commit: null });
    expect(resolveChipKey("Tab", "olive")).toEqual({ prevent: false, commit: null });
    expect(resolveChipKey("Backspace", "")).toEqual({ prevent: false, commit: null });
  });
});

describe("addExtraIngredient", () => {
  it("appends the trimmed entry", () => {
    expect(addExtraIngredient(["olive oil"], "  cinnamon ")).toEqual(["olive oil", "cinnamon"]);
  });

  it("refuses a blank entry, returning the same array", () => {
    const current = ["olive oil"];
    expect(addExtraIngredient(current, "   ")).toBe(current);
  });

  it("refuses a case-insensitive duplicate", () => {
    const current = ["Olive oil"];
    expect(addExtraIngredient(current, "olive OIL")).toBe(current);
  });

  it("refuses to go past the shared cap of 20", () => {
    const current = Array.from({ length: 20 }, (_, i) => `extra-${i}`);
    expect(addExtraIngredient(current, "one more")).toBe(current);
  });
});

function renderForm(props: Record<string, unknown> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(CustomRecipeForm, { onSaved: () => {}, onCancel: () => {}, ...props } as never),
    ),
  );
}

describe("CustomRecipeForm (render)", () => {
  it("asks for a title, an age, ingredients, steps and the optional extras", () => {
    const html = renderForm();
    expect(html).toContain(">Title<");
    expect(html).toContain(">Suitable from<");
    expect(html).toContain(">Ingredients<");
    expect(html).toContain(">Steps<");
    expect(html).toMatch(/Anything else(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
    expect(html).toMatch(/Prep time(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
    expect(html).toMatch(/Notes(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
    expect(html).toContain(">Save<");
    expect(html).toContain(">Cancel<");
  });

  it("disables Save on an empty form, and shouts no 'required' errors before anyone has typed", () => {
    const html = renderForm();
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled[^>]*>Save</);
    expect(html).not.toContain("Title is required");
    expect(html).not.toContain("Add at least one ingredient");
    expect(html).not.toContain("Add at least one step");
  });

  it("renders steps as textareas — Enter inside one is a newline, never a submit", () => {
    const html = renderForm();
    expect(html).toMatch(/<textarea[^>]*aria-label="Step 1"/);
    expect(html).toContain(">Add step<");
  });

  it("starts with exactly one step box, and no way to remove the only one", () => {
    const html = renderForm();
    expect(html).toMatch(/aria-label="Step 1"/);
    expect(html).not.toMatch(/aria-label="Step 2"/);
    expect(html).not.toContain('aria-label="Remove step 1"');
  });

  it("prefills every field in edit mode", () => {
    const html = renderForm({ recipe: recipe() });
    expect(html).toContain('value="Lentil mash"');
    expect(html).toContain("Cook</textarea>");
    expect(html).toContain("Freezes well</textarea>");
    expect(html).toContain('value="20"');
    // Two steps now, so each one can be removed.
    expect(html).toContain('aria-label="Remove step 2"');
    // The free-text extra came back as a removable chip.
    expect(html).toContain('aria-label="Remove olive oil"');
  });

  it("namespaces its control ids by idPrefix, so two forms can share a page", () => {
    const html = renderForm({ idPrefix: "recipe-edit" });
    expect(html).toContain('id="recipe-edit-title"');
    expect(html).toContain('id="recipe-edit-extra"');
    expect(html).toContain('id="recipe-edit-notes"');
  });
});
