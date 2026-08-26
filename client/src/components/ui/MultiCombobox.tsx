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
      className="absolute top-full left-0 z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-1 shadow-[var(--shadow-lg)]"
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
                index === highlighted ? "bg-[var(--color-bg-inset)]" : ""
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
      <div
        onClick={() => !disabled && inputRef.current?.focus()}
        className={`flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 transition-colors duration-[var(--duration-fast)] focus-within:border-[var(--color-primary)] ${
          disabled ? "cursor-not-allowed opacity-60" : "cursor-text"
        }`}
      >
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
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          {...getInputAriaProps({
            open,
            listboxId,
            activeDescendantId: getActiveDescendantId(filtered, effectiveHighlighted, listboxId),
          })}
          autoComplete="off"
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
          className="min-w-[6rem] flex-1 border-none bg-transparent px-1 py-1 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] disabled:cursor-not-allowed"
        />
      </div>

      {open && !disabled && (
        <MultiComboboxOptionList
          listboxId={listboxId}
          options={filtered}
          selectedValues={value}
          highlighted={effectiveHighlighted}
          emptyMessage={emptyMessage}
          onHoverOption={setHighlighted}
          onToggleOption={toggleOption}
        />
      )}
    </div>
  );
}
