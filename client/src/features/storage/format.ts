import type { StorageLocation, StorageStatus } from "@blw/shared";
import type { SegmentedControlOption } from "../../components/ui/SegmentedControl.js";

const HOUR_MS = 60 * 60 * 1000;

/** Just enough of a container's `foods` list for the display rules below —
 * structural so both a real `StorageItem` and a hand-written fixture fit. */
interface ContainerFoods {
  foods: readonly { name: string }[];
}

export const LOCATION_LABEL: Record<StorageLocation, string> = {
  fridge: "Fridge",
  freezer: "Freezer",
  counter: "Counter",
};

export const LOCATIONS: { value: StorageLocation; label: string }[] = [
  { value: "fridge", label: "Fridge" },
  { value: "freezer", label: "Freezer" },
  { value: "counter", label: "Counter" },
];

/**
 * Display name for whatever the item was prepared from. Since item 347 a
 * container holds a whole meal, so the food line is every food's name
 * comma-joined — the exact idiom `mealTitle` uses for a meal row, which is
 * what a one-food container (a single name) already read as.
 *
 * The join is guarded with `||`, not `??`: an empty `foods` array joins to
 * `""`, which is a value, not a missing one, and would otherwise render an
 * empty title for a recipe/label-less row.
 */
export function storageItemTitle(
  item: ContainerFoods & { label: string | null; recipeTitle: string | null },
): string {
  return item.label ?? item.recipeTitle ?? (item.foods.map((food) => food.name).join(", ") || "Prepared food");
}

/** "N of M servings left" label for a servings-tracked item. */
export function servingsLabel(servingsLeft: number, servingsTotal: number): string {
  return `${servingsLeft} of ${servingsTotal} servings left`;
}

/**
 * "Best by <Mon, Aug 29>" label for a set best-by date. `bestBy` is a plain
 * "YYYY-MM-DD" calendar date — parsed as local calendar fields (not a UTC
 * instant) so it displays as the intended day regardless of the viewer's
 * timezone.
 */
export function bestByLabel(bestBy: string): string {
  const [year, month, day] = bestBy.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!);
  return `Best by ${date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;
}

/**
 * Clamps a drafted serving count into `[1, max]`, rounding to the nearest
 * whole serving. `max` is the item's `servingsLeft` when tracked, or an
 * untracked ceiling (99) otherwise — the caller decides which applies.
 */
export function clampServings(value: number, max: number): number {
  return Math.min(Math.max(1, Math.round(value)), Math.max(1, max));
}

/**
 * Whether a storage item has no linkable food or recipe — a free-form label
 * with nothing a Serve action could log. The serve endpoint 400s on these
 * ("nothing to log"), so the client hides the Serve control rather than
 * surface an always-failing button.
 */
export function isLabelOnly(item: { foods: readonly unknown[]; recipeTitle: string | null }): boolean {
  return item.foods.length === 0 && !item.recipeTitle;
}

/**
 * Which actions the storage item Actions menu — the three-dot kebab every
 * list card now carries, on Home AND the Storage tab (item 264) — should
 * offer for a given item. Serve mirrors the active/food-or-recipe gate the
 * Serve sheet uses (see `isLabelOnly`); Edit and Remove are only meaningful
 * for an active item; Restore is the one action only a finished or
 * discarded item has. Pure so the menu's item list is unit-testable without
 * rendering.
 */
export function resolveStorageItemMenuActions(item: {
  status: StorageStatus;
  foods: readonly unknown[];
  recipeTitle: string | null;
}): { serve: boolean; edit: boolean; remove: boolean; restore: boolean } {
  const active = item.status === "active";
  // `restore` is the exact complement of `active`: a finished or discarded
  // item can only be put back, and an active one has nothing to be put back
  // from (item 264 — the kebab is now the ONLY action surface on a list
  // card, so it has to carry History's "Restore to active" too).
  return { serve: active && !isLabelOnly(item), edit: active, remove: active, restore: !active };
}

/** Human "use within …" text for an unexpired item, counting down to `expiresAt`. */
export function countdownLabel(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const hours = ms / HOUR_MS;
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(ms / 60_000));
    return `Use within ${minutes} min`;
  }
  if (hours < 48) {
    return `Use within ${Math.round(hours)}h`;
  }
  const days = Math.round(hours / 24);
  return `Use within ${days}d`;
}

// ---------------------------------------------------------------------------
// "One container" vs "Separate containers" (item 348)
// ---------------------------------------------------------------------------

/**
 * Which way a multi-food submission is saved: as ONE container holding every
 * food (the default, matching what a leftovers box actually is), or as one
 * single-food container per food.
 */
export type ContainerChoice = "one" | "separate";

/** The control's own label, above the segments. */
export const CONTAINER_CHOICE_LABEL = "Save as";

export const CONTAINER_CHOICE_OPTIONS: SegmentedControlOption<ContainerChoice>[] = [
  { value: "one", label: "One container", icon: null },
  { value: "separate", label: "Separate containers", icon: null },
];

/**
 * Whether the "Save as" choice is offered at all. One food is one container
 * either way, so the control would be a question with one real answer —
 * it appears only at two or more foods (item 348).
 *
 * The SAME predicate gates the payload: below it, `separateItems` is never
 * sent, so a parent who picked "Separate containers" and then removed a food
 * cannot leave a stale flag behind on a single-food save.
 */
export function offersContainerChoice(foodIds: readonly string[]): boolean {
  return foodIds.length >= 2;
}
