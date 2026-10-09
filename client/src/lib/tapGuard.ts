/** Long enough to swallow the second tap of a fast double tap, short enough
 * that a parent never notices (ledger 767). */
export const TAP_GUARD_MS = 350;

/**
 * Ledger 767: right after a sheet closes itself, the second tap of a fast
 * double tap lands on whatever was under its button (Serve sits over "Foods"
 * in the bottom nav), leaving the page and its Undo. For `ms`, a capture-phase
 * listener on the window eats those clicks before React or a link sees them.
 * Keyboard clicks (`detail` 0) and the Undo banner (`data-tap-guard-skip`)
 * pass through.
 */
export function ignoreTapsBriefly(ms = TAP_GUARD_MS): void {
  const swallow = (event: MouseEvent) => {
    if (event.detail === 0) return;
    if ((event.target as Element | null)?.closest?.("[data-tap-guard-skip]")) return;
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener("click", swallow, true);
  setTimeout(() => window.removeEventListener("click", swallow, true), ms);
}
