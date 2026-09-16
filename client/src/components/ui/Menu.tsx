import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { Link, type LinkProps } from "react-router-dom";

/**
 * Small accessible dropdown menu — the app's own idiom (a plain "three-dot"
 * trigger opening a bordered panel of `MenuItem`/`MenuLinkItem` rows)
 * mirroring `MultiCombobox`'s open/close mechanics (click-outside via a
 * `mousedown` listener, Escape closes) rather than pulling in a separate
 * primitive. Kept generic so any feature can compose a menu from these
 * pieces instead of forking the open/close/dismiss wiring.
 */

/** aria-haspopup/aria-expanded pair for the trigger button, kept pure and
 * exported like `getInputAriaProps`/`getChevronLabel` so the wiring itself
 * is a single, testable source of truth. */
export function getMenuTriggerAriaProps(open: boolean): { "aria-haspopup": "menu"; "aria-expanded": boolean } {
  return { "aria-haspopup": "menu", "aria-expanded": open };
}

/** A little slack above the panel's own 4px visual margin, so a panel that
 * would JUST clear the viewport edge by a hair isn't the one that decides
 * to flip. */
const MENU_GAP = 8;

export interface MenuProps {
  /** Accessible name for the trigger button (e.g. "Actions"). */
  label: string;
  disabled?: boolean;
  className?: string;
  /** Panel content; called with a `close` function so items can dismiss the
   * menu themselves after acting (selection is each item's own concern —
   * this component only owns open/closed). */
  children: (close: () => void) => ReactNode;
}

export function Menu({ label, disabled = false, className = "", children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"down" | "up">("down");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // The panel always opens downward from the trigger UNLESS there isn't room
  // for it before the bottom of the screen, in which case it opens upward
  // instead — a row near the end of a long list (Storage, the meal log,
  // Home's food log) would otherwise have its lower items land off-screen
  // with nothing able to scroll them into view. Decided once per open, from
  // real measurements, not a length/row-count guess.
  //
  // The ceiling is the SMALLER of two independently-measured signals, so
  // either one alone catches what the other misses:
  //  - `visualViewport.height`/`innerHeight` — the standard "how tall is
  //    the visible area" APIs, which account for an on-screen keyboard or a
  //    collapsing mobile toolbar shrinking the visible space without
  //    changing the page's own layout.
  //  - the app shell's own bottom tab bar, if one is rendered — read
  //    straight off the SAME layout pass as the trigger, so it can never
  //    disagree with what was actually painted the way a viewport-size API
  //    can. This is the one that matters in practice: on a real iOS 26
  //    device (item 386) `innerHeight`/`visualViewport.height` kept
  //    reporting the full-screen height while the tab bar still visually
  //    sat at the true bottom of the screen, so the size APIs alone said
  //    "plenty of room" for a panel that would have opened right on top of
  //    (and mostly behind) the bar.
  //
  // Guarded for environments with no `window` (the render-only test suite
  // never opens a menu, so this never runs there; the interaction test
  // suite supplies a fake `window`/`document`).
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel || typeof window === "undefined") return;
    const triggerRect = trigger.getBoundingClientRect();
    const panelHeight = panel.getBoundingClientRect().height;
    const viewportCeiling = window.visualViewport?.height ?? window.innerHeight;
    const navTop = document.querySelector("nav")?.getBoundingClientRect().top;
    const ceiling = navTop === undefined ? viewportCeiling : Math.min(viewportCeiling, navTop);
    const fitsBelow = triggerRect.bottom + panelHeight + MENU_GAP <= ceiling;
    setPlacement(fitsBelow ? "down" : "up");
  }, [open]);

  // Belt and suspenders: whatever the flip decided, ask the browser to
  // scroll the panel fully into view. This is a no-op whenever the panel is
  // already fully visible — `scrollIntoView` only moves anything if some
  // part of the target genuinely isn't on screen — so it costs nothing when
  // the flip above already got it right. What it buys is a guarantee that
  // doesn't depend on either of that effect's two measurements being
  // correct: unlike a height comparison, `scrollIntoView` can't be fooled
  // by a device disagreeing with its own reported viewport size, because it
  // never asks "how tall is the screen" in the first place — it just moves
  // whatever needs moving until the target is on screen, off the same
  // layout the browser already committed to. Depends on `placement` too so
  // it re-targets the settled position on the pass right after the flip
  // effect corrects a first guess, not the guess itself; running twice in
  // that case is harmless since neither pass paints before the other.
  useLayoutEffect(() => {
    if (!open) return;
    panelRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [open, placement]);

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        disabled={disabled}
        {...getMenuTriggerAriaProps(open)}
        {...(open ? { "aria-controls": menuId } : {})}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-inset)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {open && (
        <MenuPanel id={menuId} panelRef={panelRef} placement={placement} onClose={() => setOpen(false)}>
          {children(() => setOpen(false))}
        </MenuPanel>
      )}
    </div>
  );
}

export interface MenuPanelProps {
  id?: string;
  onClose?: () => void;
  /** Which side of the trigger the panel opens on — "down" (the default,
   * and the only option a caller not doing its own measurement should
   * pass) matches every existing render exactly; "up" is what `Menu`'s own
   * viewport check switches to when there's no room below. */
  placement?: "down" | "up";
  /** Forwarded to the panel's root div so `Menu` can measure it before
   * deciding `placement` — the same shape `SheetPanel`'s `panelRef` uses. */
  panelRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}

/**
 * The open panel's chrome, exported standalone (mirroring
 * `MultiComboboxPanel`) so a render test can assert its open-state markup
 * directly without needing a real click to get there. Kept purely
 * presentational — `placement` is a prop, not something this component
 * measures itself — so its own render tests need no DOM/layout to run.
 */
export function MenuPanel({ id, placement = "down", panelRef, children }: MenuPanelProps) {
  return (
    <div
      ref={panelRef}
      id={id}
      role="menu"
      className={`absolute right-0 z-20 min-w-40 max-h-[70vh] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-1 shadow-[var(--shadow-lg)] ${placement === "up" ? "bottom-full mb-1" : "top-full mt-1"}`}
    >
      {children}
    </div>
  );
}

const MENU_ITEM_CLASSES =
  "flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--color-text)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-inset)] disabled:cursor-not-allowed disabled:opacity-60";

export interface MenuItemProps {
  onSelect: () => void;
  disabled?: boolean;
  children: ReactNode;
}

/** A plain action row inside a `Menu`. */
export function MenuItem({ onSelect, disabled, children }: MenuItemProps) {
  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={onSelect} className={MENU_ITEM_CLASSES}>
      {children}
    </button>
  );
}

export interface MenuLinkItemProps extends Omit<LinkProps, "className"> {
  onSelect?: () => void;
}

/** A navigating row inside a `Menu` (e.g. "Edit" → a route) — a real `Link`,
 * not a button, so it works exactly like any other in-app navigation
 * (modifier-click to open in a new tab, etc.). */
export function MenuLinkItem({ onSelect, onClick, ...props }: MenuLinkItemProps) {
  return (
    <Link
      role="menuitem"
      className={MENU_ITEM_CLASSES}
      onClick={(event) => {
        onClick?.(event);
        onSelect?.();
      }}
      {...props}
    />
  );
}
