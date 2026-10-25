import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useSession } from "../lib/auth.js";
import {
  applyUpdate,
  dismissUpdate,
  isUpdatePromptRoute,
  useUpdateOnSignedOutNavigation,
  useUpdateState,
} from "../pwa/update.js";
import { SessionPending } from "./RequireAuth.js";
import { useAnyModalOpen } from "./ui/useModal.js";
import { Button } from "./ui/Button.js";

/**
 * Ledger 790 (MR2-Update-Card): the small card under the status bar once a new
 * version has downloaded. Only on Home and the list pages, and never while a
 * sheet or dialog is open; Later hides it for that version. It hangs from the
 * sticky header (absolute, never position: fixed), whose z-20 already paints
 * over the page, and sheets and dialogs hide it, so it needs no portal. The
 * live region stays mounted so the line arriving in it is announced.
 */
export function UpdateCard() {
  const { pathname } = useLocation();
  const { ready, dismissed } = useUpdateState();
  const modalOpen = useAnyModalOpen();
  const show = ready && !dismissed && !modalOpen && isUpdatePromptRoute(pathname);

  return (
    <div role="status" className="absolute inset-x-3" style={{ top: "calc(0.3125rem + env(safe-area-inset-top) + var(--top-edge-clearance-slim))" }}>
      {show ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-3 pr-3 pl-3.5 shadow-[var(--shadow-md)]">
          <p className="flex-1 text-[15px] leading-[1.3] font-semibold text-[var(--color-text)]">A new version is ready.</p>
          <button
            type="button"
            onClick={dismissUpdate}
            className="min-h-11 rounded-xl px-3.5 text-sm font-semibold text-[var(--color-accent)] hover:bg-[var(--color-bg-inset)]"
          >
            Later
          </button>
          <Button onClick={applyUpdate}>Reload</Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Ledger 790 (MR2-Update-More): after Later, a quiet row at the top of More
 * until the parent reloads.
 */
export function UpdateRow() {
  const { ready, dismissed } = useUpdateState();
  if (!ready || !dismissed) return null;
  return (
    <div className="flex items-center gap-2.5 rounded-[var(--radius-md)] bg-[var(--color-bg-inset)] py-1.5 pr-2 pl-3.5">
      <span className="flex-1 text-[13px] font-semibold text-[var(--color-text-muted)]">Update available</span>
      <button
        type="button"
        onClick={applyUpdate}
        className="min-h-11 rounded-xl px-3.5 text-sm font-bold text-[var(--color-accent)]"
      >
        Reload
      </button>
    </div>
  );
}

/**
 * Ledger 849: wraps the app (main.tsx). Signed out, a waiting version loads on
 * the next navigation (useUpdateOnSignedOutNavigation); until the page reloads,
 * "Loading…" stands in for the screen being opened, so nothing is typed into it.
 */
export function SignedOutUpdate({ children }: { children: ReactNode }) {
  const { key } = useLocation();
  const { data: session, isPending } = useSession();
  return useUpdateOnSignedOutNavigation(key, !isPending && !session) ? <SessionPending /> : <>{children}</>;
}
