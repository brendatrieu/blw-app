import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);
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

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
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
        <MenuPanel id={menuId} onClose={() => setOpen(false)}>
          {children(() => setOpen(false))}
        </MenuPanel>
      )}
    </div>
  );
}

export interface MenuPanelProps {
  id?: string;
  onClose?: () => void;
  children: ReactNode;
}

/**
 * The open panel's chrome, exported standalone (mirroring
 * `MultiComboboxPanel`) so a render test can assert its open-state markup
 * directly without needing a real click to get there.
 */
export function MenuPanel({ id, children }: MenuPanelProps) {
  return (
    <div
      id={id}
      role="menu"
      className="absolute right-0 top-full z-20 mt-1 min-w-40 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-1 shadow-[var(--shadow-lg)]"
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
