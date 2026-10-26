// The plate (plan SPEC §5, ledger 902) as plain data: what is on it, how Add
// more, ×, stars, the leave-out ticks and the servings stepper change it, and
// the request that saves it. The plate screen only holds this state and
// renders it (native-ready: the same rules for a native shell).
import {
  PLATE_SERVINGS_MAX,
  plateKey,
  type CreatePlateMealInput,
  type MealItem,
  type PlateFood,
  type PlateItemInput,
  type StorageItem,
  type StorageLocation,
} from "@blw/shared";
import { containerRecipes, type AddMoreChange, type AddMoreServing } from "../storage/addMoreSelection.js";
import { clampServings, storageItemTitle } from "../storage/format.js";

/** A food as an item or a container part shows it. Container foods carry no
 * category, so it is optional (the plate tint falls back to the slug). */
export type PlateFoodRef = Pick<PlateFood, "id" | "slug" | "name" | "emoji" | "deleted"> & {
  category?: PlateFood["category"];
};

export interface PlateRecipeRef {
  id: string;
  title: string;
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
  parts: ContainerPart[];
}

export type PlateEntry = FoodEntry | RecipeEntry | ContainerEntry;

export type PlateAction =
  | { type: "addMore"; change: AddMoreChange }
  | { type: "remove"; key: string }
  /** `partId` (a food or recipe id) names a container's part. */
  | { type: "rate"; key: string; partId?: string; rating: number | null }
  | { type: "toggleLeftOut"; key: string; food: PlateFoodRef }
  | { type: "servings"; key: string; servings: number };

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
        rating: item.rating,
      };
    }
    const parts = item.parts.map(
      (part): ContainerPart =>
        part.kind === "food"
          ? { kind: "food", food: part.food, rating: part.rating }
          : { kind: "recipe", recipe: part.recipe, rating: part.rating },
    );
    const firstRecipe = parts.find((part) => part.kind === "recipe");
    return {
      kind: "storage",
      storageItemId: item.storageItemId,
      title: storageItemTitle({
        label: item.label,
        recipeTitle: firstRecipe?.kind === "recipe" ? firstRecipe.recipe.title : null,
        foods: parts.flatMap((part) => (part.kind === "food" ? [part.food] : [])),
      }),
      location: item.location,
      servings: item.servings,
      savedServings: item.servings,
      container: containers.find((container) => container.id === item.storageItemId),
      parts,
    };
  });
}

/**
 * What Add more opens with (ledger 878): everything on the plate, ticked.
 * Nothing on the plate hides anything else (799): a fresh recipe is still
 * offered beside a container of it, a fresh food beside a container holding it.
 */
export function plateAddMoreServing(plate: readonly PlateEntry[]): AddMoreServing {
  return {
    itemIds: plate.flatMap((entry) => (entry.kind === "storage" ? [entry.storageItemId] : [])),
    recipeIds: plate.flatMap((entry) => (entry.kind === "recipe" ? [entry.recipe.id] : [])),
    foodIds: plate.flatMap((entry) => (entry.kind === "food" ? [entry.food.id] : [])),
    covered: { recipeIds: [], foodIds: [] },
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
          leftOut: out
            ? entry.leftOut.filter((food) => food.id !== action.food.id)
            : [...entry.leftOut, action.food].sort(byName),
        };
      });
    case "servings":
      return plate.map((entry) =>
        entry.kind === "storage" && entry.servings !== null && entryKey(entry) === action.key
          ? { ...entry, servings: clampServings(action.servings, servingsMax(entry)) }
          : entry,
      );
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
