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
    // The tap guard after a serve lets the Undo through (ledger 767).
    <div
      data-tap-guard-skip=""
      className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-[var(--color-callout-bg)] px-3 py-2 text-sm text-[var(--color-text)]"
    >
      <span>{label}</span>
      {/* The drawn link stays small; the ::after reaches the 44px tap target
          (VERIFY-3S B3) — the only way to undo inside the 6s. */}
      <button
        type="button"
        onClick={onUndo}
        className="relative font-medium text-[var(--color-accent)] underline after:absolute after:-inset-x-2 after:-inset-y-3"
      >
        Undo
      </button>
    </div>
  );
}
