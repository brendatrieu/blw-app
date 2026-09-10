import { fridgeStatusChangeLabel, type FridgeStatusChange } from "../hooks.js";

interface FridgeStatusBannerProps {
  change: FridgeStatusChange;
  onUndo: () => void;
}

/**
 * Shared 6s-undo banner for a just-made fridge status change (item 147),
 * driven by `useFridgeStatusChange` — the same component renders on both
 * `FridgePage` and `FridgeDetailPage` so Remove's undo affordance never
 * forks between the two surfaces.
 */
export function FridgeStatusBanner({ change, onUndo }: FridgeStatusBannerProps) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-[var(--color-callout-bg)] px-3 py-2 text-sm text-[var(--color-text)]">
      <span>{fridgeStatusChangeLabel(change)}</span>
      <button type="button" onClick={onUndo} className="font-semibold text-[var(--color-accent)] underline">
        Undo
      </button>
    </div>
  );
}
