import { storageStatusChangeLabel, type StorageStatusChange } from "../hooks.js";

interface StorageStatusBannerProps {
  change: StorageStatusChange;
  onUndo: () => void;
}

/**
 * Shared 6s-undo banner for a just-made storage status change (item 147),
 * driven by `useStorageStatusChange` — the same component renders on both
 * `StoragePage` and `StorageDetailPage` so Remove's undo affordance never
 * forks between the two surfaces.
 */
export function StorageStatusBanner({ change, onUndo }: StorageStatusBannerProps) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-[var(--color-callout-bg)] px-3 py-2 text-sm text-[var(--color-text)]">
      <span>{storageStatusChangeLabel(change)}</span>
      <button type="button" onClick={onUndo} className="font-semibold text-[var(--color-accent)] underline">
        Undo
      </button>
    </div>
  );
}
