// Drives LogFoodForm's OWN leftovers state without a DOM. The suite next door
// renders `LeftoversFields` directly, which means every assertion about the
// "Save as" choice there is really an assertion about the value the TEST
// passed in — so the form's own `useState<ContainerChoice>("one")` was
// unpinned: flipping it to `"separate"` left the whole client suite green
// while a three-food meal's leftovers quietly became three containers. This
// suite opens the leftovers block and saves, so the default is judged where
// it is read: in the `createStorageItem` payload.
//
// Harness idiom: the vi.hoisted hook store from TourDialog.handlers.test.ts.
import { describe, expect, it, vi } from "vitest";
import type { CreateStorageItemInput, MealItem } from "@blw/shared";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], refs: [] as { current: unknown }[], i: 0, r: 0 };
  const meals: { input: unknown; options: { onSuccess?: () => void } }[] = [];
  const updates: { id: string; input: unknown }[] = [];
  const containers: unknown[] = [];
  // Ledger 759: the foods list and the recipe details the form reads.
  const foods: { id: string; slug: string; name: string }[] = [];
  const details: Record<string, { id: string; title: string; ingredients: { foodId: string; foodSlug: string }[] }> = {};

  return {
    store,
    meals,
    updates,
    containers,
    foods,
    details,
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
      const set = (value: unknown) => {
        store.states[i] = typeof value === "function" ? (value as (previous: unknown) => unknown)(store.states[i]) : value;
      };
      return [store.states[i], set];
    },
    useRef: (init: unknown) => {
      const i = store.r++;
      if (!(i in store.refs)) store.refs[i] = { current: init };
      return store.refs[i];
    },
    reset: () => {
      store.states = [];
      store.refs = [];
      store.i = 0;
      store.r = 0;
      meals.length = 0;
      updates.length = 0;
      containers.length = 0;
      foods.length = 0;
      for (const key of Object.keys(details)) delete details[key];
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useState: h.useState,
    useRef: h.useRef,
    useMemo: (factory: () => unknown) => factory(),
    // The only effect here is the recipe-ingredient merge; it runs on every
    // render, as the real one (no dependency list) does after each commit.
    useEffect: (effect: () => void) => {
      effect();
    },
  };
});

vi.mock("../../catalog/hooks.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useFoods: () => ({ data: { foods: h.foods } }),
    useRecipeDetails: (ids: string[]) => ids.map((id) => ({ data: h.details[id] })),
  };
});

vi.mock("../hooks.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useCreateMeal: () => ({
      mutate: (input: unknown, options: { onSuccess?: () => void } = {}) => {
        h.meals.push({ input, options });
      },
      isPending: false,
      isError: false,
    }),
    useUpdateMeal: () => ({
      mutate: (variables: { id: string; input: unknown }) => {
        h.updates.push(variables);
      },
      isPending: false,
      isError: false,
    }),
  };
});

vi.mock("../../storage/hooks.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useCreateStorageItem: () => ({
      mutate: (input: unknown) => {
        h.containers.push(input);
      },
      isPending: false,
    }),
  };
});

import { LeftoversFields, LogFoodForm } from "./LogFoodForm.js";
import { MealRatingsField } from "./MealRatingsField.js";
import { Switch } from "../../../components/ui/Switch.js";
import { RecipePicker } from "../../catalog/components/RecipePicker.js";
import { FoodPicker } from "../../catalog/components/FoodPicker.js";

interface Rendered {
  type: unknown;
  props: Record<string, unknown>;
}

/** The first element of this component type anywhere in the returned tree. */
function find(node: unknown, type: unknown): Rendered | null {
  if (node === null || node === undefined || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, type);
      if (found) return found;
    }
    return null;
  }
  const element = node as Rendered;
  if (element.type === type) return element;
  return find(element.props?.children, type);
}

const FOOD_IDS = ["food-1", "food-2", "food-3"];

/** Renders the real form against the hook store — state survives between
 * calls, so a second render sees whatever the first one's callbacks set. */
function render(props: Record<string, unknown> = {}): Rendered {
  h.store.i = 0;
  h.store.r = 0;
  return (LogFoodForm as unknown as (props: unknown) => Rendered)({
    babyId: "baby-1",
    onDone: () => {},
    // The meal this suite is about: three foods from the hand-built picker,
    // no recipe — the case that used to ask "Which food?" and keep one.
    initialFoodIds: FOOD_IDS,
    ...props,
  });
}

function openLeftovers(tree: Rendered) {
  const toggle = find(tree, Switch);
  if (!toggle) throw new Error("create mode should render the leftovers switch");
  (toggle.props.onChange as (open: boolean) => void)(true);
}

function leftovers(tree: Rendered): Rendered {
  const fields = find(tree, LeftoversFields);
  if (!fields) throw new Error("the leftovers block should be open");
  return fields;
}

/** Submits, then runs the meal mutation's success callback — the storage half
 * only ever starts once the meal itself has saved. */
function saveAndSettle(tree: Rendered) {
  (tree.props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: () => {} });
  expect(h.meals).toHaveLength(1);
  h.meals[0]!.options.onSuccess?.();
}

describe("LogFoodForm's own 'Save as' state (item 348)", () => {
  it("opens the leftovers block on One container", () => {
    h.reset();
    openLeftovers(render());

    expect(leftovers(render()).props.containerChoice).toBe("one");
  });

  it("saves a three-food meal's leftovers as ONE container when nobody touches the choice", () => {
    h.reset();
    openLeftovers(render());

    const tree = render();
    expect(leftovers(tree).props.containerChoice).toBe("one");
    saveAndSettle(tree);

    expect(h.containers).toHaveLength(1);
    const input = h.containers[0] as CreateStorageItemInput;
    expect(input.foodIds).toEqual(FOOD_IDS);
    expect(input.separateItems).toBe(false);
  });

  it("saves separate containers only once the parent asks for them", () => {
    h.reset();
    openLeftovers(render());
    (leftovers(render()).props.onContainerChoiceChange as (choice: string) => void)("separate");

    const tree = render();
    expect(leftovers(tree).props.containerChoice).toBe("separate");
    saveAndSettle(tree);

    expect((h.containers[0] as CreateStorageItemInput).separateItems).toBe(true);
  });
});

describe("LogFoodForm's own rating state (item 574)", () => {
  /** The three hand-picked foods, named, so each gets its star row. */
  function seedFoods() {
    h.foods.push(...FOOD_IDS.map((id) => ({ id, slug: id, name: id })));
  }

  it("sends each food's stars with the meal, null for the unrated, and no recipe rating", () => {
    h.reset();
    seedFoods();
    const field = find(render(), MealRatingsField);
    if (!field) throw new Error("the ratings block should render");
    (field.props.onChange as (key: string, value: number | null) => void)("food-2", 5);
    (find(render(), MealRatingsField)!.props.onChange as (key: string, value: number | null) => void)("food-3", 2);
    // An accidental rating, cleared again.
    (find(render(), MealRatingsField)!.props.onChange as (key: string, value: number | null) => void)("food-3", null);

    saveAndSettle(render());

    const input = h.meals[0]!.input as { foodRatings?: unknown; recipeRating?: unknown };
    expect(input.foodRatings).toEqual({ "food-1": null, "food-2": 5, "food-3": null });
    expect(input.recipeRating).toBeUndefined();
  });

  it("keeps a chip's stars when it is removed and re-added", () => {
    h.reset();
    seedFoods();
    (find(render(), MealRatingsField)!.props.onChange as (key: string, value: number | null) => void)("food-1", 4);
    (find(render(), FoodPicker)!.props.onChange as (next: string[]) => void)(["food-2", "food-3"]);
    (find(render(), FoodPicker)!.props.onChange as (next: string[]) => void)(["food-2", "food-3", "food-1"]);
    saveAndSettle(render());
    expect((h.meals[0]!.input as { foodRatings?: unknown }).foodRatings).toEqual({ "food-2": null, "food-3": null, "food-1": 4 });
  });
});

// ---------------------------------------------------------------------------
// Ledger 759: several recipes per meal.
// ---------------------------------------------------------------------------

const LENTIL = "rA";
const SALMON = "rB";

/** Lentil Patties (lentils, egg, oats) and Salmon Cakes (salmon, egg). */
function seedRecipes() {
  h.foods.push(
    ...["lentils", "egg", "oats", "salmon", "banana"].map((slug) => ({ id: slug, slug, name: slug[0]!.toUpperCase() + slug.slice(1) })),
  );
  const ingredients = (slugs: string[]) => slugs.map((slug) => ({ foodId: slug, foodSlug: slug }));
  h.details[LENTIL] = { id: LENTIL, title: "Lentil Patties", ingredients: ingredients(["lentils", "egg", "oats"]) };
  h.details[SALMON] = { id: SALMON, title: "Salmon Cakes", ingredients: ingredients(["salmon", "egg"]) };
}

function pickRecipes(ids: string[], props: Record<string, unknown> = {}) {
  const picker = find(render(props), RecipePicker)!;
  expect(picker.props.multiple).toBe(true);
  (picker.props.onChange as (next: string[]) => void)(ids);
}

function foodsOn(props: Record<string, unknown> = {}): string[] {
  return find(render(props), FoodPicker)!.props.value as string[];
}

function rate(key: string, value: number | null, props: Record<string, unknown> = {}) {
  (find(render(props), MealRatingsField)!.props.onChange as (key: string, value: number | null) => void)(key, value);
}

function rowLabels(props: Record<string, unknown> = {}): string[] {
  return (find(render(props), MealRatingsField)!.props.rows as { label: string }[]).map((row) => row.label);
}

describe("LogFoodForm with several recipes (ledger 759)", () => {
  const fresh = { initialFoodIds: ["banana"] };

  it("fills in each picked recipe's ingredients, once each, after the hand-picked food", () => {
    h.reset();
    seedRecipes();
    pickRecipes([LENTIL], fresh);
    render(fresh); // the effect adds Lentil Patties' foods
    pickRecipes([LENTIL, SALMON], fresh);
    render(fresh);
    expect(foodsOn(fresh)).toEqual(["banana", "lentils", "egg", "oats", "salmon"]);
  });

  it("removing a recipe removes only the foods it alone added", () => {
    h.reset();
    seedRecipes();
    pickRecipes([LENTIL], fresh);
    render(fresh);
    pickRecipes([LENTIL, SALMON], fresh);
    render(fresh);

    pickRecipes([SALMON], fresh);
    // Egg stays (Salmon Cakes needs it); Banana was picked by hand.
    expect(foodsOn(fresh)).toEqual(["banana", "egg", "salmon"]);
    pickRecipes([], fresh);
    expect(foodsOn(fresh)).toEqual(["banana"]);
  });

  it("never takes off a food the parent picked by hand, even when a removed recipe lists it", () => {
    h.reset();
    seedRecipes();
    const props = { initialFoodIds: ["egg"] };
    pickRecipes([SALMON], props);
    render(props);
    expect(foodsOn(props)).toEqual(["egg", "salmon"]);
    pickRecipes([], props);
    expect(foodsOn(props)).toEqual(["egg"]);
  });

  it("stars: one row per recipe, then each food no picked recipe lists (MR-Log-Meal)", () => {
    h.reset();
    seedRecipes();
    pickRecipes([LENTIL, SALMON], fresh);
    render(fresh);
    expect(rowLabels(fresh)).toEqual(["Lentil Patties", "Salmon Cakes", "Banana"]);
  });

  it("saves the new shape only: recipeIds in pick order, recipeRatings and the extras' foodRatings", () => {
    h.reset();
    seedRecipes();
    pickRecipes([SALMON, LENTIL], fresh);
    render(fresh);
    rate("recipe:rB", 4, fresh);
    rate("banana", 5, fresh);
    saveAndSettle(render(fresh));

    const input = h.meals[0]!.input as Record<string, unknown>;
    expect(input.recipeIds).toEqual([SALMON, LENTIL]);
    expect(input.recipeRatings).toEqual({ rB: 4, rA: null });
    expect(input.foodRatings).toEqual({ banana: 5 });
    expect(input).not.toHaveProperty("recipeId");
    expect(input).not.toHaveProperty("recipeRating");
  });

  // Item 579: A's stars must never be saved as B's.
  it("a recipe taken off loses its stars; picked again it starts unrated", () => {
    h.reset();
    seedRecipes();
    pickRecipes([LENTIL], fresh);
    rate("recipe:rA", 3, fresh);
    pickRecipes([], fresh);
    pickRecipes([LENTIL], fresh);
    render(fresh);
    saveAndSettle(render(fresh));
    expect((h.meals[0]!.input as { recipeRatings?: unknown }).recipeRatings).toEqual({ rA: null });
  });

  it("leftovers of two recipes: Save as is asked, and one container is the default", () => {
    h.reset();
    seedRecipes();
    pickRecipes([LENTIL, SALMON], fresh);
    render(fresh);
    openLeftovers(render(fresh));
    const tree = render(fresh);
    expect(leftovers(tree).props.source).toEqual({ kind: "recipe", recipeIds: [LENTIL, SALMON] });
    saveAndSettle(tree);

    const input = h.containers[0] as CreateStorageItemInput;
    expect(input.recipeIds).toEqual([LENTIL, SALMON]);
    expect(input.separateItems).toBe(false);
    expect(input).not.toHaveProperty("recipeId");
    expect(input).not.toHaveProperty("foodIds");
  });

  it("leftovers of two recipes in separate containers", () => {
    h.reset();
    seedRecipes();
    pickRecipes([LENTIL, SALMON], fresh);
    render(fresh);
    openLeftovers(render(fresh));
    (leftovers(render(fresh)).props.onContainerChoiceChange as (choice: string) => void)("separate");
    saveAndSettle(render(fresh));
    expect(h.containers[0]).toMatchObject({ recipeIds: [LENTIL, SALMON], separateItems: true });
  });

  it("leftovers of one recipe stay the plain recipe container", () => {
    h.reset();
    seedRecipes();
    pickRecipes([SALMON], fresh);
    render(fresh);
    openLeftovers(render(fresh));
    saveAndSettle(render(fresh));
    expect(h.containers[0]).toMatchObject({ recipeId: SALMON });
    expect(h.containers[0]).not.toHaveProperty("separateItems");
  });
});

describe("Edit meal with several recipes (ledger 759)", () => {
  // Saved: Lentil Patties + Salmon Cakes, with Oats taken off back then, and
  // a rated Banana beside them.
  const meal: MealItem = {
    id: "meal-1",
    babyId: "baby-1",
    servedAt: new Date(2026, 9, 6, 12, 0).toISOString(),
    reactionNote: null,
    notes: null,
    recipes: [
      { id: LENTIL, title: "Lentil Patties", rating: 5 },
      { id: SALMON, title: "Salmon Cakes", rating: null },
    ],
    recipeId: LENTIL,
    recipeTitle: "Lentil Patties",
    recipeRating: 5,
    foods: ["lentils", "egg", "salmon", "banana"].map((id) => ({
      id,
      slug: id,
      name: id[0]!.toUpperCase() + id.slice(1),
      category: "protein" as const,
      storageItemId: null,
      rating: id === "banana" ? 2 : null,
      inRecipe: id !== "banana",
    })),
  };
  const edit = { meal };

  function save() {
    (render(edit).props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: () => {} });
    expect(h.updates).toHaveLength(1);
    return h.updates[0]!;
  }

  it("opens with both recipes picked and the saved foods untouched (Oats does not come back)", () => {
    h.reset();
    seedRecipes();
    render(edit);
    render(edit);
    expect(find(render(edit), RecipePicker)!.props.value).toEqual([LENTIL, SALMON]);
    expect(foodsOn(edit)).toEqual(["lentils", "egg", "salmon", "banana"]);
    expect(rowLabels(edit)).toEqual(["Lentil Patties", "Salmon Cakes", "Banana"]);
  });

  it("a note-only save PATCHes the same recipes in the new shape — never the legacy recipeId (no old-app 409)", () => {
    h.reset();
    seedRecipes();
    render(edit);
    const { id, input } = save();
    expect(id).toBe("meal-1");
    expect(input).toMatchObject({
      foodIds: ["lentils", "egg", "salmon", "banana"],
      recipeIds: [LENTIL, SALMON],
      recipeRatings: { rA: 5, rB: null },
      foodRatings: { banana: 2 },
    });
    expect(input).not.toHaveProperty("recipeId");
    expect(input).not.toHaveProperty("recipeRating");
  });

  it("taking the second recipe off removes only its own foods and its stars", () => {
    h.reset();
    seedRecipes();
    render(edit);
    pickRecipes([LENTIL], edit);
    expect(foodsOn(edit)).toEqual(["lentils", "egg", "banana"]);
    const { input } = save();
    expect(input).toMatchObject({ recipeIds: [LENTIL], recipeRatings: { rA: 5 } });
  });

  it("taking the FIRST recipe off keeps Egg (Salmon Cakes lists it) and removes Lentils", () => {
    h.reset();
    seedRecipes();
    render(edit);
    pickRecipes([SALMON], edit);
    expect(foodsOn(edit)).toEqual(["egg", "salmon", "banana"]);
    expect(save().input).toMatchObject({ recipeIds: [SALMON], recipeRatings: { rB: null } });
  });

  it("a meal from an older cached body (no recipes list) edits as its one recipe", () => {
    h.reset();
    seedRecipes();
    const legacy = { meal: { ...meal, recipes: undefined, recipeId: SALMON, recipeTitle: "Salmon Cakes", recipeRating: 3 } };
    render(legacy);
    (render(legacy).props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: () => {} });
    expect(h.updates[0]!.input).toMatchObject({ recipeIds: [SALMON], recipeRatings: { rB: 3 } });
    expect(h.updates[0]!.input).not.toHaveProperty("recipeId");
  });
});
