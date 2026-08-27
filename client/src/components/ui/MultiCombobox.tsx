import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

export type MultiComboboxOption = { value: string; label: string; emoji?: string };

interface MultiComboboxProps {
  options: MultiComboboxOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  emptyMessage?: string;
}

/** Case-insensitive substring match of `query` against each option's label. */
export function filterOptions(options: MultiComboboxOption[], query: string): MultiComboboxOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((option) => option.label.toLowerCase().includes(q));
}

/** Adds `value` to `selected` if absent, removes it if present (multi-select toggle). */
export function toggleValue(selected: string[], value: string): string[] {
  return selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
}

/**
 * Next highlighted index for ArrowUp (`direction: -1`) / ArrowDown (`direction: 1`),
 * wrapping around the ends of a `length`-item list. `-1` (nothing highlighted) steps
 * to the first item going down or the last item going up.
 */
export function moveHighlight(current: number, direction: 1 | -1, length: number): number {
  if (length === 0) return -1;
  if (current < 0) return direction === 1 ? 0 : length - 1;
  return (current + direction + length) % length;
}

/**
 * Derives the *effective* highlighted index for a render, given the last
 * explicit index the user navigated/hovered to (`current`), the number of
 * items currently visible, and whether the listbox is open. This is a pure
 * function of those inputs (no effect racing the keyboard handlers):
 * - Closed, or nothing to show: nothing is highlighted (`-1`).
 * - Open with items: `current` is kept as-is if it still points at a valid
 *   item; otherwise the first item is auto-highlighted so a query followed
 *   by Enter always has something to toggle. Typing resets `current` to -1
 *   on every keystroke (see the input's `onChange`), so the "keep if valid"
 *   branch only ever matters for arrow-key/hover navigation — a query
 *   change always re-lands the effective highlight on the first filtered
 *   match, it never survives the narrowing.
 */
export function resolveHighlight(current: number, filteredLength: number, open: boolean): number {
  if (!open || filteredLength === 0) return -1;
  if (current >= 0 && current < filteredLength) return current;
  return 0;
}

interface InputAriaProps {
  role: "combobox";
  "aria-expanded": boolean;
  "aria-autocomplete": "list";
  "aria-controls"?: string;
  "aria-activedescendant"?: string;
}

/**
 * Complete ARIA/role prop object for the combobox `<input>`. This is the
 * *only* source of that wiring — the JSX spreads the result directly rather
 * than setting any of these attributes itself, so deleting the spread (not
 * just breaking this function) is visible as missing attributes in a render
 * test. `aria-controls` is included only while the listbox it points at is
 * actually rendered (i.e. `open`), so a closed combobox never references a
 * nonexistent id (axe: aria-controls must reference an existing element).
 */
export function getInputAriaProps({
  open,
  listboxId,
  activeDescendantId,
}: {
  open: boolean;
  listboxId: string;
  activeDescendantId?: string;
}): InputAriaProps {
  return {
    role: "combobox",
    "aria-expanded": open,
    "aria-autocomplete": "list",
    ...(open ? { "aria-controls": listboxId } : {}),
    ...(activeDescendantId !== undefined ? { "aria-activedescendant": activeDescendantId } : {}),
  };
}

/**
 * Decides what the Enter key should do, given whether the listbox is open,
 * the effective highlighted index, and how many options are currently
 * filtered in. Pure and exhaustive over the four state classes so the
 * keydown handler can be a verbatim pass-through:
 * - Closed: not our key to handle — don't prevent default, nothing to toggle.
 * - Open: ALWAYS prevent default (Enter must never fall through to a native
 *   form submit while the listbox is open), and additionally report a
 *   `toggleIndex` when `effectiveHighlighted` points at a valid filtered
 *   item, or `null` when there's nothing to toggle (e.g. no matches).
 */
export function resolveEnterAction(
  open: boolean,
  effectiveHighlighted: number,
  filteredLength: number,
): { prevent: boolean; toggleIndex: number | null } {
  if (!open) return { prevent: false, toggleIndex: null };
  const valid = effectiveHighlighted >= 0 && effectiveHighlighted < filteredLength;
  return { prevent: true, toggleIndex: valid ? effectiveHighlighted : null };
}

/** DOM id for one option's `<li role="option">`, derived from the listbox id + the option's value. */
export function optionId(listboxId: string, option: MultiComboboxOption): string {
  return `${listboxId}-option-${option.value}`;
}

/**
 * Value for the input's `aria-activedescendant`: the highlighted option's id,
 * or `undefined` (attribute omitted) when nothing is highlighted.
 */
export function getActiveDescendantId(
  filtered: MultiComboboxOption[],
  highlighted: number,
  listboxId: string,
): string | undefined {
  return highlighted >= 0 && highlighted < filtered.length ? optionId(listboxId, filtered[highlighted]!) : undefined;
}

/**
 * aria-label for the field's chevron toggle button, synced to the listbox's
 * open state so a screen reader announces what the button will do next
 * (matching the toggle-button convention, not "what is true now").
 */
export function getChevronLabel(open: boolean): string {
  return open ? "Hide options" : "Show options";
}

interface MultiComboboxOptionListProps {
  listboxId: string;
  options: MultiComboboxOption[];
  selectedValues: string[];
  highlighted: number;
  emptyMessage: string;
  onHoverOption: (index: number) => void;
  onToggleOption: (value: string) => void;
}

/**
 * The listbox body — a pure function of its props (no internal state), kept
 * separate from `MultiCombobox` so it can be rendered (and tested) with an
 * explicit `highlighted` index instead of depending on live keyboard/focus
 * state that a static render can't simulate.
 */
export function MultiComboboxOptionList({
  listboxId,
  options,
  selectedValues,
  highlighted,
  emptyMessage,
  onHoverOption,
  onToggleOption,
}: MultiComboboxOptionListProps) {
  return (
    <ul
      id={listboxId}
      role="listbox"
      aria-multiselectable="true"
      className="max-h-60 overflow-y-auto py-1"
    >
      {options.length === 0 ? (
        <li className="px-3 py-2 text-sm text-[var(--color-text-muted)]">{emptyMessage}</li>
      ) : (
        options.map((option, index) => {
          const selected = selectedValues.includes(option.value);
          return (
            <li
              key={option.value}
              id={optionId(listboxId, option)}
              role="option"
              aria-selected={selected}
              onMouseEnter={() => onHoverOption(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onToggleOption(option.value)}
              className={`flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[var(--color-text)] ${
                index === highlighted
                  ? "bg-[var(--color-bg-inset)]"
                  : selected
                    ? "bg-[var(--color-primary-soft)]"
                    : ""
              }`}
            >
              <span aria-hidden="true" className="w-4 shrink-0 text-center text-[var(--color-primary)]">
                {selected ? "✓" : ""}
              </span>
              {option.emoji ? <span aria-hidden="true">{option.emoji}</span> : null}
              <span className="flex-1">{option.label}</span>
            </li>
          );
        })
      )}
    </ul>
  );
}

interface MultiComboboxPanelProps extends MultiComboboxOptionListProps {
  /** Closes the menu only — must never touch selection or the query. */
  onDone: () => void;
}

/**
 * The open dropdown: the scrollable `MultiComboboxOptionList` plus a sticky
 * "Done" footer row that stays visible below it (the list scrolls internally
 * via its own max-h; the footer is a sibling after it, not inside the
 * scroll area, so it never scrolls out of view). This component — not the
 * list — owns the bordered/rounded/shadowed panel chrome and the absolute
 * positioning under the field, so `MultiComboboxOptionList` stays a plain
 * `<ul role="listbox">` usable on its own (and in its existing tests).
 *
 * Exported, like `MultiComboboxOptionList`, so open-state render tests can
 * assert the Done button exists inside the panel without needing real
 * keyboard/pointer events (this repo's tests render with `renderToString`
 * under a Node test environment, with no DOM to dispatch events into).
 */
export function MultiComboboxPanel({ onDone, ...listProps }: MultiComboboxPanelProps) {
  return (
    <div className="absolute top-full left-0 z-20 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-lg)]">
      <MultiComboboxOptionList {...listProps} />
      <button
        type="button"
        onClick={onDone}
        className="flex min-h-11 w-full items-center justify-center bg-[var(--color-primary)] text-sm font-medium text-[var(--color-primary-contrast)]"
      >
        Done
      </button>
    </div>
  );
}

interface MultiComboboxChevronButtonProps {
  open: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

/**
 * Field-edge button that opens/closes the menu, independent of the input's
 * own "focus opens it" behavior. Extracted as its own component (mirroring
 * why `MultiComboboxOptionList` is exported) so a render test can pin its
 * `open: true` markup directly — the real field can only ever be
 * server-rendered closed, since `open` lives in `MultiCombobox`'s own state
 * and this repo's render tests have no DOM to click/focus through.
 *
 * Focus handling, thought through: this button sits inside the same row
 * `<div>` whose own `onClick` refocuses the input, so that tapping anywhere
 * in the field (not just the input) resumes typing. Two guards keep that
 * from fighting this toggle:
 *  - `onClick` stops propagation, so a chevron tap never reaches that row
 *    handler at all — clicking the chevron means "toggle the menu", not
 *    "focus the input for text entry".
 *  - `onMouseDown` prevents the browser's default focus-on-click for the
 *    button. Without it, mousedown here would blur the input and move
 *    focus to this button; if anything *else* then refocused the input
 *    (e.g. that same row handler, if the stopPropagation above were ever
 *    lost), that refocus would be a real focus change, re-firing the
 *    input's `onFocus` and silently reopening the menu right after this
 *    button just closed it. Keeping focus on the input the whole time
 *    makes any such refocus a no-op instead.
 * Tapping the input itself is untouched by either guard, so it keeps
 * opening (never closing) the menu exactly as before.
 */
export function MultiComboboxChevronButton({ open, disabled, onToggle }: MultiComboboxChevronButtonProps) {
  return (
    <button
      type="button"
      aria-label={getChevronLabel(open)}
      // APG combobox pattern: the popup's expanded state is announced by the
      // combobox input alone, and the decorative toggle is removed from the
      // Tab order (it stays touch/mouse-tappable, and keyboard users have
      // ArrowDown/Escape on the input itself).
      tabIndex={-1}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className="group flex shrink-0 items-center justify-center rounded-full p-[10px] -m-[10px] text-[var(--color-text-muted)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {/* Same chevron idiom as Select.tsx (viewBox 24, M6 9l6 6 6-6); a
          single path rotated 180° for the open (chevron-up) state instead
          of swapping to a second path. Visual size stays 24px (h-6 w-6);
          the button's own padding above extends the tap target to 44px. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={`h-6 w-6 transition-transform duration-[var(--duration-fast)] ${open ? "rotate-180" : ""}`}
        fill="none"
      >
        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/**
 * Searchable multi-select combobox: type to filter options, click (or Enter) to
 * toggle them, selected options render as removable chips. Reuses the token
 * classes from `Input`/`Select` so it looks native in both themes.
 */
export function MultiCombobox({
  options,
  value,
  onChange,
  placeholder = "Search…",
  disabled = false,
  id,
  emptyMessage = "No matches",
}: MultiComboboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listboxId = `${inputId}-listbox`;
  const countBadgeId = `${inputId}-count`;

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => filterOptions(options, query), [options, query]);
  const selectedOptions = useMemo(
    () => value.map((v) => options.find((o) => o.value === v)).filter((o): o is MultiComboboxOption => Boolean(o)),
    [value, options],
  );
  // Derived, not stored: recomputed fresh every render from `highlighted` +
  // the current filtered list, so there's no effect that can race a handler
  // and clobber an index the handler just set (see `resolveHighlight`).
  const effectiveHighlighted = useMemo(
    () => resolveHighlight(highlighted, filtered.length, open),
    [highlighted, filtered.length, open],
  );

  // Click-outside closes the dropdown.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setHighlighted(-1);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function toggleOption(optionValue: string) {
    onChange(toggleValue(value, optionValue));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlighted(moveHighlight(effectiveHighlighted, 1, filtered.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setHighlighted(moveHighlight(effectiveHighlighted, -1, filtered.length));
    } else if (event.key === "Enter") {
      // Verbatim pass-through of the pure decision: obey both fields, do
      // nothing else, so the cycle-1 "prevent only when highlighted >= 0"
      // regression can't creep back in unnoticed.
      const { prevent, toggleIndex } = resolveEnterAction(open, effectiveHighlighted, filtered.length);
      if (prevent) event.preventDefault();
      if (toggleIndex !== null) {
        toggleOption(filtered[toggleIndex]!.value);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setHighlighted(-1);
      }
    } else if (event.key === "Backspace" && query === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <div
          onClick={() => {
            if (disabled) return;
            inputRef.current?.focus();
            // Open explicitly, not only via the input's onFocus: tapping an
            // ALREADY-focused input fires no focus event, so after a
            // chevron-collapse a tap here would otherwise never reopen.
            // The chevron's own onClick stopPropagation keeps its close
            // action from being immediately undone by this handler.
            setOpen(true);
          }}
          className={`flex min-h-11 w-full items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 transition-colors duration-[var(--duration-fast)] focus-within:border-[var(--color-primary)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--color-coral-deep)] ${
            disabled ? "cursor-not-allowed opacity-60" : "cursor-text"
          }`}
        >
          {/* Left magnifier icon, styled like Select's chevron: stroke
              currentColor, muted token, purely decorative. */}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="pointer-events-none h-4 w-4 shrink-0 text-[var(--color-text-muted)]"
            fill="none"
          >
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            {...getInputAriaProps({
              open,
              listboxId,
              activeDescendantId: getActiveDescendantId(filtered, effectiveHighlighted, listboxId),
            })}
            {...(value.length >= 1 ? { "aria-describedby": countBadgeId } : {})}
            autoComplete="off"
            data-no-focus-ring=""
            disabled={disabled}
            value={query}
            placeholder={selectedOptions.length === 0 ? placeholder : undefined}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              // Clear any explicit arrow/hover highlight on every keystroke so
              // `resolveHighlight` re-lands the effective highlight on the
              // FIRST filtered match — otherwise a stale index from before the
              // query changed could survive and Enter would toggle the wrong
              // option (item 14).
              setHighlighted(-1);
            }}
            onKeyDown={handleKeyDown}
            className="min-w-0 flex-1 border-none bg-transparent px-1 py-2 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] disabled:cursor-not-allowed"
          />
          {value.length >= 1 && (
            <span
              id={countBadgeId}
              className="pointer-events-none shrink-0 rounded-[var(--radius-pill)] bg-[var(--color-primary-soft)] px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-[var(--color-primary)]"
            >
              {value.length} selected
            </span>
          )}
          <MultiComboboxChevronButton
            open={open}
            disabled={disabled}
            onToggle={() => {
              if (open) {
                setOpen(false);
                setHighlighted(-1);
                // Release focus on collapse: the chevron's mousedown guard
                // kept focus on the input, so without this blur a follow-up
                // tap on the input would not refire onFocus and the menu
                // could never reopen from a tap.
                inputRef.current?.blur();
              } else {
                inputRef.current?.focus();
                setOpen(true);
              }
            }}
          />
        </div>

        {open && !disabled && (
          <MultiComboboxPanel
            listboxId={listboxId}
            options={filtered}
            selectedValues={value}
            highlighted={effectiveHighlighted}
            emptyMessage={emptyMessage}
            onHoverOption={setHighlighted}
            onToggleOption={toggleOption}
            onDone={() => {
              // Close only — selection and query are left exactly as they are.
              setOpen(false);
              setHighlighted(-1);
            }}
          />
        )}
      </div>

      {value.length >= 1 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {selectedOptions.map((option) => (
            <span
              key={option.value}
              className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--color-bg-inset)] py-1 pr-1 pl-2.5 text-sm text-[var(--color-text)]"
            >
              {option.emoji ? <span aria-hidden="true">{option.emoji}</span> : null}
              {option.label}
              <button
                type="button"
                aria-label={`Remove ${option.label}`}
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleOption(option.value);
                }}
                className="group flex shrink-0 items-center justify-center rounded-full p-[10px] -m-[10px] disabled:cursor-not-allowed"
              >
                {/* Visual size stays 24px (h-6 w-6); the button's own padding
                    above extends the actual hit target to 44px without
                    growing the chip, and the negative margin pulls the extra
                    box back so surrounding layout doesn't shift. */}
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-text-muted)] group-hover:bg-[var(--color-border)] group-hover:text-[var(--color-text)]"
                >
                  ×
                </span>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
