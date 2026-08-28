import type { PantryLocation, PantryStatus } from "@blw/shared";

const HOUR_MS = 60 * 60 * 1000;

export const LOCATION_LABEL: Record<PantryLocation, string> = {
  fridge: "Fridge",
  freezer: "Freezer",
  counter: "Counter",
};

export const LOCATIONS: { value: PantryLocation; label: string }[] = [
  { value: "fridge", label: "Fridge" },
  { value: "freezer", label: "Freezer" },
  { value: "counter", label: "Counter" },
];

/** Display name for whatever the item was prepared from. */
export function pantryItemTitle(item: { label: string | null; foodName: string | null; recipeTitle: string | null }): string {
  return item.label ?? item.recipeTitle ?? item.foodName ?? "Prepared food";
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
 * Whether a pantry item has no linkable food or recipe — a free-form label
 * with nothing a Serve action could log. The serve endpoint 400s on these
 * ("nothing to log"), so the client hides the Serve control rather than
 * surface an always-failing button.
 */
export function isLabelOnly(item: { foodSlug: string | null; recipeTitle: string | null }): boolean {
  return !item.foodSlug && !item.recipeTitle;
}

/**
 * Which actions the pantry item Actions menu (Home's three-dot menu) should
 * offer for a given item: Serve mirrors the same active/food-or-recipe gate
 * `PantryItemCard`'s inline Serve button uses (see `isLabelOnly`); Edit and
 * Mark finished are both only meaningful for an active item — a finished or
 * discarded item is edited/restored from the Pantry page's History view
 * instead. Pure so the menu's item list is unit-testable without rendering.
 */
export function resolvePantryItemMenuActions(item: {
  status: PantryStatus;
  foodSlug: string | null;
  recipeTitle: string | null;
}): { serve: boolean; edit: boolean; finish: boolean } {
  const active = item.status === "active";
  return { serve: active && !isLabelOnly(item), edit: active, finish: active };
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
