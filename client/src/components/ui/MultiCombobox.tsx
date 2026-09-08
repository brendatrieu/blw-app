import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

export type MultiComboboxOption = { value: string; label: string; emoji?: string };

/**
 * How many values this combobox holds — the one thing that decides what
 * happens *after* a selection (item 230). "multi" is the log-meal / pantry /
 * recipe-ingredients field: a pick adds a chip and the menu stays open so the
 * next food can be typed straight away. "single" is the recipe picker and the
 * "contains ingredient" filter: a pick fills the field and the menu is done.
 *
 * Explicit rather than inferred from `value.length`: an empty multi-select and
 * an empty single-select are the same array, and a mode that flips as chips
 * come and go would be unreadable.
 *
 * Two things a static render can see differ by mode, so a caller's choice is
 * pinned by its own render test rather than only by reading the JSX: the
 * "N selected" count badge (multi only) and the listbox's
 * `aria-multiselectable`.
 */
export type MultiComboboxMode = "multi" | "single";

interface MultiComboboxProps {
  options: MultiComboboxOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  emptyMessage?: string;
  /**
   * Opt-in "create what you typed" affordance (item 180). When present, a
   * query that matches nothing renders a trailing row instead of the plain
   * `emptyMessage`; choosing it hands the trimmed query back. The combobox
   * itself neither creates nor selects anything — the owner does both.
   */
  onCreate?: (query: string) => void;
  /** Label for that row, given the trimmed query. */
  createLabel?: (query: string) => string;
  /** See `MultiComboboxMode`. Defaults to "multi". */
  mode?: MultiComboboxMode;
}

/** Case-insensitive substring match of `query` against each option's label. */
export function filterOptions(options: MultiComboboxOption[], query: string): MultiComboboxOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((option) => option.label.toLowerCase().includes(q));
}

/**
 * Drives this multi-select as a SINGLE-select (items 210, 213): the recipe
 * picker and the "contains ingredient" filter both want exactly one value,
 * and there's no second combobox in the app to build for them.
 *
 * `toggleValue` hands back `[]` when the current pick is toggled off, and
 * `[current, next]` when a different row is chosen — so the last entry is
 * always the new selection, and an empty array always means "cleared". Pure
 * so that reading stays pinned by a test rather than by the caller's
 * one-liner.
 */
export function resolveSingleSelection(next: string[]): string {
  return next.length === 0 ? "" : next[next.length - 1]!;
}

/**
 * What happens after an option is chosen — the whole of item 230, as one pure
 * decision consumed verbatim by both selection paths (the option row's click
 * and the keydown handler's Enter branch), so the two can never drift apart
 * again. Standard combobox conventions:
 * - `clearQuery` is ALWAYS true. The typed search text has done its job the
 *   moment a selection lands; leaving it behind meant the next food had to be
 *   backspaced out first, which is the bug this replaces.
 * - `close` only in "single" mode: one value, one pick, nothing left to do.
 *   A multi-select keeps its menu open — it closes only via Done, Escape or a
 *   tap outside.
 * - `keepFocus` only in "multi" mode: the caret stays in the input so the next
 *   food can be typed immediately (after a CLICK that means actively
 *   refocusing the input, which the click's own mousedown guard kept from
 *   moving in the first place; after Enter focus is already there).
 *
 * `via` deliberately does not change the answer — click and Enter select
 * identically — but it is part of the signature so that stays a pinned
 * promise rather than an accident of the call sites.
 */
export function resolveSelectOutcome(
  mode: MultiComboboxMode,
  via: "click" | "enter",
): { clearQuery: boolean; close: boolean; keepFocus: boolean } {
  // `via` is intentionally not read — see the note above; referencing it here
  // keeps the pinned signature without tripping no-unused-vars.
  void via;
  return { clearQuery: true, close: mode === "single", keepFocus: mode === "multi" };
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

/**
 * `resolveHighlight` gated on the query, layered on top of it (so that
 * function's contract and tests stay exactly as they are) — this is what the
 * component actually renders with.
 *
 * The auto-land-on-the-first-row rule exists for ONE flow: type a query, then
 * press Enter. It has no business firing on an unfiltered list, and after
 * item 230 that distinction stopped being theoretical: a multi-select pick
 * clears the query and keeps the menu open, so with a blank query still
 * auto-highlighting row 0, a second Enter (the "confirm the food, then save
 * the meal" reflex) selected the first food of the WHOLE list — a food nobody
 * typed or looked at. Gating on a non-blank query makes that second Enter land
 * on nothing, which is exactly what item 230 asks for ("Enter with nothing
 * highlighted does nothing").
 *
 * An explicit index the user arrowed or hovered to is always honoured, blank
 * query or not; only the *automatic* first-row highlight is withheld.
 */
export function resolveEffectiveHighlight(
  current: number,
  rows: number,
  open: boolean,
  query: string,
): number {
  if (query.trim().length > 0) return resolveHighlight(current, rows, open);
  if (!open || rows === 0) return -1;
  return current >= 0 && current < rows ? current : -1;
}

/**
 * Everything the combobox owns about its own menu — the typed query, whether
 * the listbox is showing, and the last index the user explicitly navigated to.
 * One object rather than three `useState`s so every transition is a single
 * `setUi(pureTransition(prev, …))`: a handler can't obey two thirds of a
 * decision and quietly drop the rest, which is the failure mode item 230's
 * first pass had (the outcome was decided purely, then applied by hand).
 */
export interface ComboboxUiState {
  query: string;
  open: boolean;
  highlighted: number;
}

/** Menu shut, nothing typed, nothing highlighted — also the initial state. */
export const CLOSED_COMBOBOX_UI: ComboboxUiState = { query: "", open: false, highlighted: -1 };

/**
 * Applies a `resolveSelectOutcome` decision to the menu state — the ONLY
 * place item 230's post-selection behaviour is carried out, used by both
 * selection routes (option click, Enter). Every field of the outcome is read
 * here, so a mutation that ignores one is a failing test rather than a silent
 * regression.
 *
 * `highlighted` is always reset: the list is about to change shape (the query
 * usually just cleared), so a stale arrow/hover index would point at whatever
 * has moved into that slot.
 */
export function applySelectOutcome(
  state: ComboboxUiState,
  outcome: { clearQuery: boolean; close: boolean },
): ComboboxUiState {
  return {
    query: outcome.clearQuery ? "" : state.query,
    open: outcome.close ? false : state.open,
    highlighted: -1,
  };
}

/** Focus/tap on the field: show the menu, touching nothing else. */
export function applyOpen(state: ComboboxUiState): ComboboxUiState {
  return { ...state, open: true };
}

/** Escape, Done, the chevron's collapse, a tap outside: hide the menu and
 * drop the highlight. The query is deliberately kept — closing is not
 * discarding what was typed. */
export function applyClose(state: ComboboxUiState): ComboboxUiState {
  return { ...state, open: false, highlighted: -1 };
}

/** A keystroke in the input: new query, menu open, explicit highlight cleared
 * so `resolveEffectiveHighlight` re-lands on the first match of the NEW
 * filtered list rather than keeping an index from before the narrowing. */
export function applyQuery(state: ComboboxUiState, query: string): ComboboxUiState {
  return { ...state, query, open: true, highlighted: -1 };
}

/** Hovering a row highlights it. */
export function applyHighlight(state: ComboboxUiState, index: number): ComboboxUiState {
  return { ...state, highlighted: index };
}

/** ArrowUp/ArrowDown: open the menu if it was shut and step the highlight,
 * wrapping. Stepping starts from the *effective* highlight so the first arrow
 * after a query lands where the user can see the highlight sitting. */
export function applyArrow(state: ComboboxUiState, direction: 1 | -1, rows: number): ComboboxUiState {
  const from = resolveEffectiveHighlight(state.highlighted, rows, state.open, state.query);
  return { ...state, open: true, highlighted: moveHighlight(from, direction, rows) };
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

/**
 * Whether the trailing "create what you typed" row is showing. It replaces
 * the empty message rather than sitting alongside matches: an option row
 * offering to create a food the parent can already see would be a trap.
 * Pure so the "only on a non-blank query with zero matches" rule is pinned
 * by a test, not by reading JSX.
 */
export function shouldShowCreateRow(query: string, filteredLength: number, hasCreate: boolean): boolean {
  return hasCreate && filteredLength === 0 && query.trim().length > 0;
}

/** Total navigable rows in the listbox — the create row, when shown, is the
 * last one, so its index is exactly `filteredLength`. */
export function rowCount(filteredLength: number, createRowVisible: boolean): number {
  return filteredLength + (createRowVisible ? 1 : 0);
}

/**
 * Enter's decision once a create row is in play, layered on `resolveEnterAction`
 * so that function's contract (and its tests) stay exactly as they were:
 * - Closed: still not our key — the surrounding form submits normally.
 * - Open: `prevent` is ALWAYS true, so Enter on the create row (or on
 *   anything else in an open listbox) can never fall through to the
 *   surrounding form's submit. That's the item 180 guarantee: creating a
 *   food from the log-meal picker must not also log the meal.
 * - `create` is true only when the highlight is sitting on the create row
 *   itself (index === filteredLength, i.e. past the last real option).
 * Consumed verbatim by the keydown handler, like its base.
 */
export function resolveCreateEnterAction(
  open: boolean,
  effectiveHighlighted: number,
  filteredLength: number,
  createRowVisible: boolean,
): { prevent: boolean; toggleIndex: number | null; create: boolean } {
  const base = resolveEnterAction(open, effectiveHighlighted, filteredLength);
  const create = open && createRowVisible && effectiveHighlighted === filteredLength;
  return { ...base, create };
}

/** DOM id for the trailing create row (the one `optionId` can't name — it has
 * no option object behind it). */
export function createOptionId(listboxId: string): string {
  return `${listboxId}-option-create`;
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
 * `getActiveDescendantId` widened by the create row: the row past the last
 * option is the create row, and it has its own id. Kept as a separate,
 * exported function rather than folded into the one above so the existing
 * signature and its tests are untouched.
 */
export function resolveActiveDescendantId(
  filtered: MultiComboboxOption[],
  highlighted: number,
  listboxId: string,
  createRowVisible: boolean,
): string | undefined {
  if (createRowVisible && highlighted === filtered.length) return createOptionId(listboxId);
  return getActiveDescendantId(filtered, highlighted, listboxId);
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
  /**
   * Choosing a row. Takes the whole OPTION, not its value, on purpose: the
   * bare "add/remove this value" toggle a chip's × uses takes a `string`, so
   * wiring that one up here — the exact regression that put the typed query
   * back after a click — is a type error rather than a silent behaviour
   * change. Only `MultiCombobox`'s `commitSelection` fits this signature.
   */
  onSelectOption: (option: MultiComboboxOption) => void;
  /** The trailing "create what you typed" row, when one is showing — see
   * `shouldShowCreateRow`. Its index is `options.length`. */
  createRow?: { label: string; onSelect: () => void };
  /** Mirrors the owner's `mode`: a single-select listbox must not claim to be
   * multi-selectable. Defaults to true (the multi default). */
  multiselectable?: boolean;
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
  onSelectOption,
  createRow,
  multiselectable = true,
}: MultiComboboxOptionListProps) {
  return (
    <ul
      id={listboxId}
      role="listbox"
      aria-multiselectable={multiselectable}
      className="max-h-60 overflow-y-auto py-1"
    >
      {options.length === 0 && !createRow ? (
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
              onClick={() => onSelectOption(option)}
              className={`flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[var(--color-text)] ${
                index === highlighted
                  ? "bg-[var(--color-bg-inset)]"
                  : selected
                    ? "bg-[var(--color-primary-soft)]"
                    : ""
              }`}
            >
              <span aria-hidden="true" className="w-4 shrink-0 text-center text-[var(--color-primary-soft-text)]">
                {selected ? "✓" : ""}
              </span>
              {option.emoji ? <span aria-hidden="true">{option.emoji}</span> : null}
              <span className="flex-1">{option.label}</span>
            </li>
          );
        })
      )}
      {createRow ? (
        // Same row anatomy as a real option (role, min height, ✓ column
        // width) so keyboard navigation and hit targets don't change shape
        // at the bottom of the list. `aria-selected={false}`: it's an action,
        // never a selected value. mousedown is prevented for the same reason
        // the option rows prevent it — the click must not blur the input
        // before it lands.
        <li
          id={createOptionId(listboxId)}
          role="option"
          aria-selected={false}
          onMouseEnter={() => onHoverOption(options.length)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={createRow.onSelect}
          className={`flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--color-text)] ${
            options.length === highlighted ? "bg-[var(--color-bg-inset)]" : ""
          }`}
        >
          <span aria-hidden="true" className="w-4 shrink-0 text-center text-[var(--color-primary-soft-text)]">
            +
          </span>
          <span className="flex-1">{createRow.label}</span>
        </li>
      ) : null}
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
 * Everything a render and a keypress need, derived from the props + the menu
 * state in one place. The component holds no derivation of its own: it reads
 * these fields and nothing else, so the chain from "what is typed" to "what
 * Enter does" is one pure function with one set of tests, rather than six
 * call sites in a component that a DOM-less test can't drive.
 *
 * The `enter` field is the point of it. Enter's answer depends on the query
 * (via the highlight), the filtered length and the create row all agreeing;
 * computing it here means the keydown handler passes no arguments and so can
 * pass none of them wrongly — including the blank-query case that used to
 * make a second Enter select a food nobody typed.
 */
export function deriveComboboxView({
  options,
  value,
  ui,
  mode,
  hasCreate,
  listboxId,
}: {
  options: MultiComboboxOption[];
  value: string[];
  ui: ComboboxUiState;
  mode: MultiComboboxMode;
  hasCreate: boolean;
  listboxId: string;
}): {
  filtered: MultiComboboxOption[];
  createRowVisible: boolean;
  rows: number;
  highlighted: number;
  showCountBadge: boolean;
  activeDescendantId: string | undefined;
  enter: { prevent: boolean; toggleIndex: number | null; create: boolean };
} {
  const filtered = filterOptions(options, ui.query);
  const createRowVisible = shouldShowCreateRow(ui.query, filtered.length, hasCreate);
  // The create row is navigable, so it counts as a row for highlight
  // purposes — that's the ONLY thing `rows` is for.
  const rows = rowCount(filtered.length, createRowVisible);
  const highlighted = resolveEffectiveHighlight(ui.highlighted, rows, ui.open, ui.query);
  return {
    filtered,
    createRowVisible,
    rows,
    highlighted,
    // "2 selected" is a multi-select affordance: it exists so a long chip row
    // can be counted at a glance. A single-select holds one value, shown as
    // its one chip, so "1 selected" would be noise — which also makes each
    // caller's `mode` a rendered fact a static render test can pin.
    showCountBadge: mode === "multi" && value.length >= 1,
    activeDescendantId: resolveActiveDescendantId(filtered, highlighted, listboxId, createRowVisible),
    enter: resolveCreateEnterAction(ui.open, highlighted, filtered.length, createRowVisible),
  };
}

/** Fallback wording when a caller opts into `onCreate` without supplying
 * `createLabel`. */
function defaultCreateLabel(query: string): string {
  return `Add '${query}'`;
}

/**
 * Searchable multi-select combobox: type to filter options, click (or Enter) to
 * toggle them, selected options render as removable chips. Reuses the token
 * classes from `Input`/`Select` so it looks native in both themes.
 *
 * What happens after a pick is `mode`'s business, decided once in
 * `resolveSelectOutcome` and obeyed by both selection routes — see there.
 */
export function MultiCombobox({
  options,
  value,
  onChange,
  placeholder = "Search…",
  disabled = false,
  id,
  emptyMessage = "No matches",
  onCreate,
  createLabel,
  mode = "multi",
}: MultiComboboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listboxId = `${inputId}-listbox`;
  const countBadgeId = `${inputId}-count`;

  // One state object, moved only by the pure transitions above — see
  // `ComboboxUiState`.
  const [ui, setUi] = useState<ComboboxUiState>(CLOSED_COMBOBOX_UI);
  const { query, open } = ui;
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Everything the render and the keyboard handler need, derived once, purely
  // — the component itself never recomputes a filtered list, a row count, a
  // highlight or an Enter decision. See `deriveComboboxView`.
  const view = useMemo(
    () => deriveComboboxView({ options, value, ui, mode, hasCreate: Boolean(onCreate), listboxId }),
    [options, value, ui, mode, onCreate, listboxId],
  );
  const { filtered, createRowVisible, rows, highlighted: effectiveHighlighted, showCountBadge } = view;
  const selectedOptions = useMemo(
    () => value.map((v) => options.find((o) => o.value === v)).filter((o): o is MultiComboboxOption => Boolean(o)),
    [value, options],
  );

  // Click-outside closes the dropdown.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setUi(applyClose);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  /**
   * Choosing an option from the list, by click or by Enter — the single
   * selection route, and the only caller of `applySelectOutcome`. The pure
   * pair decides everything: `resolveSelectOutcome` what should happen,
   * `applySelectOutcome` what the menu state becomes. Nothing is applied field
   * by field here, so a handler can no longer obey part of the decision.
   *
   * Focus is the one effect that can't live in state: a click's mousedown was
   * prevented so focus never left the input, and this refocus is the
   * belt-and-braces that keeps typing going if the tap did steal it anyway.
   */
  function commitSelection(option: MultiComboboxOption, via: "click" | "enter") {
    const outcome = resolveSelectOutcome(mode, via);
    onChange(toggleValue(value, option.value));
    setUi((prev) => applySelectOutcome(prev, outcome));
    if (outcome.keepFocus && via === "click") inputRef.current?.focus();
  }

  /** Hands the trimmed query to the owner and closes the menu, so whatever
   * it opens (a sheet, a page) isn't fighting an open listbox for the
   * screen. The query itself is left alone — the owner is about to use it. */
  function startCreate() {
    setUi(applyClose);
    onCreate?.(query.trim());
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setUi((prev) => applyArrow(prev, 1, rows));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setUi((prev) => applyArrow(prev, -1, rows));
    } else if (event.key === "Enter") {
      // Verbatim pass-through of the pure decision `deriveComboboxView`
      // already made: obey all three fields, do nothing else, so the cycle-1
      // "prevent only when highlighted >= 0" regression can't creep back in
      // unnoticed — and so Enter on the create row never reaches the
      // surrounding form's submit (item 180).
      const { prevent, toggleIndex, create } = view.enter;
      if (prevent) event.preventDefault();
      if (toggleIndex !== null) {
        commitSelection(filtered[toggleIndex]!, "enter");
      }
      if (create) startCreate();
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setUi(applyClose);
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
            setUi(applyOpen);
          }}
          className={`flex min-h-11 w-full items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 transition-colors duration-[var(--duration-fast)] focus-within:border-[var(--color-accent)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--color-accent)] ${
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
            {...getInputAriaProps({ open, listboxId, activeDescendantId: view.activeDescendantId })}
            {...(showCountBadge ? { "aria-describedby": countBadgeId } : {})}
            autoComplete="off"
            data-no-focus-ring=""
            disabled={disabled}
            value={query}
            placeholder={selectedOptions.length === 0 ? placeholder : undefined}
            onFocus={() => setUi(applyOpen)}
            // `applyQuery` also clears any explicit arrow/hover highlight, so
            // `resolveEffectiveHighlight` re-lands on the FIRST match of the
            // new filtered list — otherwise a stale index from before the
            // query changed could survive and Enter would toggle the wrong
            // option (item 14).
            onChange={(event) => {
              const next = event.target.value;
              setUi((prev) => applyQuery(prev, next));
            }}
            onKeyDown={handleKeyDown}
            className="min-w-0 flex-1 border-none bg-transparent px-1 py-2 text-base text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] disabled:cursor-not-allowed"
          />
          {showCountBadge && (
            <span
              id={countBadgeId}
              className="pointer-events-none shrink-0 rounded-[var(--radius-pill)] bg-[var(--color-primary-soft)] px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-[var(--color-primary-soft-text)]"
            >
              {value.length} selected
            </span>
          )}
          <MultiComboboxChevronButton
            open={open}
            disabled={disabled}
            onToggle={() => {
              if (open) {
                setUi(applyClose);
                // Release focus on collapse: the chevron's mousedown guard
                // kept focus on the input, so without this blur a follow-up
                // tap on the input would not refire onFocus and the menu
                // could never reopen from a tap.
                inputRef.current?.blur();
              } else {
                inputRef.current?.focus();
                setUi(applyOpen);
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
            multiselectable={mode === "multi"}
            onHoverOption={(index) => setUi((prev) => applyHighlight(prev, index))}
            onSelectOption={(option) => commitSelection(option, "click")}
            createRow={
              createRowVisible
                ? { label: (createLabel ?? defaultCreateLabel)(query.trim()), onSelect: startCreate }
                : undefined
            }
            // Close only — selection and query are left exactly as they are.
            onDone={() => setUi(applyClose)}
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
                  // The bare selection change, with no menu/query side
                  // effects: removing a chip is not "choosing an option", so
                  // it must never clear the query or close the menu. Inline
                  // rather than a shared `toggleOption` helper — a named one
                  // was what the option row and the Enter branch got wired to
                  // by mistake in the first place.
                  onChange(toggleValue(value, option.value));
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
