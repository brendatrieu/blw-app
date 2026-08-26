import type { PantryLocation } from "@blw/shared";

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
