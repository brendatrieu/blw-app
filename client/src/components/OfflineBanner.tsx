import { useIsOffline } from "../lib/online.js";

/**
 * Ledger 765: one slim line under the header on every page while offline,
 * gone once back online. The live region is always mounted so the text
 * arriving in it is announced; the strip is the Symptom check disclaimer's
 * calm callout style. In flow, never fixed or sticky (CLAUDE.md iOS rule).
 */
export function OfflineBanner() {
  const offline = useIsOffline();
  return (
    <div role="status">
      {offline && (
        <p className="border-b border-[var(--color-callout-border)] bg-[var(--color-callout-bg)] px-4 py-2 text-xs font-medium text-[var(--color-callout-icon)]">
          You're offline.
        </p>
      )}
    </div>
  );
}
