// The plate (plan SPEC §5, ledger 902) as plain data: what is on it, how Add
// more, ×, stars, the leave-out ticks and the servings stepper change it, and
// the request that saves it. The plate screen only holds this state and
// renders it (native-ready: the same rules for a native shell).
import {
  PLATE_NOT_AN_INGREDIENT,
  PLATE_SERVINGS_MAX,
  planFlags,
  plateKey,
  type CreatePlateMealInput,
  type MealItem,
  type PlateFood,
  type PlateItem,
  type PlateItemInput,
  type PlannedItem,
  type PlannedItemInput,
  type StorageItem,
  type StorageLocation,
} from "@blw/shared";
import { foodPlate, type Plate } from "../catalog/foodEmoji.js";
import { CONTAINER_GONE_FLAG, planFlagLine } from "../plan/copy.js";
import { containerRecipes, type AddMoreChange, type AddMoreIds } from "../storage/addMoreSelection.js";
import { clampServings, hasNoServingsLeft, storageItemTitle } from "../storage/format.js";
import { isBestByBeforePrepared, BEST_BY_BEFORE_PREPARED_MESSAGE } from "../storage/freshness.js";
import { resolveLeftoverSource, type LeftoverSourceKind } from "../storage/leftovers.js";
import type { StoragePrefill } from "../storage/components/AddStorageItemForm.js";
import { ApiError } from "../../lib/api.js";
import type { FormErrors } from "../../lib/forms.js";

/** A food as an item or a container part shows it. Container foods carry no
 * category, so it is optional (the plate tint falls back to the slug). */
export type PlateFoodRef = Pick<PlateFood, "id" | "slug" | "name" | "emoji" | "deleted"> & {
  category?: PlateFood["category"];
};

export interface PlateRecipeRef {
  id: string;
  title: string;
  /** The parent has since deleted this custom recipe; history keeps it (ledger 957). */
  deleted?: boolean | undefined;
}

/** A fresh food. `id` is the saved item's, absent on one this edit adds. */
export interface FoodEntry {
  kind: "food";
  id?: string;
  food: PlateFoodRef;
  rating: number | null;
}

/** A fresh recipe; only these can leave ingredients out (principle 2). */
export interface RecipeEntry {
  kind: "recipe";
  id?: string;
  recipe: PlateRecipeRef;
  /** Current ingredients the baby did not get, A–Z. */
  leftOut: PlateFoodRef[];
  /** What the saved item left out (food ids), so the save sends the leave-out
   * only when the parent changed it: an unchanged one keeps what the item
   * counted (BUILD-2.0). Empty on a new item. */
  savedLeftOut: string[];
  /** The recipe's current ingredients, once its Ingredients panel has
   * loaded them (the first tick sends them), so the plate can tell when
   * every one is left out. */
  ingredientIds?: string[];
  /** A saved item rebuilt from a meal logged before the plate (chair
   * §10.1): it cannot know what was left out, so it offers no Ingredients. */
  inferred?: boolean;
  rating: number | null;
}

/** One rating target inside a container: a food it holds or a recipe. */
export type ContainerPart =
  | { kind: "food"; food: PlateFoodRef; rating: number | null }
  | { kind: "recipe"; recipe: PlateRecipeRef; rating: number | null };

/** A container from storage, rated per part. */
export interface ContainerEntry {
  kind: "storage";
  storageItemId: string;
  title: string;
  location: StorageLocation;
  /** What this plate takes from it. Null on a serve from before that was
   * recorded (0020): it can only be removed, never resized. */
  servings: number | null;
  /** What the saved meal took (null before 0020); absent when the container
   * is new to the plate. A kept one shows × (chair decision, SPEC §5). */
  savedServings?: number | null;
  /** The container as Storage has it now, when loaded: its counts and status. */
  container?: StorageItem;
  /** What the plan asked for, on a planned meal's plate. Serving it, the
   * stepper starts at what is left when that is less (SPEC §11), and the
   * row says so (`shortOf`). */
  planned?: number;
  parts: ContainerPart[];
}

export type PlateEntry = FoodEntry | RecipeEntry | ContainerEntry;

export type PlateAction =
  | { type: "addMore"; change: AddMoreChange }
  | { type: "remove"; key: string }
  /** `partId` (a food or recipe id) names a container's part. */
  | { type: "rate"; key: string; partId?: string; rating: number | null }
  /** `ingredientIds`: the recipe's current ingredients, as the panel shows them. */
  | { type: "toggleLeftOut"; key: string; food: PlateFoodRef; ingredientIds?: string[] }
  | { type: "servings"; key: string; servings: number }
  /** A recipe lost these ingredients since the plate opened: they can no
   * longer be left out (the server's stale leave-out 400). */
  | { type: "dropLeftOut"; recipeId: string; foodIds: string[] }
  /** CD-Ran-Out-Add: a new batch takes a run-out container's place. */
  | { type: "replaceContainer"; key: string; items: StorageItem[] };

/** Ledger 799: one key per thing that can be on the plate once, the server's own rule. */
export function entryKey(entry: PlateEntry): string {
  if (entry.kind === "food") return plateKey({ kind: "food", foodId: entry.food.id });
  if (entry.kind === "recipe") return plateKey({ kind: "recipe", recipeId: entry.recipe.id });
  return plateKey({ kind: "storage", storageItemId: entry.storageItemId });
}

export const partId = (part: ContainerPart): string => (part.kind === "food" ? part.food.id : part.recipe.id);

/**
 * A container as Add more (or Storage's Serve) puts it on the plate, at one
 * serving: one part per recipe, then one per food it holds, as the server
 * expands it (services/plate.ts), so every star names a real part.
 */
export function containerEntry(item: StorageItem): ContainerEntry {
  return {
    kind: "storage",
    storageItemId: item.id,
    title: storageItemTitle(item),
    location: item.location,
    servings: 1,
    container: item,
    parts: [
      ...containerRecipes(item).map((recipe): ContainerPart => ({ kind: "recipe", recipe, rating: null })),
      ...item.foods.map((food): ContainerPart => ({ kind: "food", food, rating: null })),
    ],
  };
}

/**
 * The most servings the stepper allows: what the saved meal took plus what
 * the container has left, while it is active (the server claims an increase
 * only then). An untracked one goes to the input's own ceiling. Before the
 * live container is known, never more than the meal already took.
 */
export function servingsMax(entry: ContainerEntry): number {
  const { container } = entry;
  const extra =
    !container || container.status !== "active"
      ? 0
      : container.servingsTotal === null
        ? PLATE_SERVINGS_MAX
        : (container.servingsLeft ?? 0);
  return Math.min(PLATE_SERVINGS_MAX, (entry.savedServings ?? 0) + extra);
}

/**
 * A container on the plate that Storage says can give nothing more:
 * finished, discarded, or tracked at 0 left (CD-Serve-Ran-Out). It shows
 * "None left. Remove it to serve the rest." and × in place of its stepper,
 * and the plate can't be saved until it comes off. Only one NEW to the
 * plate: what a kept one took is already the meal's.
 */
export function ranOut(entry: ContainerEntry): boolean {
  const { container } = entry;
  return (
    entry.savedServings === undefined &&
    container !== undefined &&
    (container.status !== "active" || hasNoServingsLeft(container))
  );
}

/**
 * The plan card's gone line ("Marked finished in Storage.") for a container
 * Storage has closed, so the plate never says "None left." beside "2 of 2
 * left" (VERIFY-p4-c1 #5): while planning, for any closed container, as the
 * card does; when serving, for a run-out one that still shows servings (one
 * at 0 left keeps "None left."). Its row then shows the location alone.
 */
export function goneLine(entry: ContainerEntry, planning: boolean): string | null {
  const { container } = entry;
  if (!container || container.status === "active") return null;
  if (!planning && (!ranOut(entry) || hasNoServingsLeft(container))) return null;
  return CONTAINER_GONE_FLAG[container.status];
}

/** Plan a meal's day and time as the form has them, and the caller's today
 * and time zone: what the plan card's flags are counted for. */
export interface PlanWhen {
  date: string;
  time: string | null;
  today: string;
  timeZone: string;
}

/**
 * Ledger 971: the line under a container on Plan a meal, the Meal Plan
 * card's own (`planFlagLine`), so it shows before Save and on reopening:
 * the gone line (`goneLine`), else Best by or use within from `planFlags`
 * for the meal's day and time as the form has them. "May run out" needs the
 * other days' plans, so it stays the saved card's. A past day gets no
 * freshness line (`planFlags` counts from today). A warning only: it never
 * holds the save (parents decide).
 */
export function planningFlagLine(entry: ContainerEntry, when: PlanWhen | undefined): string | null {
  const gone = goneLine(entry, true);
  const { container } = entry;
  if (gone || !container || !when) return gone;
  const use = {
    id: container.id,
    date: when.date,
    time: when.time,
    mealPosition: 0,
    position: 0,
    served: false,
    storageItemId: container.id,
    servings: entry.servings ?? 1,
  };
  const flag = planFlags([use], new Map([[container.id, container]]), when.today, when.timeZone)
    .get(container.id)
    ?.find((candidate) => candidate.kind === "past_best_by" || candidate.kind === "past_use_within");
  return flag ? planFlagLine(flag) : null;
}

/** The first container on the plate that has run out, if any. */
export const ranOutEntry = (plate: readonly PlateEntry[]): ContainerEntry | undefined =>
  plate.find((entry): entry is ContainerEntry => entry.kind === "storage" && ranOut(entry));

/**
 * How many servings a planned container still has, when that is fewer than
 * the plan asked for but more than none ("Only {n} left."); null otherwise.
 * The stepper stops there (round 5, decision 5). None left is `ranOut`.
 */
export function shortOf(entry: ContainerEntry): number | null {
  if (entry.planned === undefined || ranOut(entry) || entry.container?.servingsTotal == null) return null;
  const left = servingsMax(entry);
  return left < entry.planned ? left : null;
}

/** A food deleted from the catalog, new to this plate: only a planned
 * meal's plate can hold one (SPEC §3.5 `deleted`), and the server refuses
 * it, so serving waits until it comes off. */
export const deletedFoodEntry = (plate: readonly PlateEntry[]): FoodEntry | undefined =>
  plate.find((entry): entry is FoodEntry => entry.kind === "food" && entry.id === undefined && entry.food.deleted === true);

/** Each container with Storage's latest copy of it, when the lists have one,
 * so its line, its stepper's limit and its run-out flag stay current. */
export function attachContainers(plate: readonly PlateEntry[], containers: readonly StorageItem[]): PlateEntry[] {
  return plate.map((entry) => {
    if (entry.kind !== "storage") return entry;
    const container = containers.find((candidate) => candidate.id === entry.storageItemId);
    return container && container !== entry.container ? { ...entry, container } : entry;
  });
}

/**
 * The containers a new meal empties, as Storage had them before it: an
 * active, tracked one asked for at least what it has left. The server
 * finishes those in the same write (services/plate.ts), which is the
 * `storage_item_closed` "serve_depleted" event; the save answers with the
 * meal alone, so this reads it off what was sent.
 */
export function containersEmptiedBy(
  items: readonly PlateItemInput[],
  containers: readonly StorageItem[],
): StorageItem[] {
  return items.flatMap((item) => {
    if (item.kind !== "storage" || item.servings === undefined) return [];
    const container = containers.find((candidate) => candidate.id === item.storageItemId);
    if (!container || container.status !== "active" || container.servingsTotal === null) return [];
    return (container.servingsLeft ?? 0) <= item.servings ? [container] : [];
  });
}

/** What "Save leftovers to storage" keeps (item 152): the fresh recipes when
 * there are any, else the fresh foods. A container is already in storage. */
export function plateLeftoverSource(plate: readonly PlateEntry[]): LeftoverSourceKind {
  return resolveLeftoverSource(
    plate.flatMap((entry) => (entry.kind === "recipe" ? [entry.recipe.id] : [])),
    plate.flatMap((entry) => (entry.kind === "food" ? [entry.food.id] : [])),
  );
}

/** Nothing fresh on the plate: no leftovers to save. */
export const hasLeftovers = (source: LeftoverSourceKind): boolean =>
  source.kind === "recipe" || source.foodIds.length > 0;

/**
 * Nothing on the plate would count as a food: only recipes, each with every
 * ingredient left out (the server refuses it, `PLATE_NOTHING_COUNTS`). A
 * recipe whose ingredients were never loaded, a food or a container always
 * counts here; the server's answer covers the rest.
 */
export function nothingCounts(plate: readonly PlateEntry[]): boolean {
  return (
    plate.length > 0 &&
    plate.every(
      (entry) =>
        entry.kind === "recipe" &&
        entry.ingredientIds !== undefined &&
        entry.ingredientIds.every((id) => entry.leftOut.some((food) => food.id === id)),
    )
  );
}

/** What the plate says when nothing on it counts (VERIFY-p2-c1 #3). */
export const NOTHING_COUNTS_MESSAGE = "Leave at least one food on the plate.";

/** What the plate says when a leave-out is no longer one of its recipe's
 * ingredients: another device edited the recipe (VERIFY-p3-c1 #6). */
export const RECIPE_CHANGED_MESSAGE = "This recipe changed. Check its ingredients and save again.";

/** The server's 400 for that case: which recipe, and the leave-outs it no
 * longer has. The plate drops them and the recipe is refetched. */
export function staleLeaveOut(error: unknown): { recipeId: string; foodIds: string[] } | null {
  if (!(error instanceof ApiError) || error.status !== 400) return null;
  const details = (error.body as { details?: { leftOutFoodIds?: unknown; recipeId?: unknown; foodIds?: unknown } } | undefined)
    ?.details;
  if (details?.leftOutFoodIds !== PLATE_NOT_AN_INGREDIENT || typeof details.recipeId !== "string") return null;
  return { recipeId: details.recipeId, foodIds: Array.isArray(details.foodIds) ? details.foodIds.filter((id) => typeof id === "string") : [] };
}

/** `name` is Plan a meal's (CD-Plan-Meal), above the plate. */
export type PlateField = "name" | "items" | "leftoverBestBy";
export type PlateErrors = FormErrors<PlateField>;

/** Visual order — what a failed save focuses first (item 235). */
export const PLATE_FIELD_ORDER: readonly PlateField[] = ["name", "items", "leftoverBestBy"];

/**
 * The plate's own rules (item 235): something on the plate that counts as
 * a food, and, while the
 * leftovers switch is on, a Best by no earlier than the day they are put
 * away (these leftovers are prepared now). When is never empty and every
 * other field is optional. An empty object means valid.
 */
export function validatePlate(values: {
  itemCount: number;
  /** `nothingCounts` of the plate. */
  nothingCounts?: boolean;
  leftoversOpen?: boolean;
  leftoverBestBy?: string;
  /** What the leftovers are prepared at, i.e. now; passed so this stays pure. */
  leftoverPreparedAt?: Date;
}): PlateErrors {
  const errors: PlateErrors = {};
  if (values.itemCount === 0) errors.items = "Add at least one food";
  else if (values.nothingCounts) errors.items = NOTHING_COUNTS_MESSAGE;
  if (values.leftoversOpen && isBestByBeforePrepared(values.leftoverBestBy, values.leftoverPreparedAt ?? new Date())) {
    errors.leftoverBestBy = BEST_BY_BEFORE_PREPARED_MESSAGE;
  }
  return errors;
}

/** A logged meal's Edit, the plate at `/log-meal?edit=:id`: where a Food log
 * card, a served plan card and the old `/meals/:id` links go (ledger 966). */
export function mealEditHref(mealId: string): string {
  return `/log-meal?edit=${encodeURIComponent(mealId)}`;
}

/** A recipe's mark on the plate and the Food log (CD boards). */
export const RECIPE_PLATE: Plate = { emoji: "🍲", tint: "neutral" };

type PartRef = { kind: "food"; food: PlateFoodRef } | { kind: "recipe"; recipe: PlateRecipeRef };

/** A container's mark: its foods' plates (the boards draw the first two,
 * overlapped), else the recipe pot. */
export function partPlates(parts: readonly PartRef[]): Plate[] {
  const plates = parts.flatMap((part) => (part.kind === "food" ? [foodPlate(part.food)] : []));
  return plates.length > 0 ? plates : [RECIPE_PLATE];
}

/** A saved container's name, Storage's own rule: its label, else its
 * recipe, else its foods. */
export function containerTitle(item: { label: string | null; parts: readonly PartRef[] }): string {
  const recipe = item.parts.find((part) => part.kind === "recipe");
  return storageItemTitle({
    label: item.label,
    recipeTitle: recipe?.kind === "recipe" ? recipe.recipe.title : null,
    recipes: recipe?.kind === "recipe" ? [recipe.recipe] : [],
    foods: item.parts.flatMap((part) => (part.kind === "food" ? [part.food] : [])),
  });
}

/** What one star line rates: a meal item, or a food or recipe a container held. */
export interface MealLineRating {
  /** The meal item's id, the key of a PATCH's `itemRatings`. */
  id: string;
  label: string;
  /** A container's food or recipe part its owner has since deleted (ledgers 543, 957). */
  deleted?: boolean | undefined;
  rating: number | null;
}

/** One line of a saved meal in the Food log (CD-Food-Log). */
export interface MealLine {
  key: string;
  name: string;
  /** A fresh food or recipe its owner has since deleted (ledgers 543, 957). */
  deleted?: boolean | undefined;
  plates: Plate[];
  /** Its star lines (ledger 939/944): one for a food or recipe, one per part
   * of a container. None on a cached body from before items. */
  ratings: MealLineRating[];
  /** A recipe's left-out ingredients; none when it was rebuilt from a meal
   * logged before the plate (`inferred`, chair §10.1: it cannot know). */
  leftOut: readonly { name: string; deleted?: boolean | undefined }[];
  /** A container's batch, for the storage ⇄ meal traceback (item 162). */
  storageItemId?: string;
}

/** Ledger 973: a container's foods and recipes as fresh items, in its place. */
const asFreshItems = (item: PlateItem): PlateItem[] =>
  item.kind !== "storage"
    ? [item]
    : item.parts.map((part): PlateItem => (part.kind === "food" ? part : { ...part, leftOut: [], inferred: false }));

/**
 * A saved meal's lines (PP-NOTES round 5, decision 8): one per item in plate
 * order, a container under its own name. With `flattenContainers` (the Food
 * log card, ledger 973) a container gets no line of its own: each food or
 * recipe it held is a line exactly like a fresh one, in its place, so a
 * one-part container reads as that part. A cached body from before items
 * lists its foods.
 */
export function mealLines(
  meal: Pick<MealItem, "items" | "foods">,
  { flattenContainers = false }: { flattenContainers?: boolean } = {},
): MealLine[] {
  if (!meal.items) {
    return meal.foods.map((food) => ({
      key: food.id,
      name: food.name,
      deleted: food.deleted,
      plates: [foodPlate(food)],
      ratings: [],
      leftOut: [],
    }));
  }
  return (flattenContainers ? meal.items.flatMap(asFreshItems) : meal.items).map((item): MealLine => {
    if (item.kind === "food") {
      const ratings = [{ id: item.id, label: item.food.name, rating: item.rating }];
      return { key: item.id, name: item.food.name, deleted: item.food.deleted, plates: [foodPlate(item.food)], ratings, leftOut: [] };
    }
    if (item.kind === "recipe") {
      const ratings = [{ id: item.id, label: item.recipe.title, rating: item.rating }];
      return {
        key: item.id,
        name: item.recipe.title,
        deleted: item.recipe.deleted,
        plates: [RECIPE_PLATE],
        ratings,
        leftOut: item.inferred ? [] : item.leftOut,
      };
    }
    return {
      key: item.storageItemId,
      name: containerTitle(item),
      plates: partPlates(item.parts),
      ratings: item.parts.map((part) => ({
        id: part.id,
        label: part.kind === "food" ? part.food.name : part.recipe.title,
        deleted: part.kind === "food" ? part.food.deleted : part.recipe.deleted,
        rating: part.rating,
      })),
      leftOut: [],
      storageItemId: item.storageItemId,
    };
  });
}

/** The plate a saved meal shows (GET /api/meals/:id), kept items by id.
 * `containers` (Storage's list) adds each container's live counts. */
export function fromMeal(meal: Pick<MealItem, "items">, containers: readonly StorageItem[] = []): PlateEntry[] {
  return (meal.items ?? []).map((item): PlateEntry => {
    if (item.kind === "food") return { kind: "food", id: item.id, food: item.food, rating: item.rating };
    if (item.kind === "recipe") {
      return {
        kind: "recipe",
        id: item.id,
        recipe: item.recipe,
        leftOut: item.leftOut,
        savedLeftOut: item.leftOut.map((food) => food.id),
        inferred: item.inferred,
        rating: item.rating,
      };
    }
    const parts = item.parts.map(
      (part): ContainerPart =>
        part.kind === "food"
          ? { kind: "food", food: part.food, rating: part.rating }
          : { kind: "recipe", recipe: part.recipe, rating: part.rating },
    );
    return {
      kind: "storage",
      storageItemId: item.storageItemId,
      title: containerTitle(item),
      location: item.location,
      servings: item.servings,
      savedServings: item.servings,
      container: containers.find((container) => container.id === item.storageItemId),
      parts,
    };
  });
}

/**
 * The plate a planned meal shows on Plan a meal (SPEC §5): its items as
 * planned, with no stars. Everything is new to a meal: a container takes
 * the servings planned (a plan has taken nothing from it yet), and a
 * recipe's leave-outs are intent no meal has saved, so serving sends them.
 */
export function fromPlanned(items: readonly PlannedItem[]): PlateEntry[] {
  return items.map((item): PlateEntry => {
    if (item.kind === "food") return { kind: "food", food: item.food, rating: null };
    if (item.kind === "recipe") return { kind: "recipe", recipe: item.recipe, leftOut: item.leftOut, savedLeftOut: [], rating: null };
    return { ...containerEntry(item.container), servings: item.servings, planned: item.servings };
  });
}

/**
 * The plate a planned meal is SERVED from (SPEC §3.5, CD-Serve-Ran-Out): as
 * planned, each container as Storage has it now, its stepper at what it can
 * still give when that is less than planned. One with none left stays as
 * planned, flagged (`ranOut`) until a new batch takes its place or it comes off.
 */
export function servePlanned(items: readonly PlannedItem[], containers: readonly StorageItem[]): PlateEntry[] {
  return attachContainers(fromPlanned(items), containers).map((entry) =>
    entry.kind === "storage" && !ranOut(entry) ? { ...entry, servings: clampServings(entry.servings ?? 1, servingsMax(entry)) } : entry,
  );
}

/**
 * What CD-Ran-Out-Add's Add to storage opens with, from the run-out
 * container (PP-NOTES round 6, decision 3): the same recipe, else the same
 * foods, the same place and the same total servings. Best by stays empty:
 * the old batch's date would be wrong for a new one.
 */
export function restockPrefill(entry: ContainerEntry): StoragePrefill {
  const recipe = entry.parts.find((part) => part.kind === "recipe");
  const foodIds = entry.parts.flatMap((part) => (part.kind === "food" ? [part.food.id] : []));
  return {
    ...(recipe?.kind === "recipe" ? { source: "recipe", recipeId: recipe.recipe.id } : { source: "food", foodIds }),
    location: entry.location,
    ...(entry.container?.servingsTotal != null && { servingsTotal: entry.container.servingsTotal }),
  };
}

/** A plan write's `items` (PUT or "+ Add a meal" POST): the whole plate as
 * intent, a recipe's leave-outs and a container's servings, never stars. */
export function toPlanInput(plate: readonly PlateEntry[]): PlannedItemInput[] {
  return plate.map((entry): PlannedItemInput => {
    if (entry.kind === "food") return { kind: "food", foodId: entry.food.id };
    if (entry.kind === "recipe") return { kind: "recipe", recipeId: entry.recipe.id, leftOutFoodIds: entry.leftOut.map((food) => food.id) };
    return { kind: "storage", storageItemId: entry.storageItemId, servings: entry.servings ?? 1 };
  });
}

/**
 * What Add more opens with (ledger 878): everything on the plate, ticked.
 * Nothing on the plate hides anything else (799): a fresh recipe is still
 * offered beside a container of it, a fresh food beside a container holding it.
 */
export function plateAddMoreServing(plate: readonly PlateEntry[]): AddMoreIds {
  return {
    itemIds: plate.flatMap((entry) => (entry.kind === "storage" ? [entry.storageItemId] : [])),
    recipeIds: plate.flatMap((entry) => (entry.kind === "recipe" ? [entry.recipe.id] : [])),
    foodIds: plate.flatMap((entry) => (entry.kind === "food" ? [entry.food.id] : [])),
  };
}

const byName = (a: PlateFoodRef, b: PlateFoodRef) => a.name.localeCompare(b.name);

export function plateReducer(plate: readonly PlateEntry[], action: PlateAction): PlateEntry[] {
  switch (action.type) {
    case "addMore": {
      // Done (ledger 878): unticked things come off, new picks go on at the
      // end (containers at one serving, then recipes, then foods), and the
      // rest is untouched, stars and servings included.
      const { removed, items, recipes, foods } = action.change;
      const kept = plate.filter((entry) =>
        entry.kind === "storage"
          ? !removed.itemIds.includes(entry.storageItemId)
          : entry.kind === "recipe"
            ? !removed.recipeIds.includes(entry.recipe.id)
            : !removed.foodIds.includes(entry.food.id),
      );
      const added: PlateEntry[] = [
        ...items.map(containerEntry),
        ...recipes.map((recipe): RecipeEntry => ({ kind: "recipe", recipe, leftOut: [], savedLeftOut: [], rating: null })),
        ...foods.map((food): FoodEntry => ({ kind: "food", food, rating: null })),
      ];
      const keys = new Set(kept.map(entryKey));
      return [
        ...kept,
        ...added.filter((entry) => {
          const key = entryKey(entry);
          if (keys.has(key)) return false;
          keys.add(key);
          return true;
        }),
      ];
    }
    case "remove":
      return plate.filter((entry) => entryKey(entry) !== action.key);
    case "rate":
      return plate.map((entry) => {
        if (entryKey(entry) !== action.key) return entry;
        if (entry.kind !== "storage") return { ...entry, rating: action.rating };
        return {
          ...entry,
          parts: entry.parts.map((part) => (partId(part) === action.partId ? { ...part, rating: action.rating } : part)),
        };
      });
    case "toggleLeftOut":
      return plate.map((entry) => {
        if (entry.kind !== "recipe" || entryKey(entry) !== action.key) return entry;
        const out = entry.leftOut.some((food) => food.id === action.food.id);
        return {
          ...entry,
          ingredientIds: action.ingredientIds ?? entry.ingredientIds,
          leftOut: out
            ? entry.leftOut.filter((food) => food.id !== action.food.id)
            : [...entry.leftOut, action.food].sort(byName),
        };
      });
    case "dropLeftOut":
      return plate.map((entry) =>
        entry.kind === "recipe" && entry.recipe.id === action.recipeId
          ? {
              ...entry,
              leftOut: entry.leftOut.filter((food) => !action.foodIds.includes(food.id)),
              ...(entry.ingredientIds && { ingredientIds: entry.ingredientIds.filter((id) => !action.foodIds.includes(id)) }),
            }
          : entry,
      );
    case "servings":
      return plate.map((entry) =>
        entry.kind === "storage" && entry.servings !== null && entryKey(entry) === action.key
          ? { ...entry, servings: clampServings(action.servings, servingsMax(entry)) }
          : entry,
      );
    case "replaceContainer":
      // In its place, at the servings it was asked for (what the new batch
      // can give, at most), still marked with what the plan asked for.
      return plate.flatMap((entry) => {
        if (entry.kind !== "storage" || entryKey(entry) !== action.key) return [entry];
        return action.items.map((item): ContainerEntry => {
          const fresh: ContainerEntry = { ...containerEntry(item), ...(entry.planned !== undefined && { planned: entry.planned }) };
          return { ...fresh, servings: clampServings(entry.servings ?? 1, servingsMax(fresh)) };
        });
      });
  }
}

const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id) => b.includes(id));

/**
 * One item of the save. A kept item goes back by id with its stars; a
 * recipe sends its leave-out only when the parent changed it; a container
 * sends `servings` only when new or resized (absent keeps what the meal
 * took, SPEC §1.4.5). A new container sends only the stars given, so a part
 * Storage changed since it loaded cannot fail the save.
 */
function entryInput(entry: PlateEntry): PlateItemInput {
  const id = entry.kind !== "storage" && entry.id ? { id: entry.id } : {};
  if (entry.kind === "food") return { kind: "food", ...id, foodId: entry.food.id, rating: entry.rating };
  if (entry.kind === "recipe") {
    const leftOut = entry.leftOut.map((food) => food.id);
    return {
      kind: "recipe",
      ...id,
      recipeId: entry.recipe.id,
      rating: entry.rating,
      ...(sameIds(leftOut, entry.savedLeftOut) ? {} : { leftOutFoodIds: leftOut }),
    };
  }
  const isNew = entry.savedServings === undefined;
  const parts = isNew ? entry.parts.filter((part) => part.rating !== null) : entry.parts;
  return {
    kind: "storage",
    storageItemId: entry.storageItemId,
    ...(entry.servings !== null && entry.servings !== entry.savedServings ? { servings: entry.servings } : {}),
    ...(parts.length > 0 ? { ratings: Object.fromEntries(parts.map((part) => [partId(part), part.rating])) } : {}),
  };
}

export interface PlateFields {
  servedAt: Date;
  reactionNote: string;
  notes: string;
}

/** The body of POST /api/babies/:babyId/meals and of an edit's PATCH: the
 * whole plate, When, and the notes (blank = none). */
export function toMealInput(plate: readonly PlateEntry[], { servedAt, reactionNote, notes }: PlateFields) {
  return {
    items: plate.map(entryInput),
    servedAt: servedAt.toISOString(),
    reactionNote: reactionNote.trim() || null,
    notes: notes.trim() || null,
  } satisfies CreatePlateMealInput;
}
