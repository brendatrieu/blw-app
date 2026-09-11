import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { RecipeDetail } from "@blw/shared";
import {
  buildCustomRecipeInput,
  CustomRecipeForm,
  emptyExtraIngredientRow,
  extraRowEnterKeyHint,
  extraRowFieldId,
  initialCustomRecipeValues,
  getExtraRowKeyProps,
  getStepKeyProps,
  resolveExtraRowKey,
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
    extraIngredients: [
      { name: "olive oil", quantityNote: "a drizzle" },
      { name: "cinnamon", quantityNote: "" },
    ],
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

  it("caps an extra ingredient's name and its quantity separately", () => {
    expect(
      validateCustomRecipe(values({ extraIngredients: [{ name: "x".repeat(61), quantityNote: "" }] }))
        .extraIngredients,
    ).toContain("60 characters or fewer");
    expect(
      validateCustomRecipe(values({ extraIngredients: [{ name: "olive oil", quantityNote: "x".repeat(81) }] }))
        .extraIngredients,
    ).toContain("80 characters or fewer");
  });

  // A blank ROW is "I haven't filled this in" — the same reading a blank step
  // box gets — so it is dropped, never an error, and never counted toward the
  // cap of 20. A row with only a quantity in it is blank by that rule.
  it("ignores blank rows entirely", () => {
    expect(validateCustomRecipe(values({ extraIngredients: [emptyExtraIngredientRow()] }))).toEqual({});
    expect(
      validateCustomRecipe(values({ extraIngredients: [{ name: "   ", quantityNote: "a drizzle" }] })),
    ).toEqual({});
    const twentyOne = Array.from({ length: 21 }, (_, i) =>
      i === 0 ? emptyExtraIngredientRow() : { name: `extra-${i}`, quantityNote: "" },
    );
    expect(validateCustomRecipe(values({ extraIngredients: twentyOne })).extraIngredients).toBeUndefined();
  });

  it("caps the number of filled-in rows at the shared 20", () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({ name: `extra-${i}`, quantityNote: "" }));
    expect(validateCustomRecipe(values({ extraIngredients: rows })).extraIngredients).toContain("At most 20");
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

  it("drops blank steps and blank extra rows, trimming what survives", () => {
    const input = buildCustomRecipeInput(
      values({
        steps: [" Cook ", "", "   ", "Mash"],
        extraIngredients: [
          { name: " olive oil ", quantityNote: " a drizzle " },
          { name: "  ", quantityNote: "" },
          // Only a quantity typed: no name, so no ingredient.
          { name: "   ", quantityNote: "a pinch" },
        ],
      }),
    );
    expect(input.steps).toEqual(["Cook", "Mash"]);
    expect(input.extraIngredients).toEqual([{ name: "olive oil", quantityNote: "a drizzle" }]);
  });

  // The object form, quantity and all — this is the whole point of item 299.
  it("emits a name/quantityNote object per row, in the order the rows sit in", () => {
    const input = buildCustomRecipeInput(
      values({
        extraIngredients: [
          { name: "cinnamon", quantityNote: "a pinch" },
          { name: "olive oil", quantityNote: "" },
        ],
      }),
    );
    expect(input.extraIngredients).toEqual([
      { name: "cinnamon", quantityNote: "a pinch" },
      { name: "olive oil", quantityNote: "" },
    ]);
  });

  // `normalizeExtraIngredients` is the server's own rule: running it here
  // means what the form sends is already what comes back on the recipe page.
  it("keeps the first of a case-insensitive duplicate name, quantity and all", () => {
    const input = buildCustomRecipeInput(
      values({
        extraIngredients: [
          { name: "Olive oil", quantityNote: "a drizzle" },
          { name: "olive OIL", quantityNote: "two spoons" },
        ],
      }),
    );
    expect(input.extraIngredients).toEqual([{ name: "Olive oil", quantityNote: "a drizzle" }]);
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
  it("starts a new recipe at 6 months with one empty step box and one empty extra row", () => {
    expect(initialCustomRecipeValues()).toEqual({
      title: "",
      minAgeMonths: 6,
      foodIds: [],
      quantityNotes: {},
      extraIngredients: [{ name: "", quantityNote: "" }],
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
    expect(initial.extraIngredients).toEqual([
      { name: "olive oil", quantityNote: "a drizzle" },
      { name: "cinnamon", quantityNote: "" },
    ]);
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

  it("opens a blank extra row for a recipe saved without any", () => {
    expect(initialCustomRecipeValues(recipe({ extraIngredients: [] })).extraIngredients).toEqual([
      { name: "", quantityNote: "" },
    ]);
  });

  // Rows are edited in place, so the row OBJECTS have to be copies too — not
  // just the array around them.
  it("copies the arrays and the extra rows rather than aliasing the cached recipe", () => {
    const source = recipe();
    const initial = initialCustomRecipeValues(source);
    initial.extraIngredients.push({ name: "salt", quantityNote: "" });
    initial.extraIngredients[0]!.quantityNote = "a gallon";
    initial.steps.push("Serve");
    expect(source.extraIngredients).toEqual([
      { name: "olive oil", quantityNote: "a drizzle" },
      { name: "cinnamon", quantityNote: "" },
    ]);
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

describe("getStepKeyProps (the wiring, not just the decision)", () => {
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
});

describe("resolveExtraRowKey (item 299: Enter walks the rows, never submits)", () => {
  it("moves from a name to that row's own quantity", () => {
    expect(resolveExtraRowKey("Enter", "name", 0, 3)).toEqual({
      prevent: true,
      focus: { index: 0, field: "quantity" },
      addRow: false,
    });
  });

  it("moves from a quantity to the next row that already exists", () => {
    expect(resolveExtraRowKey("Enter", "quantity", 0, 3)).toEqual({
      prevent: true,
      focus: { index: 1, field: "name" },
      addRow: false,
    });
  });

  it("appends a row from the last quantity, so a list can be typed straight through", () => {
    expect(resolveExtraRowKey("Enter", "quantity", 2, 3)).toEqual({
      prevent: true,
      focus: { index: 3, field: "name" },
      addRow: true,
    });
  });

  it("adds nothing past the shared cap of 20, but still swallows the key", () => {
    expect(resolveExtraRowKey("Enter", "quantity", 19, 20)).toEqual({
      prevent: true,
      focus: null,
      addRow: false,
    });
  });

  // The half that matters most: these are <input>s inside the recipe form, so
  // an unprevented Enter would implicit-submit a half-written recipe — the
  // same hazard the chip input guarded against (item 211).
  it("prevents EVERY Enter, wherever it lands and whatever it does next", () => {
    const everywhere = [
      resolveExtraRowKey("Enter", "name", 0, 1),
      resolveExtraRowKey("Enter", "quantity", 0, 1),
      resolveExtraRowKey("Enter", "name", 19, 20),
      resolveExtraRowKey("Enter", "quantity", 19, 20),
    ];
    for (const decision of everywhere) expect(decision.prevent).toBe(true);
  });

  it("leaves every other key alone", () => {
    for (const key of ["a", "Tab", "Backspace", "Escape"]) {
      expect(resolveExtraRowKey(key, "name", 0, 3)).toEqual({ prevent: false, focus: null, addRow: false });
      expect(resolveExtraRowKey(key, "quantity", 2, 3)).toEqual({ prevent: false, focus: null, addRow: false });
    }
  });
});

describe("extraRowEnterKeyHint", () => {
  it("says 'next' wherever Enter moves somewhere", () => {
    expect(extraRowEnterKeyHint("name", 0, 1)).toBe("next");
    expect(extraRowEnterKeyHint("quantity", 0, 3)).toBe("next");
    // The last quantity still moves — onto a row it creates.
    expect(extraRowEnterKeyHint("quantity", 2, 3)).toBe("next");
  });

  it("says 'done' only where Enter has nowhere left to go", () => {
    expect(extraRowEnterKeyHint("quantity", 19, 20)).toBe("done");
  });
});

describe("extraRowFieldId", () => {
  it("namespaces both boxes of a row by the form's own prefix", () => {
    expect(extraRowFieldId("custom-recipe", 0, "name")).toBe("custom-recipe-extra-name-0");
    expect(extraRowFieldId("recipe-edit", 2, "quantity")).toBe("recipe-edit-extra-quantity-2");
  });
});

describe("getExtraRowKeyProps (the wiring, not just the decision)", () => {
  function press(key: string, field: "name" | "quantity", index: number, rowCount: number) {
    const acted: { focus: unknown; addRow: boolean }[] = [];
    let prevented = false;
    getExtraRowKeyProps(field, index, rowCount, (decision) => acted.push(decision)).onKeyDown({
      key,
      preventDefault: () => {
        prevented = true;
      },
    } as never);
    return { acted, prevented };
  }

  it("Enter hands the component the append-and-focus decision, and never submits", () => {
    const { acted, prevented } = press("Enter", "quantity", 2, 3);
    expect(prevented).toBe(true);
    expect(acted).toEqual([{ focus: { index: 3, field: "name" }, addRow: true }]);
  });

  it("Enter in a name asks only for a move, not a new row", () => {
    const { acted, prevented } = press("Enter", "name", 1, 3);
    expect(prevented).toBe(true);
    expect(acted).toEqual([{ focus: { index: 1, field: "quantity" }, addRow: false }]);
  });

  it("at the cap, Enter is swallowed and the component is asked to do nothing", () => {
    const { acted, prevented } = press("Enter", "quantity", 19, 20);
    expect(prevented).toBe(true);
    expect(acted).toEqual([]);
  });

  it("leaves every other key alone", () => {
    const { acted, prevented } = press("a", "name", 0, 3);
    expect(prevented).toBe(false);
    expect(acted).toEqual([]);
  });

  it("promises the on-screen keyboard the same thing the handler does", () => {
    expect(getExtraRowKeyProps("name", 0, 1, () => {}).enterKeyHint).toBe("next");
    expect(getExtraRowKeyProps("quantity", 19, 20, () => {}).enterKeyHint).toBe("done");
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

  // Item 300: the autosize wiring is spread whole onto each step textarea
  // and the notes one, so the rendered `data-autosize` is present exactly
  // when the ref + onInput handler are. This is the assertion that fails if
  // the behaviour is unwired, not just if the height rule is wrong.
  it("marks every step textarea and the notes textarea as auto-growing", () => {
    const html = renderForm({ recipe: recipe() });
    const steps = html.match(/<textarea[^>]*aria-label="Step \d+"[^>]*>/g) ?? [];
    expect(steps.length).toBe(2);
    for (const step of steps) expect(step).toContain('data-autosize="true"');
    expect(html).toMatch(/<textarea[^>]*id="custom-recipe-notes"[^>]*data-autosize="true"/);
  });

  // …and the step LIST carries the wiring that re-fits those boxes when a
  // step is removed (cycle 1): the list is keyed by index, so a removal hands
  // an existing textarea different text without firing `input`. The rendered
  // attribute is present exactly when the effect + ref are.
  it("marks the step list as one that re-fits itself when it changes length", () => {
    const html = renderForm({ recipe: recipe() });
    expect(html).toMatch(/<ol[^>]*data-autosize-list="true"/);
    // On the <ol> that holds the steps, not some other list.
    const list = /<ol[^>]*data-autosize-list="true"[^>]*>/.exec(html)?.[0] ?? "";
    expect(list).toContain('aria-labelledby="custom-recipe-steps-label"');
    expect((html.match(/data-autosize-list="true"/g) ?? []).length).toBe(1);
  });

  // …and every autosized field still opens at two rows, so a no-JS render
  // (and the first paint before the ref runs) is the right size already.
  it("starts the auto-growing fields at two rows", () => {
    const html = renderForm();
    for (const field of html.match(/<textarea[^>]*data-autosize="true"[^>]*>/g) ?? []) {
      expect(field).toContain('rows="2"');
    }
    expect((html.match(/data-autosize="true"/g) ?? []).length).toBe(2);
  });

  // Item 299: rows, not chips. The old single "add a chip" box is gone.
  it("renders an extra-ingredient ROW: a name box, a quantity box and a remove button", () => {
    const html = renderForm();
    expect(html).toMatch(/<input[^>]*id="custom-recipe-extra-name-0"/);
    expect(html).toMatch(/<input[^>]*id="custom-recipe-extra-quantity-0"/);
    expect(html).toContain(">Ingredient 1<");
    expect(html).toMatch(/Quantity(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
    expect(html).toContain('aria-label="Remove ingredient 1"');
    expect(html).toContain("+ Add ingredient");
    // The chip input and its Add button are gone for good.
    expect(html).not.toContain('id="custom-recipe-extra"');
  });

  it("wires both boxes of every row to the Enter-walks-the-rows handler", () => {
    const html = renderForm();
    expect(html).toMatch(/<input[^>]*id="custom-recipe-extra-name-0"[^>]*enterKeyHint="next"/);
    expect(html).toMatch(/<input[^>]*id="custom-recipe-extra-quantity-0"[^>]*enterKeyHint="next"/);
  });

  // The × has to be a real tap target on a phone, not a 12px glyph.
  it("gives the row's remove button a 44px target and a name of its own", () => {
    const html = renderForm();
    const button = /<button[^>]*aria-label="Remove ingredient 1"[^>]*>/.exec(html)?.[0] ?? "";
    expect(button).toContain("min-h-11");
    expect(button).toContain("min-w-11");
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
  });

  // Item 299/301: the stored extras come back as editable rows — the name in
  // one box, the quantity it was saved with in the other, and an empty
  // quantity box for the extra that never had one.
  it("loads every stored extra ingredient into a row of its own, quantities included", () => {
    const html = renderForm({ recipe: recipe() });
    expect(html).toMatch(/<input[^>]*id="custom-recipe-extra-name-0"[^>]*value="olive oil"/);
    expect(html).toMatch(/<input[^>]*id="custom-recipe-extra-quantity-0"[^>]*value="a drizzle"/);
    expect(html).toMatch(/<input[^>]*id="custom-recipe-extra-name-1"[^>]*value="cinnamon"/);
    expect(html).toMatch(/<input[^>]*id="custom-recipe-extra-quantity-1"[^>]*value=""/);
    expect(html).toContain('aria-label="Remove ingredient 2"');
    expect(html).not.toMatch(/id="custom-recipe-extra-name-2"/);
  });

  it("namespaces its control ids by idPrefix, so two forms can share a page", () => {
    const html = renderForm({ idPrefix: "recipe-edit" });
    expect(html).toContain('id="recipe-edit-title"');
    expect(html).toContain('id="recipe-edit-extra-name-0"');
    expect(html).toContain('id="recipe-edit-extra-quantity-0"');
    expect(html).toContain('id="recipe-edit-notes"');
  });
});

describe("validateCustomRecipe — duplicate additional ingredients", () => {
  it("names the duplicate instead of letting the server drop it silently", () => {
    const base = initialCustomRecipeValues();
    const errors = validateCustomRecipe({
      ...base,
      title: "Toast",
      foodIds: ["food-1"],
      extraIngredients: [
        { name: "Olive oil", quantityNote: "for the pan" },
        { name: "olive oil", quantityNote: "to finish" },
      ],
    });
    expect(errors.extraIngredients).toBe("Duplicate ingredient: olive oil");
  });
});
