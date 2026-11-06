import { useEffect, useState } from "react";

/**
 * Ledger 940: a page with unsaved changes asks "Leave without saving?" before
 * the parent leaves it. The app runs on `BrowserRouter`, not a data router,
 * so React Router's `useBlocker` isn't available; instead the in-app ways out
 * ask here first:
 * - the slim header's Back (`BackButton` calls `guardedLeave`);
 * - any tap on an in-app link (bottom tabs, header links): a document
 *   capture listener stops the tap before React Router's `Link` sees it.
 * Not covered: the browser's / Android's own back, the iOS edge swipe, a
 * reload or closing the app, and `navigate()` calls made from code.
 * One page at a time holds the guard (Daily meals, for now).
 */
type Ask = (leave: () => void) => void;
let ask: Ask | null = null;
// True while an approved Leave runs, so its own navigation isn't asked again.
let leaving = false;

/** Runs `leave` now, or first asks the page holding the guard. */
export function guardedLeave(leave: () => void): void {
  if (ask && !leaving) ask(leave);
  else leave();
}

/** Hold the guard; returns the release (which only releases its own hold). */
export function holdLeaveGuard(next: Ask): () => void {
  ask = next;
  return () => {
    if (ask === next) ask = null;
  };
}

/** Runs an approved leave without asking again. */
export function leaveNow(leave: () => void): void {
  leaving = true;
  try {
    leave();
  } finally {
    leaving = false;
  }
}

type LinkClick = Pick<MouseEvent, "defaultPrevented" | "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"> & {
  target: EventTarget | null;
};
type Here = Pick<Location, "origin" | "pathname" | "search" | "hash">;

/**
 * The in-app link a plain tap is about to follow, or null: not a link, a
 * modified click (new tab), `target`/`download` links, another origin, or the
 * very place the parent is already on.
 */
export function internalLinkClick(event: LinkClick, here: Here): HTMLAnchorElement | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const target = event.target as { closest?: (selector: string) => Element | null } | null;
  const link = target?.closest?.("a[href]") as HTMLAnchorElement | null | undefined;
  if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return null;
  const url = new URL(link.href, here.origin);
  if (url.origin !== here.origin) return null;
  if (url.pathname === here.pathname && url.search === here.search && url.hash === here.hash) return null;
  return link;
}

/**
 * While `dirty`, holds the guard and stops in-app link taps; `open` says the
 * question is up. Keep editing closes it; Leave carries on to wherever the
 * parent was going (the same link tap, or Back).
 */
export function useLeaveGuard(dirty: boolean): { open: boolean; keep: () => void; leave: () => void } {
  const [pending, setPending] = useState<(() => void) | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const release = holdLeaveGuard((leave) => setPending(() => leave));
    const onClick = (event: MouseEvent) => {
      if (leaving) return;
      const link = internalLinkClick(event, window.location);
      if (!link) return;
      event.preventDefault();
      event.stopPropagation();
      // Leave re-taps the same link, so React Router's Link handles it as usual.
      setPending(() => () => link.click());
    };
    document.addEventListener("click", onClick, true);
    return () => {
      release();
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
  return {
    open: pending !== null,
    keep: () => setPending(null),
    leave: () => {
      setPending(null);
      if (pending) leaveNow(pending);
    },
  };
}
