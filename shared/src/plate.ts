import { z } from "zod";
import { foodCategorySchema } from "./catalog.js";

/**
 * Ledger 901 (plan SPEC §1, §4.3): the plate. A meal is the list of what was
 * on the plate, one ITEM per thing the parent added: a fresh food, a fresh
 * recipe (with ingredients it may leave out), or a container from storage
 * (rated per food or per recipe it holds). Every item carries its own stars.
 *
 * A leaf module (zod and catalog only), so tracking.ts and storage.ts can
 * both build on it without an import cycle. That is also why the star rating
 * and the storage location live here; both modules re-export them.
 */

/**
 * Item 572: a baby's star rating, a whole number of stars from 1 to 5.
 * "Not rated" is `null`, never 0 — there is no 0-star state anywhere.
 */
export const STAR_RATING_MAX = 5;
export const starRatingSchema = z.number().int().min(1).max(STAR_RATING_MAX);

export const storageLocationSchema = z.enum(["fridge", "freezer", "counter"]);
export type StorageLocation = z.infer<typeof storageLocationSchema>;

/**
 * At least MEAL_FOODS_MAX + MEAL_RECIPES_MAX + SERVE_PARTS_MAX (50 + 10 + 10):
 * a meal of 50 loose foods is valid today, and a backfilled meal's container
 * groups add items without adding foods. The UI can nudge at a lower number.
 */
export const PLATE_ITEMS_MAX = 70;
export const PLATE_LEFT_OUT_MAX = 50;
export const PLATE_SERVINGS_MAX = 99;

const uuid = z.string().uuid();
/** On a kept item, absent keeps the stored rating; `null` clears it. */
const ratingInput = starRatingSchema.nullable().optional();
/** A container's stars, keyed by the food or recipe id of the part. */
export const plateRatingsSchema = z.record(uuid, starRatingSchema.nullable());

export const plateItemInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("food"),
    /** The item's id when the edit keeps it. */
    id: uuid.optional(),
    foodId: uuid,
    rating: ratingInput,
  }),
  z.object({
    kind: z.literal("recipe"),
    id: uuid.optional(),
    recipeId: uuid,
    /** Current ingredients the baby did not get. Absent on a kept item keeps
     * what it counted; on a new item it means nothing was left out. Sent on
     * a kept item, foods the recipe lost since stay counted, and an inferred
     * item can only lose foods (server/src/services/plate.ts). */
    leftOutFoodIds: z.array(uuid).max(PLATE_LEFT_OUT_MAX).optional(),
    rating: ratingInput,
  }),
  z.object({
    kind: z.literal("storage"),
    storageItemId: uuid,
    /** Required for a container new to the meal. On one already on it,
     * absent means unchanged; a new count moves only the difference. */
    servings: z.number().int().min(1).max(PLATE_SERVINGS_MAX).optional(),
    ratings: plateRatingsSchema.optional(),
  }),
]);
export type PlateItemInput = z.infer<typeof plateItemInputSchema>;

/**
 * Ledger 799: what counts as "already on the plate". A fresh food, a fresh
 * recipe and a container are each on it at most once; a fresh Broccoli and a
 * Broccoli + Carrot container are two items. Shared with Add more's dedupe.
 */
export function plateKey(item: PlateItemInput): string {
  if (item.kind === "food") return `food:${item.foodId}`;
  if (item.kind === "recipe") return `recipe:${item.recipeId}`;
  return `storage:${item.storageItemId}`;
}

export const plateItemsInputSchema = z
  .array(plateItemInputSchema)
  .min(1)
  .max(PLATE_ITEMS_MAX)
  .superRefine((items, ctx) => {
    const keys = items.map(plateKey);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Each food, recipe and container can be on the plate once" });
    }
    const ids = items.flatMap((item) => (item.kind !== "storage" && item.id ? [item.id] : []));
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Each kept item can be sent once" });
    }
  });

/** A food as an item shows it: enough to render its name, emoji and chips. */
export const plateFoodSchema = z.object({
  id: uuid,
  slug: z.string(),
  name: z.string(),
  category: foodCategorySchema,
  emoji: z.string().nullable().optional(),
  /** The parent has since deleted this custom food; the meal keeps it. */
  deleted: z.boolean().optional(),
  allergens: z.array(z.string()).optional(),
});
export type PlateFood = z.infer<typeof plateFoodSchema>;

const plateRecipeRefSchema = z.object({ id: uuid, title: z.string() });

/** One rating target inside a container: a food it holds or a recipe. */
export const platePartSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("food"), id: uuid, food: plateFoodSchema, rating: starRatingSchema.nullable() }),
  z.object({ kind: z.literal("recipe"), id: uuid, recipe: plateRecipeRefSchema, rating: starRatingSchema.nullable() }),
]);
export type PlatePart = z.infer<typeof platePartSchema>;

/** An item of a saved meal, in plate order. `MealItem` already names a meal,
 * so this is `PlateItem`. */
export const plateItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("food"), id: uuid, food: plateFoodSchema, rating: starRatingSchema.nullable() }),
  z.object({
    kind: z.literal("recipe"),
    id: uuid,
    recipe: plateRecipeRefSchema,
    /** The recipe's current ingredients this item did not count. Always
     * empty on an `inferred` item (chair §10.1): one rebuilt from a meal
     * logged before the plate cannot tell an ingredient left out from one
     * the recipe gained later. */
    leftOut: z.array(plateFoodSchema),
    /** Rebuilt from a meal saved before the plate existed. */
    inferred: z.boolean(),
    rating: starRatingSchema.nullable(),
  }),
  z.object({
    kind: z.literal("storage"),
    storageItemId: uuid,
    label: z.string().nullable(),
    location: storageLocationSchema,
    /** What this meal took from it; null for a serve from before that was
     * recorded (its servings can't be changed, only the container removed). */
    servings: z.number().int().nullable(),
    parts: z.array(platePartSchema),
  }),
]);
export type PlateItem = z.infer<typeof plateItemSchema>;

/**
 * The plate a saved meal shows, as the input that saves it unchanged: kept
 * items by id with their stars, containers without `servings` (unchanged)
 * and recipes without `leftOutFoodIds` (they keep what they counted). An
 * edit starts from this and changes only what the parent changed.
 */
export function plateInputFromItems(items: readonly PlateItem[]): PlateItemInput[] {
  return items.map((item): PlateItemInput => {
    if (item.kind === "food") return { kind: "food", id: item.id, foodId: item.food.id, rating: item.rating };
    if (item.kind === "recipe") return { kind: "recipe", id: item.id, recipeId: item.recipe.id, rating: item.rating };
    return {
      kind: "storage",
      storageItemId: item.storageItemId,
      ratings: Object.fromEntries(
        item.parts.map((part) => [part.kind === "food" ? part.food.id : part.recipe.id, part.rating]),
      ),
    };
  });
}
