// Plan SPEC §5 (ledger 902): one item on the plate, as the CD boards draw it.
// Markup is pinned with renderToString; behaviour by calling the rows as
// plain functions with React's useState and the recipe query mocked (the
// vi.hoisted store idiom), firing their handlers by hand. No DOM.
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageItem } from "@blw/shared";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  return {
    store,
    recipeIds: [] as (string | undefined)[],
    detail: { data: undefined, isError: false } as { data: unknown; isError: boolean },
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
      const set = (value: unknown) => {
        store.states[i] = typeof value === "function" ? (value as (previous: unknown) => unknown)(store.states[i]) : value;
      };
      return [store.states[i], set];
    },
  };
});

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), useState: h.useState }));
vi.mock("../catalog/hooks.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRecipe: (recipeId: string | undefined) => {
    h.recipeIds.push(recipeId);
    return recipeId ? h.detail : { data: undefined, isError: false };
  },
}));

import { PlateItemRow } from "./PlateItemRow.js";
import { containerEntry, type ContainerEntry, type PlateAction, type PlateEntry, type RecipeEntry } from "./plate.js";

interface El {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
}

/** The row's whole tree, every component called through (they are hook-free
 * but for the mocked ones), so handlers can be found and fired. */
function expand(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(expand);
  if (!node || typeof node !== "object" || !("props" in node)) return node;
  const el = node as El;
  if (typeof el.type === "function") return expand((el.type as (props: unknown) => unknown)(el.props));
  return { ...el, props: { ...el.props, children: expand(el.props.children) } };
}
function all(node: unknown, match: (el: El) => boolean, out: El[] = []): El[] {
  if (Array.isArray(node)) node.forEach((child) => all(child, match, out));
  else if (node && typeof node === "object" && "props" in node) {
    const el = node as El;
    if (match(el)) out.push(el);
    all(el.props.children, match, out);
  }
  return out;
}
const byLabel = (tree: unknown, label: string) => {
  const found = all(tree, (el) => el.props["aria-label"] === label);
  expect(found).toHaveLength(1);
  return found[0]!;
};
const click = (el: El) => (el.props.onClick as () => void)();

const actions: PlateAction[] = [];
const dispatch = (action: PlateAction) => actions.push(action);
function tree(entry: PlateEntry, disabled = false, extra: Record<string, unknown> = {}) {
  h.store.i = 0;
  return expand(createElement(PlateItemRow, { entry, dispatch, disabled, ...extra }));
}
function html(entry: PlateEntry, planning = false, extra: Record<string, unknown> = {}) {
  h.store.i = 0;
  return renderToString(createElement(PlateItemRow, { entry, dispatch, planning, ...extra }));
}

beforeEach(() => {
  h.store.states = [];
  h.recipeIds = [];
  h.detail = { data: undefined, isError: false };
  actions.length = 0;
});

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const EGG = { id: id(3), slug: "egg", name: "Egg", category: "protein" as const, emoji: null };
const PASTA = { id: id(10), title: "Creamy Cashew & Broccoli Pasta" };
const ingredient = (n: number, name: string) => ({
  foodId: id(n),
  foodSlug: name.toLowerCase(),
  foodName: name,
  isCustom: false,
  foodEmoji: null,
  quantityNote: "",
  allergens: [],
});
const PASTA_DETAIL = {
  id: PASTA.id,
  title: PASTA.title,
  // The recipe's own order; the ticks list them A–Z.
  ingredients: [ingredient(6, "Wheat Pasta"), ingredient(1, "Broccoli"), ingredient(4, "Cashews"), ingredient(5, "Garlic")],
};
const CASHEW = { id: id(4), slug: "cashews", name: "Cashews", emoji: null };

const FOOD: PlateEntry = { kind: "food", food: EGG, rating: 3 };
const RECIPE: RecipeEntry = { kind: "recipe", recipe: PASTA, leftOut: [], savedLeftOut: [], rating: null };
const CONTAINER: StorageItem = {
  id: id(20),
  label: null,
  foods: [
    { id: id(1), slug: "broccoli", name: "Broccoli", emoji: null },
    { id: id(2), slug: "carrot", name: "Carrot", emoji: null, deleted: true },
  ],
  recipeId: null,
  recipeTitle: null,
  preparedAt: "2026-10-14T10:00:00.000Z",
  location: "freezer",
  status: "active",
  statusChangedAt: "2026-10-14T10:00:00.000Z",
  expiresAt: "2026-11-14T10:00:00.000Z",
  useSoon: false,
  expired: false,
  quantityNote: null,
  servingsTotal: 4,
  servingsLeft: 4,
  bestBy: null,
  notes: null,
};
const MUFFINS: StorageItem = {
  ...CONTAINER,
  id: id(21),
  foods: [],
  recipeId: id(11),
  recipeTitle: "Broccoli Cheese Egg Muffins",
  location: "fridge",
  servingsTotal: 6,
  servingsLeft: 6,
};

describe("a fresh food", () => {
  it("is the 40px plate, its name with the stars right under it, and × (CD-Log-Meal)", () => {
    const out = html(FOOD);
    expect(out).toMatch(/^<li class="@container rounded-\[var\(--radius-lg\)\] border border-\[var\(--color-divider\)\] bg-\[var\(--color-bg-elevated\)\]/);
    expect(out).toContain('<p class="font-semibold leading-[1.3] break-words text-[var(--color-text)]">Egg</p>');
    expect(out).toContain('role="radiogroup" aria-label="Rating for Egg"');
    expect(out).toContain('aria-label="Remove Egg"');
    expect(out).toContain('aria-label="Clear rating for Egg"');
    expect(out).not.toContain("Ingredients");
  });

  it("drops the star line below the plate, at the item's left edge, when the name column is under 211px", () => {
    const out = html(FOOD);
    // 40 plate + 2×12 gaps + 44 × = 108: under 319px of item, the stars span all three columns.
    expect(out).toContain("grid grid-cols-[40px_minmax(0,1fr)_44px] items-start gap-x-3");
    expect(out).toContain('class="col-start-2 -ml-[9px] @max-[319px]:col-span-3 @max-[319px]:col-start-1"');
    expect(out.match(/row-span-2 @max-\[319px\]:row-span-1/g)).toHaveLength(2);
  });

  it("rates and removes through the reducer", () => {
    const t = tree(FOOD);
    click(byLabel(t, "4 stars"));
    click(byLabel(t, "3 stars"));
    click(byLabel(t, "Remove Egg"));
    expect(actions).toEqual([
      { type: "rate", key: `food:${EGG.id}`, rating: 4 },
      { type: "rate", key: `food:${EGG.id}`, rating: null },
      { type: "remove", key: `food:${EGG.id}` },
    ]);
  });

  it("disables every control while saving", () => {
    const buttons = all(tree(FOOD, true), (el) => el.type === "button");
    expect(buttons.length).toBeGreaterThan(5);
    expect(buttons.every((button) => button.props.disabled === true)).toBe(true);
  });
});

describe("a fresh recipe (CD-Leave-Out)", () => {
  it("closed: Ingredients, collapsed, and nothing loads yet", () => {
    const out = html(RECIPE);
    expect(out).toContain(`aria-expanded="false" aria-controls="ingredients-${PASTA.id}"`);
    expect(out).toContain('<span class="leading-4">Ingredients</span>');
    expect(out).not.toContain("Left out");
    expect(out).not.toContain("Untick");
    expect(h.recipeIds).toEqual([undefined]);
  });

  it("shows Left out: … beside Ingredients once something is unticked", () => {
    const out = html({ ...RECIPE, leftOut: [CASHEW] });
    expect(out).toContain(
      '<span class="font-semibold text-[var(--color-apricot-text)]">Left out: <!-- -->Cashews</span><span aria-hidden="true" class="mx-1.5">·</span>',
    );
  });

  it("opening loads the ingredients and lists them A–Z as ticks; a left-out one is unticked and struck through", () => {
    let t = tree({ ...RECIPE, leftOut: [CASHEW] });
    click(all(t, (el) => el.props["aria-controls"] === `ingredients-${PASTA.id}`)[0]!);
    h.detail = { data: PASTA_DETAIL, isError: false };
    const out = html({ ...RECIPE, leftOut: [CASHEW] });
    expect(h.recipeIds.at(-1)).toBe(PASTA.id);
    expect(out).toContain(`aria-expanded="true" aria-controls="ingredients-${PASTA.id}"`);
    expect(out).toContain(`<div id="ingredients-${PASTA.id}"`);
    expect(out).toContain(`<p id="ingredients-${PASTA.id}-hint" class="mb-0.5 text-[13px] text-[var(--color-text-muted)]">Untick anything you left out this time.</p>`);
    expect(out).toContain(`<ul aria-label="Ingredients of ${PASTA.title.replace("&", "&amp;")}" aria-describedby="ingredients-${PASTA.id}-hint"`);
    expect([...out.matchAll(/type="checkbox"([^>]*)\/><span class="([^"]*)">([^<]*)</g)].map((m) => [m[3], m[1]!.includes('checked=""'), m[2]])).toEqual([
      ["Broccoli", true, "text-[var(--color-text)]"],
      ["Cashews", false, "text-[var(--color-text-muted)] line-through"],
      ["Garlic", true, "text-[var(--color-text)]"],
      ["Wheat Pasta", true, "text-[var(--color-text)]"],
    ]);

    t = tree({ ...RECIPE, leftOut: [CASHEW] });
    const garlic = all(t, (el) => el.type === "input")[2]!;
    (garlic.props.onChange as () => void)();
    expect(actions).toEqual([
      {
        type: "toggleLeftOut",
        key: `recipe:${PASTA.id}`,
        food: { id: id(5), slug: "garlic", name: "Garlic", emoji: null, deleted: undefined },
        // The panel's ingredients (A–Z), so the plate can tell when all are out (VERIFY-p2-c1 #3).
        ingredientIds: [id(1), id(4), id(5), id(6)],
      },
    ]);
  });

  it("rebuilt from a meal logged before the plate (inferred): no Ingredients, no Left out (VERIFY-p2-c1 #1)", () => {
    const inferred = { ...RECIPE, id: id(30), inferred: true };
    const out = html(inferred);
    expect(out).not.toContain("Ingredients");
    expect(out).not.toContain("aria-controls");
    expect(out).not.toContain("Left out");
    expect(out).toContain('role="radiogroup" aria-label="Rating for Creamy Cashew');
    expect(out).toContain(`aria-label="Remove ${PASTA.title.replace("&", "&amp;")}"`);
    // The same recipe saved with the plate keeps its Ingredients.
    expect(html({ ...inferred, inferred: false })).toContain(">Ingredients</span>");
  });

  it("while the ingredients load, a placeholder; if they can't, says so", () => {
    h.store.states[0] = true;
    expect(html(RECIPE)).toMatch(/Untick anything you left out this time\.<\/p><div class="skeleton [^"]*" aria-hidden="true"><\/div>/);
    h.detail = { data: undefined, isError: true };
    expect(html(RECIPE)).toContain("Couldn&#x27;t load the ingredients.");
  });
});

describe("a container", () => {
  it("holding one thing: its stars right under the title, a stepper, no × on a new one (CD-Serve-From-Storage)", () => {
    const out = html(containerEntry(MUFFINS));
    expect(out).toContain(">Broccoli Cheese Egg Muffins</p>");
    expect(out).toContain('<p class="text-[13px] leading-[1.35] text-[var(--color-text-muted)]">Fridge · 6 of 6 left</p>');
    expect(out).toContain('<div class="mt-0.5 ml-[43px]"><div class="flex flex-wrap items-center"><div role="radiogroup" aria-label="Rating for Broccoli Cheese Egg Muffins"');
    expect(out).toContain('role="group" aria-label="Servings: Broccoli Cheese Egg Muffins"');
    expect(out).toContain('<span aria-live="polite" class="min-w-6 text-center text-sm font-medium tabular-nums text-[var(--color-text)]">1</span>');
    expect(out).not.toContain("Remove");
  });

  it("holding several: a line per food (24px plate, name, stars) and the two-plate mark (CD-Log-Meal)", () => {
    const out = html(containerEntry(CONTAINER));
    expect(out).toContain(">Broccoli, Carrot (deleted)</p>");
    expect(out.match(/width:28px;height:28px/g)).toHaveLength(2);
    expect(out.match(/width:24px;height:24px/g)).toHaveLength(2);
    expect(out).toContain('aria-label="Rating for Broccoli"');
    expect(out).toContain('aria-label="Rating for Carrot"');
    expect(out).toContain('Carrot<span class="font-normal text-[var(--color-text-muted)]"> <!-- -->(deleted)</span></p>');
  });

  it("steps servings and rates each part through the reducer", () => {
    const entry: ContainerEntry = { ...containerEntry(CONTAINER), servings: 2 };
    const t = tree(entry);
    click(byLabel(t, "Decrease servings"));
    click(byLabel(t, "Increase servings"));
    click(all(t, (el) => el.props["aria-label"] === "5 stars")[1]!);
    expect(actions).toEqual([
      { type: "servings", key: `storage:${CONTAINER.id}`, servings: 1 },
      { type: "servings", key: `storage:${CONTAINER.id}`, servings: 3 },
      { type: "rate", key: `storage:${CONTAINER.id}`, partId: id(2), rating: 5 },
    ]);
  });

  it("kept on a saved meal: stepper and × (chair decision); × puts it back through the reducer", () => {
    const t = tree({ ...containerEntry(MUFFINS), savedServings: 1 });
    byLabel(t, "Decrease servings");
    click(byLabel(t, "Remove Broccoli Cheese Egg Muffins"));
    expect(actions).toEqual([{ type: "remove", key: `storage:${MUFFINS.id}` }]);
  });

  it("served before servings were recorded: × only; without Storage's live copy it says From storage", () => {
    const out = html({ ...containerEntry(MUFFINS), servings: null, savedServings: null, container: undefined });
    expect(out).not.toContain("servings");
    expect(out).toContain('aria-label="Remove Broccoli Cheese Egg Muffins"');
    expect(out).toContain(">From storage</p>");
  });

  // CD-Serve-Ran-Out: × and the flag, no stepper and no stars.
  it("run out (Storage says 0 left): its line, the flag, and × in place of the stepper and stars", () => {
    const entry = containerEntry({ ...MUFFINS, servingsLeft: 0 });
    const out = html(entry);
    expect(out).toContain(">Fridge · 0 of 6 left</p>");
    expect(out).toMatch(
      /<p class="mt-2 ml-\[52px\] flex gap-2 rounded-\[10px\] bg-\[var\(--color-caution-soft\)\] [^"]*text-\[var\(--color-caution-soft-text\)\]"><svg aria-hidden="true"[^>]*>.*<\/svg>None left\. Add a new batch or remove it\.<\/p>/,
    );
    expect(out).not.toContain("Servings:");
    expect(out).not.toContain('role="radiogroup"');
    click(byLabel(tree(entry), "Remove Broccoli Cheese Egg Muffins"));
    expect(actions).toEqual([{ type: "remove", key: `storage:${MUFFINS.id}` }]);
    // A finished or discarded one too; one the saved meal holds never is.
    expect(html(containerEntry({ ...MUFFINS, status: "discarded" }))).toContain("None left.");
    expect(html({ ...containerEntry({ ...MUFFINS, status: "finished", servingsLeft: 0 }), savedServings: 2 })).not.toContain(
      "None left.",
    );
    // No way to add a batch was given: × is the only way forward.
    expect(out).not.toContain("Add to storage");
  });

  // CD-Ran-Out-Add: the second way forward, under the flag.
  it("run out with a way to add a batch: a tonal Add to storage named for the item, which hands the row over; offline it waits", () => {
    const entry = containerEntry({ ...MUFFINS, servingsLeft: 0, status: "finished" });
    const asked: unknown[] = [];
    const onAddToStorage = (picked: unknown) => asked.push(picked);
    const out = html(entry, false, { onAddToStorage });
    expect(out).toMatch(/None left\. Add a new batch or remove it\.<\/p><button[^>]*aria-label="Add to storage: Broccoli Cheese Egg Muffins"[^>]*>Add to storage<\/button>/);
    expect(out).toContain("bg-[var(--color-success)]");
    click(byLabel(tree(entry, false, { onAddToStorage }), "Add to storage: Broccoli Cheese Egg Muffins"));
    expect(asked).toEqual([entry]);
    expect(actions).toEqual([]);
    const offline = byLabel(tree(entry, false, { onAddToStorage, offline: true }), "Add to storage: Broccoli Cheese Egg Muffins");
    expect(offline.props).toMatchObject({ disabled: true, "aria-describedby": "plate-offline" });
    // A container with servings left never offers it.
    expect(html(containerEntry(MUFFINS), false, { onAddToStorage })).not.toContain("Add to storage");
  });

  it("planned for more than is left: the stepper stays, and the row says Only {n} left.", () => {
    const short = { ...containerEntry({ ...MUFFINS, servingsLeft: 1 }), servings: 1, planned: 2 };
    const out = html(short);
    expect(out).toMatch(/<\/svg>Only <!-- -->1<!-- --> left\.<\/p>/);
    expect(out).toContain('aria-label="Servings: Broccoli Cheese Egg Muffins"');
    expect(out).not.toContain("None left.");
    // As planned, or untracked, or not planned at all: nothing to say.
    expect(html({ ...short, planned: 1 })).not.toContain("Only");
    expect(html({ ...containerEntry({ ...MUFFINS, servingsTotal: null, servingsLeft: null }), planned: 3 })).not.toContain("Only");
    expect(html(containerEntry({ ...MUFFINS, servingsLeft: 1 }))).not.toContain("Only");
    // Planning never says it.
    expect(html(short, true)).not.toContain("Only");
  });

  it("lets the controls wrap under a title that would get narrower than 8rem", () => {
    const out = html(containerEntry(MUFFINS));
    expect(out).toContain('<div class="flex flex-wrap items-center gap-x-3">');
    expect(out).toContain('<div class="min-w-32 flex-1">');
    expect(out).toContain('<div class="ml-auto flex shrink-0 items-center gap-1.5">');
  });
});

describe("planning (Plan a meal, CD-Plan-Meal)", () => {
  it("a fresh food or recipe has no stars: the plate, the name centred beside it, and ×", () => {
    const food = html(FOOD, true);
    expect(food).not.toContain("Rating for");
    expect(food).toContain("grid grid-cols-[40px_minmax(0,1fr)_44px] items-center gap-x-3");
    expect(food).toContain('aria-label="Remove Egg"');
    const recipe = html({ ...RECIPE, leftOut: [CASHEW] }, true);
    expect(recipe).not.toContain("Rating for");
    // Leaving an ingredient out is planned too.
    expect(recipe).toContain("Left out: ");
    expect(recipe).toContain(">Ingredients</span>");
  });

  it("a container is only planned: its line and stepper, no part stars, and never \"None left\"", () => {
    const tub = html(containerEntry(CONTAINER), true);
    expect(tub).toContain(">Freezer · 4 of 4 left</p>");
    expect(tub).toMatch(/aria-label="Servings: Broccoli, Carrot/);
    expect(tub).not.toContain("Rating for");
    expect(tub).not.toContain(">Broccoli</p>");
    const empty = html(containerEntry({ ...MUFFINS, servingsLeft: 0 }), true);
    expect(empty).not.toContain("None left.");
    expect(empty).toContain('aria-label="Servings: Broccoli Cheese Egg Muffins"');
    expect(empty).not.toContain('aria-label="Remove Broccoli Cheese Egg Muffins"');
  });
});
