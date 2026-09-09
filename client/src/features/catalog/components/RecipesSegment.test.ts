import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { RecipeListItem } from "@blw/shared";
import { catalogKeys } from "../hooks.js";
import {
  activeRecipeFilters,
  buildRecipesFilters,
  EMPTY_RECIPE_FILTERS,
  NoRecipesEmptyState,
  RecipeCard,
  RecipeFilterGroups,
  RecipesSegment,
} from "./RecipesSegment.js";

function recipe(overrides: Partial<RecipeListItem> = {}): RecipeListItem {
  return {
    id: "recipe-1",
    slug: "banana-porridge",
    title: "Banana porridge",
    minAgeMonths: 6,
    ironFocus: false,
    vitaminCHigh: false,
    allergens: [],
    isCustom: false,
    isFavorite: false,
    ingredientNames: ["Banana", "Oats"],
    ...overrides,
  };
}

function renderCard(item: RecipeListItem) {
  return renderToString(createElement(MemoryRouter, null, createElement(RecipeCard, { recipe: item })));
}

/** The recipes list as the segment's default (unfiltered) query holds it. */
function renderSegment(recipes?: RecipeListItem[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (recipes) queryClient.setQueryData(catalogKeys.recipesList({ scope: "all" }), { recipes });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MemoryRouter, null, createElement(RecipesSegment, null)),
    ),
  );
}

describe("RecipeCard", () => {
  it("links the whole row to the recipe and names its ingredients", () => {
    const html = renderCard(recipe());
    expect(html).toContain('href="/recipes/recipe-1"');
    expect(html).toContain("Banana porridge");
    expect(html).toContain("Banana, Oats");
  });

  it("always carries the minimum-age badge", () => {
    // SSR splits the interpolation with a comment node.
    expect(renderCard(recipe({ minAgeMonths: 9 }))).toMatch(/>9(?:<!-- -->)?m\+</);
  });

  it("badges iron focus, custom ownership and each allergen", () => {
    const html = renderCard(recipe({ ironFocus: true, isCustom: true, allergens: ["peanut", "milk"] }));
    expect(html).toContain(">Iron<");
    expect(html).toContain(">Custom<");
    expect(html).toContain(">Peanut<");
    expect(html).toContain(">Milk<");
  });

  it("carries none of those badges when the recipe has none of those properties", () => {
    const html = renderCard(recipe());
    expect(html).not.toContain(">Iron<");
    expect(html).not.toContain(">Custom<");
    expect(html).not.toContain(">Vit C<");
  });

  it("badges high vitamin C beside iron, and a row with both carries both", () => {
    const both = renderCard(recipe({ ironFocus: true, vitaminCHigh: true }));
    expect(both).toContain(">Iron<");
    expect(both).toContain(">Vit C<");

    const neither = renderCard(recipe({ ironFocus: false, vitaminCHigh: false }));
    expect(neither).not.toContain(">Iron<");
    expect(neither).not.toContain(">Vit C<");
  });

  // Ledger 241/243: `ironFocus` is now DERIVED server-side (curated flag OR a
  // high-iron ingredient), so a CUSTOM recipe can arrive with both nutrition
  // flags on. Nothing in the card had to change for that — this pins that it
  // stays true, since "custom recipes are never iron-rich" was a fair reading
  // of the old fixtures.
  it("badges a custom row that carries both derived flags with Iron, Vit C AND Custom", () => {
    const html = renderCard(
      recipe({ id: "recipe-7", title: "Beef and pepper strips", isCustom: true, ironFocus: true, vitaminCHigh: true }),
    );
    expect(html).toContain(">Iron<");
    expect(html).toContain(">Vit C<");
    expect(html).toContain(">Custom<");
  });

  // The Vit C badge must carry the SUNSHINE tone specifically — a tone swap
  // to "primary" (Iron's tone) reads fine by text alone, so this pins the
  // actual class the tone maps to.
  it("gives the Vit C badge the sunshine tone's classes, not just its text", () => {
    const html = renderCard(recipe({ vitaminCHigh: true }));
    expect(html).toMatch(
      /class="[^"]*bg-\[var\(--color-caution-soft\)\][^"]*text-\[var\(--color-caution-soft-text\)\][^"]*"[^>]*>Vit C</,
    );
  });

  it("marks a favorite decoratively, and only when it is one", () => {
    expect(renderCard(recipe({ isFavorite: true }))).toContain("♥");
    expect(renderCard(recipe())).not.toContain("♥");
  });

  // The row IS the link, so the favorite mark has to stay a span: an
  // interactive element inside an anchor is invalid and untappable.
  it("nests no interactive element inside the card's anchor", () => {
    const html = renderCard(recipe({ isFavorite: true, isCustom: true, allergens: ["milk"] }));
    expect(html).not.toMatch(/<a [^>]*>(?:(?!<\/a>).)*<(?:button|a|input)\b/s);
  });
});

describe("NoRecipesEmptyState", () => {
  it("offers to write a recipe rather than dead-ending", () => {
    const html = renderToString(createElement(MemoryRouter, null, createElement(NoRecipesEmptyState, null)));
    expect(html).toContain("No recipes match those filters");
    expect(html).toContain('href="/recipes/new"');
    expect(html).toContain(">Add a recipe<");
  });
});

describe("RecipesSegment", () => {
  it("renders the sticky search bar, the scope chips and a closed Filters sheet", () => {
    const html = renderSegment([]);
    expect(html).toContain("var(--header-height)");
    expect(html).toMatch(/class="[^"]*sticky[^"]*"/);
    expect(html).toContain('aria-label="Search recipes"');
    expect(html).toContain('aria-label="Recipe scope"');
    expect(html).toContain(">All<");
    expect(html).toContain(">Favorites<");
    expect(html).toContain(">Custom<");
    expect(html).toContain("Filters");
    // The funnel's contents live in the sheet, closed on arrival.
    expect(html).not.toContain("Contains ingredient");
  });

  it("defaults to the All scope, with nothing else pressed", () => {
    const html = renderSegment([]);
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>All</);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Favorites</);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Custom</);
  });

  it("shows skeletons while the list is still loading", () => {
    const html = renderSegment();
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Loading"');
  });

  it("renders a card per recipe once the list resolves", () => {
    const html = renderSegment([recipe(), recipe({ id: "recipe-2", title: "Lentil mash", isCustom: true })]);
    expect(html).toContain('href="/recipes/recipe-1"');
    expect(html).toContain('href="/recipes/recipe-2"');
    expect(html).toContain(">Custom<");
    expect(html).not.toContain("No recipes match those filters");
  });

  it("falls back to the empty state when the list comes back empty", () => {
    const html = renderSegment([]);
    expect(html).toContain("No recipes match those filters");
    expect(html).toContain('href="/recipes/new"');
  });

  it("shows no active-filter pills until a funnel filter is set", () => {
    const html = renderSegment([]);
    expect(html).not.toContain("filter\"");
    expect(html).not.toMatch(/aria-label="Remove [^"]* filter"/);
  });
});

describe("buildRecipesFilters (what the list actually requests)", () => {
  const everything = {
    q: "  mash ",
    scope: "custom" as const,
    maxAgeMonths: 9,
    allergen: "egg",
    ironFocus: true,
    vitaminCHigh: true,
    ingredientFoodId: "food-1",
  };

  it("forwards every filter, iron focus and high vitamin C independently, and trims the search", () => {
    expect(buildRecipesFilters(everything)).toEqual({
      q: "mash",
      scope: "custom",
      maxAgeMonths: 9,
      allergen: "egg",
      ironFocus: true,
      vitaminCHigh: true,
      ingredientFoodId: "food-1",
    });
    // Each toggle on its own — neither implies the other.
    expect(buildRecipesFilters({ ...everything, ironFocus: false }).ironFocus).toBeUndefined();
    expect(buildRecipesFilters({ ...everything, ironFocus: false }).vitaminCHigh).toBe(true);
    expect(buildRecipesFilters({ ...everything, vitaminCHigh: false }).vitaminCHigh).toBeUndefined();
    expect(buildRecipesFilters({ ...everything, vitaminCHigh: false }).ironFocus).toBe(true);
  });

  it("omits off toggles and blank text so the server applies no exact-match filter", () => {
    const off = buildRecipesFilters({
      q: "   ",
      scope: "all",
      maxAgeMonths: undefined,
      allergen: undefined,
      ironFocus: false,
      vitaminCHigh: false,
      ingredientFoodId: "",
    });
    expect(off).toEqual({ q: undefined, scope: "all", maxAgeMonths: undefined, allergen: undefined, ironFocus: undefined, vitaminCHigh: undefined, ingredientFoodId: undefined });
  });
});

describe("activeRecipeFilters (funnel count + pill row share this)", () => {
  it("yields one labelled pill per set filter, in display order, and nothing when none are set", () => {
    expect(activeRecipeFilters(EMPTY_RECIPE_FILTERS)).toEqual([]);
    const pills = activeRecipeFilters(
      { maxAgeMonths: 9, allergen: "egg", ironFocus: true, vitaminCHigh: true, ingredientFoodId: "food-1" },
      "Broccoli",
    );
    expect(pills.map((p) => p.key)).toEqual(["maxAgeMonths", "allergen", "ironFocus", "vitaminCHigh", "ingredientFoodId"]);
    expect(pills.map((p) => p.label)).toEqual(["9m+", "Egg", "Iron focus", "High vitamin C", "Broccoli"]);
  });

  it("counts iron focus and high vitamin C independently — a row can carry either, neither, or both", () => {
    expect(
      activeRecipeFilters({ ...EMPTY_RECIPE_FILTERS, ironFocus: true }),
    ).toEqual([{ key: "ironFocus", label: "Iron focus" }]);
    expect(
      activeRecipeFilters({ ...EMPTY_RECIPE_FILTERS, vitaminCHigh: true }),
    ).toEqual([{ key: "vitaminCHigh", label: "High vitamin C" }]);
    expect(
      activeRecipeFilters({ ...EMPTY_RECIPE_FILTERS, ironFocus: true, vitaminCHigh: true }),
    ).toEqual([
      { key: "ironFocus", label: "Iron focus" },
      { key: "vitaminCHigh", label: "High vitamin C" },
    ]);
  });

  it("falls back to a generic label for a picked ingredient when its name hasn't resolved yet", () => {
    const pills = activeRecipeFilters({ ...EMPTY_RECIPE_FILTERS, ingredientFoodId: "food-1" });
    expect(pills).toEqual([{ key: "ingredientFoodId", label: "Ingredient" }]);
  });
});

/** RecipeFilterGroups renders the ingredient picker, which reads the foods
 * list through react-query — needs a client even though nothing seeds it. */
function renderFilterGroups(props: Omit<Parameters<typeof RecipeFilterGroups>[0], "onChange"> & { onChange?: () => void }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MemoryRouter, null, createElement(RecipeFilterGroups, { onChange: () => {}, ...props })),
    ),
  );
}

describe("RecipeFilterGroups (the sheet's chip groups, rendered open)", () => {
  it("renders a Nutrition group holding both toggles, with vitamin C pressed beside iron focus", () => {
    const html = renderFilterGroups({
      maxAgeMonths: undefined,
      allergen: undefined,
      ironFocus: false,
      vitaminCHigh: true,
      ingredientFoodId: "",
    });
    const nutrition = html.indexOf(">Nutrition<");
    expect(nutrition).toBeGreaterThan(-1);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Iron focus</);
    expect(html).toMatch(/aria-pressed="true"[^>]*>High vitamin C</);
    // Both toggles live in the same group, after the heading.
    const ironFocusIdx = html.indexOf(">Iron focus<");
    const vitCIdx = html.indexOf(">High vitamin C<");
    expect(ironFocusIdx).toBeGreaterThan(nutrition);
    expect(vitCIdx).toBeGreaterThan(ironFocusIdx);
  });

  it("renders the age, allergen and ingredient-picker groups too", () => {
    const html = renderFilterGroups({
      maxAgeMonths: 9,
      allergen: "egg",
      ironFocus: false,
      vitaminCHigh: false,
      ingredientFoodId: "",
    });
    expect(html).toContain(">Age<");
    expect(html).toContain(">Allergen<");
    expect(html).toContain("Contains ingredient");
    expect(html).toMatch(/aria-pressed="true"[^>]*>9m\+</);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Egg</);
  });
});

describe("EMPTY_RECIPE_FILTERS (what Clear all applies)", () => {
  it("has every key off", () => {
    expect(Object.keys(EMPTY_RECIPE_FILTERS).sort()).toEqual([
      "allergen",
      "ingredientFoodId",
      "ironFocus",
      "maxAgeMonths",
      "vitaminCHigh",
    ]);
    expect(EMPTY_RECIPE_FILTERS.maxAgeMonths).toBeUndefined();
    expect(EMPTY_RECIPE_FILTERS.allergen).toBeUndefined();
    expect(EMPTY_RECIPE_FILTERS.ironFocus).toBe(false);
    expect(EMPTY_RECIPE_FILTERS.vitaminCHigh).toBe(false);
    expect(EMPTY_RECIPE_FILTERS.ingredientFoodId).toBe("");
    expect(activeRecipeFilters(EMPTY_RECIPE_FILTERS)).toEqual([]);
  });
});

// Item 255: the single-food "Simple <food>" basics are marked on the row.
// The card derives it from the ingredient names it already renders — there is
// no stored flag and no extra field.
describe("RecipeCard — Basic badge", () => {
  it("badges a one-ingredient recipe Basic", () => {
    const html = renderCard(recipe({ title: "Simple carrot", ingredientNames: ["Carrot"] }));
    expect(html).toContain(">Basic<");
  });

  it("leaves a multi-ingredient recipe unbadged", () => {
    expect(renderCard(recipe({ ingredientNames: ["Banana", "Oats"] }))).not.toContain(">Basic<");
  });

  it("leaves a recipe with no listed ingredients unbadged", () => {
    expect(renderCard(recipe({ ingredientNames: [] }))).not.toContain(">Basic<");
  });

  it("gives the badge the neutral tone, not a nutrition or alert tone", () => {
    const html = renderCard(recipe({ ingredientNames: ["Carrot"] }));
    expect(html).toMatch(/class="[^"]*color-neutral-soft[^"]*"[^>]*>Basic</);
  });
});
