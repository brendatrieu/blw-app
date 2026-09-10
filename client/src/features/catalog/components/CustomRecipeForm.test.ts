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
  getChipKeyProps,
  getStepKeyProps,
  resolveChipKey,
  resolveStepKey,
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
    fiberHigh: false,
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

  // Item 240 (user decision 2026-09-08): a recipe is a title plus at least
  // one ingredient. Steps are optional, so an empty step list — and a form
  // full of blank step boxes — is a complete, saveable recipe.
  it("accepts a recipe with no steps at all", () => {
    expect(validateCustomRecipe(values({ steps: [] }))).toEqual({});
    expect(validateCustomRecipe(values({ steps: ["", "   "] }))).toEqual({});
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

describe("resolveStepKey (item 231: Enter finishes the step)", () => {
  it("commits on a plain Enter, swallowing the newline the textarea would insert", () => {
    expect(resolveStepKey("Enter", false)).toEqual({ prevent: true, commit: true });
  });

  it("lets Shift+Enter through untouched, so a long step can still be multi-line", () => {
    expect(resolveStepKey("Enter", true)).toEqual({ prevent: false, commit: false });
  });

  it("is not interested in any other key, shifted or not", () => {
    expect(resolveStepKey("a", false)).toEqual({ prevent: false, commit: false });
    expect(resolveStepKey("Tab", true)).toEqual({ prevent: false, commit: false });
    expect(resolveStepKey("Backspace", false)).toEqual({ prevent: false, commit: false });
    expect(resolveStepKey("Escape", false)).toEqual({ prevent: false, commit: false });
  });

  // "Commit" here means "stop editing", nothing more: the handler blurs the
  // textarea and the step's text is left exactly as typed. There is no branch
  // that clears or trims it.
  it("never asks for anything but prevent + commit", () => {
    expect(Object.keys(resolveStepKey("Enter", false)).sort()).toEqual(["commit", "prevent"]);
  });
});

describe("getStepKeyProps / getChipKeyProps (the wiring, not just the decision)", () => {
  function stepEvent(key: string, shiftKey: boolean) {
    let prevented = false;
    let blurred = false;
    return {
      event: {
        key,
        shiftKey,
        preventDefault: () => {
          prevented = true;
        },
        currentTarget: {
          blur: () => {
            blurred = true;
          },
        },
      },
      wasPrevented: () => prevented,
      wasBlurred: () => blurred,
    };
  }

  it("step: Enter swallows the newline and ends editing the step", () => {
    const { event, wasPrevented, wasBlurred } = stepEvent("Enter", false);
    getStepKeyProps().onKeyDown(event as never);
    expect(wasPrevented()).toBe(true);
    expect(wasBlurred()).toBe(true);
  });

  it("step: Shift+Enter still inserts a newline, and other keys pass through", () => {
    for (const key of [["Enter", true], ["a", false]] as const) {
      const { event, wasPrevented, wasBlurred } = stepEvent(key[0], key[1]);
      getStepKeyProps().onKeyDown(event as never);
      expect(wasPrevented()).toBe(false);
      expect(wasBlurred()).toBe(false);
    }
  });

  it("step: promises the on-screen keyboard the same thing the handler does", () => {
    expect(getStepKeyProps().enterKeyHint).toBe("done");
  });

  it("chip: Enter commits the trimmed draft and never falls through to submit", () => {
    const added: string[] = [];
    let prevented = false;
    getChipKeyProps("  olive oil  ", (entry) => added.push(entry)).onKeyDown({
      key: "Enter",
      preventDefault: () => {
        prevented = true;
      },
    } as never);
    expect(added).toEqual(["olive oil"]);
    expect(prevented).toBe(true);
  });

  it("chip: a blank draft still swallows Enter, but adds nothing", () => {
    const added: string[] = [];
    let prevented = false;
    getChipKeyProps("   ", (entry) => added.push(entry)).onKeyDown({
      key: "Enter",
      preventDefault: () => {
        prevented = true;
      },
    } as never);
    expect(added).toEqual([]);
    expect(prevented).toBe(true);
  });

  it("chip: leaves every other key alone", () => {
    const added: string[] = [];
    let prevented = false;
    getChipKeyProps("olive", (entry) => added.push(entry)).onKeyDown({
      key: "a",
      preventDefault: () => {
        prevented = true;
      },
    } as never);
    expect(added).toEqual([]);
    expect(prevented).toBe(false);
    expect(getChipKeyProps("olive", () => {}).enterKeyHint).toBe("done");
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
      createElement(CustomRecipeForm, { onSaved: () => {}, ...props } as never),
    ),
  );
}

describe("CustomRecipeForm (render)", () => {
  it("asks for a title, an age, ingredients, steps and the optional extras", () => {
    const html = renderForm();
    expect(html).toContain(">Title<");
    expect(html).toContain(">Suitable from<");
    expect(html).toContain(">Ingredients<");
    expect(html).toContain("Steps");
    // Item 231 renamed this from "Anything else"; the optional-label style is
    // unchanged.
    expect(html).toMatch(/Additional ingredients(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
    expect(html).not.toContain("Anything else");
    expect(html).toMatch(/Prep time(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
    expect(html).toMatch(/Notes(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
    expect(html).toContain(">Save<");
    // Item 257: no Cancel beside Save — the page header's chevron/X is the
    // way out, and exactly one submit button remains.
    expect(html).not.toContain(">Cancel<");
    expect((html.match(/type="submit"/g) ?? []).length).toBe(1);
  });

  // Item 235: an empty form's Save is ENABLED — a tap has to produce a
  // message, and a disabled button produces silence — but says nothing until
  // that tap happens.
  it("leaves Save enabled on an empty form, and shows no error markup before a submit attempt", () => {
    const html = renderForm();
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Save</);
    expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*\sdisabled=""[^>]*>Save</);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("Title is required");
    expect(html).not.toContain("Add at least one ingredient");
  });

  // Item 236: with Save enabled, a desktop browser would pop its own native
  // bubble before `onSubmit` ever ran — which is exactly the feedback the
  // ledger calls not sufficient. `noValidate` hands the decision to the form.
  it("opts out of native constraint validation so the inline messages are what a parent sees", () => {
    expect(renderForm()).toMatch(/<form[^>]*novalidate/i);
  });

  // Item 240 again, on the label this time: Steps reads as optional in the
  // same de-emphasized style every other optional field uses.
  it("labels Steps as optional", () => {
    expect(renderForm()).toMatch(/Steps(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
  });

  it("renders steps as textareas — never a candidate for implicit submission", () => {
    const html = renderForm();
    // Still a <textarea>, so Enter can never save the recipe; what Enter does
    // *inside* it is `resolveStepKey`'s contract, pinned above.
    expect(html).toMatch(/<textarea[^>]*aria-label="Step 1"/);
    expect(html).toContain(">Add step<");
  });

  // `getStepKeyProps` is the ONLY source of the step textarea's Enter
  // wiring, and the JSX spreads it whole. Its `enterKeyHint` therefore
  // renders exactly when the handler is attached — so this assertion is what
  // fails if item 231's Enter-commits-the-step behaviour is unwired, not just
  // if the pure helper is broken.
  it("wires every step textarea to the Enter-commits handler, keyboard hint and all", () => {
    const html = renderForm({ recipe: recipe() });
    const steps = html.match(/<textarea[^>]*aria-label="Step \d+"[^>]*>/g) ?? [];
    expect(steps.length).toBe(2);
    for (const step of steps) expect(step).toContain('enterKeyHint="done"');
  });

  it("wires the extra-ingredient input to its own Enter-adds-a-chip handler", () => {
    const html = renderForm();
    expect(html).toMatch(/<input[^>]*id="custom-recipe-extra"[^>]*enterKeyHint="done"/);
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
