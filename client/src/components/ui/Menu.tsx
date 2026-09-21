import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { Link, type LinkProps } from "react-router-dom";

/**
 * Small accessible dropdown menu — the app's own idiom (a plain "three-dot"
 * trigger opening a bordered panel of `MenuItem`/`MenuLinkItem` rows)
 * mirroring `MultiCombobox`'s open/close mechanics (click-outside via a
 * `mousedown` listener, Escape closes) rather than pulling in a separate
 * primitive. Kept generic so any feature can compose a menu from these
 * pieces instead of forking the open/close/dismiss wiring.
 *
 * The panel is portaled to `document.body` and positioned with computed
 * `fixed` coordinates (item 397) — NOT `position: absolute` anchored to a
 * nearby ancestor, which is how it used to work and which cannot be made
 * to reliably paint above a later sibling. An absolutely-positioned child
 * can visually escape its parent's own BOX, but it can never escape its
 * parent's PAINT-ORDER TURN relative to that parent's siblings: two list
 * rows with no z-index of their own paint in tree order regardless of what
 * z-index something deep inside the earlier one claims for itself, so a
 * menu opening over the NEXT card in a list would have that card's own
 * content (its badge, its own kebab) paint back over the open menu — which
 * is exactly what a real user hit (item 397). `Sheet`/`Dialog` never had
 * this problem because they already portal to `document.body`; this makes
 * `Menu` consistent with that, rather than a second, weaker pattern.
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

/** Where the portaled panel's fixed box sits, in viewport pixels — `null`
 * for the one render before anything has been measured yet. */
type MenuPosition = { top: number; right: number } | { bottom: number; right: number } | null;

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
  const [position, setPosition] = useState<MenuPosition>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      // The trigger lives in `containerRef`; the panel is portaled out of
      // it, so its own subtree is checked separately — a click landing
      // anywhere inside the open menu is not an "outside" click.
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    }
    // A portaled, fixed-position panel doesn't move with the page the way
    // the old locally-anchored one did — closing on scroll avoids it
    // visually detaching from a trigger that has since scrolled away.
    function handleScroll() {
      setOpen(false);
    }
    // Same guard the layout effect below uses — this component is also
    // driven with no `window` at all by the interaction test suite.
    const scrollTarget = typeof window === "undefined" ? null : window;
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    scrollTarget?.addEventListener("scroll", handleScroll, { passive: true, capture: true });
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      scrollTarget?.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [open]);

  // Where the panel goes: it always opens downward from the trigger UNLESS
  // there isn't room for it before the bottom of the screen, in which case
  // it opens upward instead — a row near the end of a long list (Storage,
  // the meal log, Home's food log) would otherwise have its lower items
  // land off-screen with nothing able to scroll them into view. Decided
  // once per open, from real measurements, not a length/row-count guess,
  // and expressed as exact `fixed` coordinates (rather than a `top-full` /
  // `bottom-full` CSS-class toggle) because the panel is portaled — it no
  // longer has a nearby positioned ancestor to anchor a relative offset to.
  //
  // The fits-below ceiling is the SMALLER of two independently-measured
  // signals, so either one alone catches what the other misses:
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
  // The actual pixel math, once the direction is decided, uses only
  // `window.innerHeight`/`innerWidth` — the LAYOUT viewport, the same
  // coordinate space `getBoundingClientRect()` itself reports in — never
  // `visualViewport`, which can genuinely disagree with that space and
  // would throw the coordinates off by however much the two diverge.
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
    const right = window.innerWidth - triggerRect.right;
    // Clamped into [0, innerHeight - panelHeight] regardless of which way it
    // opened: a guarantee that holds even if the fits-below decision itself
    // was wrong (both of its signals disagreeing with reality at once,
    // something no real device has shown — but the panel is portaled now,
    // so unlike the old scrollIntoView safety net this clamp actually means
    // something: a position obeys it, where a scroll offset could not have
    // moved a `fixed` box at all).
    const clampedTop = Math.max(0, Math.min(window.innerHeight - panelHeight, triggerRect.bottom + MENU_GAP));
    const clampedBottom = Math.max(0, Math.min(window.innerHeight - panelHeight, window.innerHeight - triggerRect.top + MENU_GAP));
    setPosition(fitsBelow ? { top: clampedTop, right } : { bottom: clampedBottom, right });
  }, [open]);

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

      {open &&
        createPortal(
          <MenuPanel id={menuId} panelRef={panelRef} position={position} onClose={() => setOpen(false)}>
            {children(() => setOpen(false))}
          </MenuPanel>,
          document.body,
        )}
    </div>
  );
}

export interface MenuPanelProps {
  id?: string;
  onClose?: () => void;
  /** The panel's `fixed` position in viewport pixels, or `null` for the
   * one render before `Menu`'s own effect has measured anything — that
   * render stays invisible (never a guessed position that could flash
   * somewhere wrong) rather than picking a default side. */
  position?: MenuPosition;
  /** Forwarded to the panel's root div so `Menu` can measure it before
   * deciding `position` — the same shape `SheetPanel`'s `panelRef` uses. */
  panelRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}

/**
 * The open panel's chrome, exported standalone (mirroring
 * `MultiComboboxPanel`) so a render test can assert its open-state markup
 * directly without needing a real click to get there. Kept purely
 * presentational — `position` is a prop, not something this component
 * measures itself — so its own render tests need no DOM/layout to run, and
 * it stays oblivious to the fact that `Menu` renders it through a portal.
 */
export function MenuPanel({ id, position = null, panelRef, children }: MenuPanelProps) {
  const style: CSSProperties = position
    ? { position: "fixed", right: position.right, ...("top" in position ? { top: position.top } : { bottom: position.bottom }) }
    : { position: "fixed", top: 0, right: 0, visibility: "hidden" };
  return (
    <div
      ref={panelRef}
      id={id}
      role="menu"
      style={style}
      className="z-20 min-w-40 max-h-[70vh] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-1 shadow-[var(--shadow-lg)]"
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
