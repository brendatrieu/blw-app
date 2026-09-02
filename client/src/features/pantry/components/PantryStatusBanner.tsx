import { pantryStatusChangeLabel, type PantryStatusChange } from "../hooks.js";

interface PantryStatusBannerProps {
  change: PantryStatusChange;
  onUndo: () => void;
}

/**
 * Shared 6s-undo banner for a just-made pantry status change (item 147),
 * driven by `usePantryStatusChange` — the same component renders on both
 * `PantryPage` and `PantryDetailPage` so Remove's undo affordance never
 * forks between the two surfaces.
 */
export function PantryStatusBanner({ change, onUndo }: PantryStatusBannerProps) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-[var(--color-callout-bg)] px-3 py-2 text-sm text-[var(--color-text)]">
      <span>{pantryStatusChangeLabel(change)}</span>
      <button type="button" onClick={onUndo} className="font-semibold text-[var(--color-accent)] underline">
        Undo
      </button>
    </div>
  );
}
