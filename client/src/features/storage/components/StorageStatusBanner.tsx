interface StorageStatusBannerProps {
  /** "Marked discarded: Peas" (`storageStatusChangeLabel`) or "Served: …"
   * (`serveUndoLabel`, ledger 760). */
  label: string;
  onUndo: () => void;
}

/**
 * Shared 6s-undo banner (item 147): Remove's status change, driven by
 * `useStorageStatusChange`, and a serve, driven by `useServeUndo` (ledger
 * 760) — one component, so the two undo affordances never fork.
 */
export function StorageStatusBanner({ label, onUndo }: StorageStatusBannerProps) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-[var(--color-callout-bg)] px-3 py-2 text-sm text-[var(--color-text)]">
      <span>{label}</span>
      <button type="button" onClick={onUndo} className="font-medium text-[var(--color-accent)] underline">
        Undo
      </button>
    </div>
  );
}
