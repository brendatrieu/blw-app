// "Save leftovers to storage" on Log meal (items 152-153, 348; ledger 759)
// as plain data: what the leftovers are, and the storage item they become.
import type { CreateStorageItemInput, StorageLocation } from "@blw/shared";
import { nowAtMinute } from "../../components/ui/DateTimeField.js";
import { offersContainerChoice } from "./format.js";

/**
 * What the leftovers are, inferred from the meal being logged (item 152):
 * the recipes win outright when there are any (their ingredients are the
 * leftovers); otherwise it is EVERY food.
 *
 * There is no third "which one?" branch any more (item 348). A container
 * holds a whole meal now, so a three-food meal's leftovers are one container
 * of three foods. What replaces the old question is a choice the parent may
 * ignore: one container, or one per food — and, since ledger 759, the same
 * choice for the leftovers of two or more recipes.
 */
export type LeftoverSourceKind = { kind: "recipe"; recipeIds: string[] } | { kind: "foods"; foodIds: string[] };

export function resolveLeftoverSource(recipeIds: string[], foodIds: string[]): LeftoverSourceKind {
  if (recipeIds.length > 0) return { kind: "recipe", recipeIds };
  return { kind: "foods", foodIds };
}

/**
 * The `createStorageItem` payload for a leftovers-from-this-meal save
 * (item 153): one recipe carries `recipeId`, two or more carry `recipeIds`
 * (ledger 759: one container holding them all, or one per recipe),
 * food-sourced carries EVERY food's id (item 348) — never both.
 * `notes`/`quantityNote` are deliberately omitted (not auto-copied from the
 * meal), so the storage item starts with none of its own.
 *
 * `separateItems` rides along only where the control that sets it is
 * actually shown (`offersContainerChoice`): with one food or one recipe it is
 * meaningless, and a flag left over from a food the parent has since removed
 * must not reach the server.
 */
export function buildLeftoverStorageInput(
  source: LeftoverSourceKind,
  location: StorageLocation,
  servingsTotal: string,
  bestBy: string,
  separateItems = false,
  preparedAt: Date = nowAtMinute(),
): CreateStorageItemInput {
  const trimmedServings = servingsTotal.trim();
  return {
    ...(source.kind === "recipe"
      ? offersContainerChoice(source.recipeIds)
        ? { recipeIds: source.recipeIds, separateItems }
        : { recipeId: source.recipeIds[0]! }
      : {
          foodIds: source.foodIds,
          ...(offersContainerChoice(source.foodIds) ? { separateItems } : {}),
        }),
    location,
    preparedAt: preparedAt.toISOString(),
    servingsTotal: trimmedServings ? Number(trimmedServings) : undefined,
    bestBy: bestBy || undefined,
  };
}
