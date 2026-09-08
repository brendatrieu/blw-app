import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  applyArrow,
  applyClose,
  applyHighlight,
  applyOpen,
  applyQuery,
  applySelectOutcome,
  CLOSED_COMBOBOX_UI,
  filterOptions,
  getActiveDescendantId,
  getChevronLabel,
  getInputAriaProps,
  moveHighlight,
  MultiCombobox,
  MultiComboboxChevronButton,
  MultiComboboxOptionList,
  MultiComboboxPanel,
  optionId,
  createOptionId,
  deriveComboboxView,
  resolveActiveDescendantId,
  resolveCreateEnterAction,
  resolveEffectiveHighlight,
  resolveEnterAction,
  resolveHighlight,
  resolveSelectOutcome,
  resolveSingleSelection,
  rowCount,
  shouldShowCreateRow,
  toggleValue,
  type ComboboxUiState,
  type MultiComboboxOption,
} from "./MultiCombobox.js";

const OPTIONS: MultiComboboxOption[] = [
  { value: "avocado", label: "Avocado", emoji: "🥑" },
  { value: "banana", label: "Banana", emoji: "🍌" },
  { value: "broccoli", label: "Broccoli", emoji: "🥦" },
  { value: "carrot", label: "Carrot", emoji: "🥕" },
];

describe("filterOptions", () => {
  it("returns every option when the query is empty", () => {
    expect(filterOptions(OPTIONS, "")).toEqual(OPTIONS);
  });

  it("returns every option when the query is only whitespace", () => {
    expect(filterOptions(OPTIONS, "   ")).toEqual(OPTIONS);
  });

  it("matches a case-insensitive substring of the label", () => {
    expect(filterOptions(OPTIONS, "ROC")).toEqual([OPTIONS[2]]);
  });

  it("matches a substring anywhere in the label, not just a prefix", () => {
    expect(filterOptions(OPTIONS, "rrot")).toEqual([OPTIONS[3]]);
  });

  it("can match more than one option", () => {
    expect(filterOptions(OPTIONS, "r")).toEqual([OPTIONS[2], OPTIONS[3]]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterOptions(OPTIONS, "zzz")).toEqual([]);
  });
});

describe("toggleValue", () => {
  it("adds a value that isn't selected yet", () => {
    expect(toggleValue(["avocado"], "banana")).toEqual(["avocado", "banana"]);
  });

  it("removes a value that is already selected", () => {
    expect(toggleValue(["avocado", "banana"], "avocado")).toEqual(["banana"]);
  });

  it("appends to an empty selection", () => {
    expect(toggleValue([], "carrot")).toEqual(["carrot"]);
  });

  it("does not mutate the input array", () => {
    const selected = ["avocado"];
    toggleValue(selected, "banana");
    expect(selected).toEqual(["avocado"]);
  });
});

describe("moveHighlight", () => {
  it("moves from nothing highlighted to the first item going down", () => {
    expect(moveHighlight(-1, 1, 4)).toBe(0);
  });

  it("moves from nothing highlighted to the last item going up", () => {
    expect(moveHighlight(-1, -1, 4)).toBe(3);
  });

  it("steps forward within bounds", () => {
    expect(moveHighlight(1, 1, 4)).toBe(2);
  });

  it("steps backward within bounds", () => {
    expect(moveHighlight(2, -1, 4)).toBe(1);
  });

  it("wraps from the last item to the first going down", () => {
    expect(moveHighlight(3, 1, 4)).toBe(0);
  });

  it("wraps from the first item to the last item going up", () => {
    expect(moveHighlight(0, -1, 4)).toBe(3);
  });

  it("returns -1 for an empty list regardless of current position", () => {
    expect(moveHighlight(-1, 1, 0)).toBe(-1);
    expect(moveHighlight(2, -1, 0)).toBe(-1);
  });
});

describe("resolveHighlight", () => {
  it("has nothing highlighted while the listbox is closed, however `current` is set", () => {
    // Note: closed-list Enter passthrough is decided by `resolveEnterAction`'s
    // own `open` guard, not by this function resolving to -1 — see the
    // `resolveEnterAction` "closed" tests below.
    expect(resolveHighlight(0, 4, false)).toBe(-1);
    expect(resolveHighlight(-1, 4, false)).toBe(-1);
  });

  it("has nothing highlighted when the listbox is open but has no matches", () => {
    expect(resolveHighlight(-1, 0, true)).toBe(-1);
  });

  it("auto-highlights the first match so typing a filter then Enter toggles it", () => {
    expect(resolveHighlight(-1, 3, true)).toBe(0);
  });

  it("keeps a highlight that's still valid as the query narrows the list", () => {
    expect(resolveHighlight(2, 3, true)).toBe(2);
  });

  it("falls back to the first item once the previous highlight is out of range", () => {
    expect(resolveHighlight(2, 2, true)).toBe(0);
  });

  it("recovers to the first item immediately after reopening with no prior index", () => {
    // e.g. Escape reset `current` to -1; the very next ArrowDown reopens and
    // should land on index 0, not get wiped back to -1 by a stale effect.
    expect(resolveHighlight(-1, 4, true)).toBe(0);
  });
});

describe("getInputAriaProps", () => {
  it("omits aria-controls and aria-activedescendant while closed", () => {
    expect(getInputAriaProps({ open: false, listboxId: "veg-listbox" })).toEqual({
      role: "combobox",
      "aria-expanded": false,
      "aria-autocomplete": "list",
    });
  });

  it("includes aria-controls, pointing at the listbox, while open", () => {
    const props = getInputAriaProps({ open: true, listboxId: "veg-listbox" });
    expect(props).toMatchObject({ role: "combobox", "aria-expanded": true, "aria-autocomplete": "list" });
    expect(props["aria-controls"]).toBe("veg-listbox");
    expect(props["aria-activedescendant"]).toBeUndefined();
  });

  it("includes aria-activedescendant when a descendant id is given, open", () => {
    const props = getInputAriaProps({
      open: true,
      listboxId: "veg-listbox",
      activeDescendantId: "veg-listbox-option-avocado",
    });
    expect(props["aria-activedescendant"]).toBe("veg-listbox-option-avocado");
  });

  it("never emits aria-controls when closed, even if an activeDescendantId is (incorrectly) passed", () => {
    const props = getInputAriaProps({
      open: false,
      listboxId: "veg-listbox",
      activeDescendantId: "veg-listbox-option-avocado",
    });
    expect(props["aria-controls"]).toBeUndefined();
  });
});

describe("resolveEnterAction", () => {
  it("closed: never prevents default and never toggles, regardless of highlight", () => {
    expect(resolveEnterAction(false, -1, 4)).toEqual({ prevent: false, toggleIndex: null });
    expect(resolveEnterAction(false, 0, 4)).toEqual({ prevent: false, toggleIndex: null });
  });

  it("open, nothing highlighted (-1): always prevents default, never toggles", () => {
    // This is the cycle-1 regression case: prevent must be true even though
    // toggleIndex is null. A handler that only prevents when highlighted >= 0
    // must fail this assertion.
    expect(resolveEnterAction(true, -1, 4)).toEqual({ prevent: true, toggleIndex: null });
  });

  it("open, highlighted points at a valid filtered item: prevents default and toggles it", () => {
    expect(resolveEnterAction(true, 2, 4)).toEqual({ prevent: true, toggleIndex: 2 });
    expect(resolveEnterAction(true, 0, 1)).toEqual({ prevent: true, toggleIndex: 0 });
  });

  it("open, highlighted out of range (e.g. stale index after the list shrank): prevents default, no toggle", () => {
    expect(resolveEnterAction(true, 4, 4)).toEqual({ prevent: true, toggleIndex: null });
    expect(resolveEnterAction(true, 0, 0)).toEqual({ prevent: true, toggleIndex: null });
  });
});

describe("getChevronLabel", () => {
  it("reads 'Show options' while closed (announces what tapping it will do)", () => {
    expect(getChevronLabel(false)).toBe("Show options");
  });

  it("reads 'Hide options' while open", () => {
    expect(getChevronLabel(true)).toBe("Hide options");
  });
});

describe("optionId / getActiveDescendantId", () => {
  const OPTS: MultiComboboxOption[] = [
    { value: "avocado", label: "Avocado" },
    { value: "banana", label: "Banana" },
  ];

  it("derives a stable id from the listbox id and option value", () => {
    expect(optionId("combo-listbox", OPTS[0]!)).toBe("combo-listbox-option-avocado");
  });

  it("points at the highlighted option's id", () => {
    expect(getActiveDescendantId(OPTS, 1, "combo-listbox")).toBe(optionId("combo-listbox", OPTS[1]!));
  });

  it("is undefined when nothing is highlighted", () => {
    expect(getActiveDescendantId(OPTS, -1, "combo-listbox")).toBeUndefined();
  });

  it("is undefined when the index is out of range", () => {
    expect(getActiveDescendantId(OPTS, 5, "combo-listbox")).toBeUndefined();
  });
});

describe("MultiCombobox (render)", () => {
  const OPTIONS: MultiComboboxOption[] = [
    { value: "avocado", label: "Avocado", emoji: "🥑" },
    { value: "banana", label: "Banana", emoji: "🍌" },
  ];

  it("renders the input as a closed combobox, with no dangling reference to its (unrendered) listbox", () => {
    const html = renderToString(
      createElement(MultiCombobox, { id: "veg", options: OPTIONS, value: [], onChange: () => {} }),
    );
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    // Closed: the listbox itself isn't rendered at all, so aria-controls
    // must not reference its (nonexistent) id either — see getInputAriaProps.
    expect(html).not.toContain("aria-controls");
    expect(html).not.toContain('role="listbox"');
  });

  it("draws the focus ring on the field wrapper, opting the inner input out of the global rule", () => {
    const html = renderToString(
      createElement(MultiCombobox, { id: "veg", options: OPTIONS, value: [], onChange: () => {} }),
    );
    // The global :focus-visible rule in styles/index.css excludes
    // [data-no-focus-ring]; the wrapper carries the equivalent ring via
    // focus-within so the outline wraps icon + input + count badge as one.
    expect(html).toContain('data-no-focus-ring=""');
    expect(html).toContain("focus-within:outline-2");
    expect(html).toContain("focus-within:outline-offset-2");
    expect(html).toContain("focus-within:outline-[var(--color-accent)]");
  });

  it("renders selected values as chips with their emoji and an accessible, tappable remove button", () => {
    const html = renderToString(
      createElement(MultiCombobox, {
        id: "veg",
        options: OPTIONS,
        value: ["avocado", "banana"],
        onChange: () => {},
      }),
    );
    expect(html).toContain("Avocado");
    expect(html).toContain("🥑");
    expect(html).toContain('aria-label="Remove Avocado"');
    expect(html).toContain('aria-label="Remove Banana"');
    // Visual chip stays 24px (h-6 w-6); the tap target is enlarged via
    // padding + a matching negative margin, not by growing the chip.
    // Scoped to the chip row slice: the field's chevron button carries the
    // same sizing classes, so a whole-document assertion would stay green
    // even if the chip lost its tap target.
    const chipRow = html.slice(html.indexOf("mt-1.5 flex flex-wrap"));
    expect(chipRow).toContain("h-6 w-6");
    expect(chipRow).toContain("p-[10px] -m-[10px]");
  });

  it("omits aria-activedescendant when the combobox is closed", () => {
    const html = renderToString(
      createElement(MultiCombobox, { id: "veg", options: OPTIONS, value: [], onChange: () => {} }),
    );
    expect(html).not.toContain("aria-activedescendant");
  });

  it("omits the count badge and aria-describedby at zero selection", () => {
    const html = renderToString(
      createElement(MultiCombobox, { id: "veg", options: OPTIONS, value: [], onChange: () => {} }),
    );
    expect(html).not.toContain("selected</span>");
    expect(html).not.toContain("aria-describedby");
    expect(html).not.toContain('id="veg-count"');
  });

  it("renders a count badge referenced by the input's aria-describedby once something is selected", () => {
    const html = renderToString(
      createElement(MultiCombobox, {
        id: "veg",
        options: OPTIONS,
        value: ["avocado", "banana"],
        onChange: () => {},
      }),
    );
    expect(html).toContain('id="veg-count"');
    // renderToString interposes a comment node between the interpolated
    // count and the literal text, so match loosely rather than verbatim.
    expect(html).toMatch(/veg-count"[^>]*>2(?:<!--\s*-->)? selected</);
    expect(html).toContain('aria-describedby="veg-count"');
  });

  it("renders the chip row below the field wrapper, inside the component's root container", () => {
    const html = renderToString(
      createElement(MultiCombobox, {
        id: "veg",
        options: OPTIONS,
        value: ["avocado"],
        onChange: () => {},
      }),
    );
    // The field wrapper (icon + input + badge) closes before the chip row
    // opens, so the chip row's own wrapping div comes after it in the markup.
    const fieldEnd = html.indexOf("veg-count");
    const chipRowStart = html.indexOf("mt-1.5 flex flex-wrap");
    expect(fieldEnd).toBeGreaterThan(-1);
    expect(chipRowStart).toBeGreaterThan(fieldEnd);
    expect(html).toContain('aria-label="Remove Avocado"');
  });

  it("omits the chip row entirely at zero selection", () => {
    const html = renderToString(
      createElement(MultiCombobox, { id: "veg", options: OPTIONS, value: [], onChange: () => {} }),
    );
    expect(html).not.toContain("mt-1.5 flex flex-wrap");
  });

  it("renders the chevron toggle button in the closed field, after the count badge, with the closed aria-label", () => {
    const html = renderToString(
      createElement(MultiCombobox, {
        id: "veg",
        options: OPTIONS,
        value: ["avocado"],
        onChange: () => {},
      }),
    );
    expect(html).toContain('aria-label="Show options"');
    // Per the APG combobox pattern only the input announces expanded state;
    // the chevron is a tabIndex=-1 decorative toggle.
    expect((html.match(/aria-expanded="false"/g) ?? []).length).toBe(1);
    // Anchor on the badge's TEXT end, not "veg-count": that id first appears
    // in the input's aria-describedby, well before the badge element itself,
    // which would make this ordering assertion vacuous.
    const badgeEnd = html.indexOf("selected</span>");
    const chevronLabelStart = html.indexOf('aria-label="Show options"');
    expect(badgeEnd).toBeGreaterThan(-1);
    expect(chevronLabelStart).toBeGreaterThan(badgeEnd);
  });
});

describe("MultiComboboxChevronButton (render)", () => {
  it("closed: type=button, out of the Tab order, closed aria-label, no rotation class", () => {
    const html = renderToString(createElement(MultiComboboxChevronButton, { open: false, onToggle: () => {} }));
    expect(html).toContain('type="button"');
    // APG: the input alone carries aria-expanded; the toggle is decorative.
    expect(html).not.toContain("aria-expanded");
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('aria-label="Show options"');
    expect(html).not.toContain("rotate-180");
    // 24px visual, 44px tap target via the padding + negative-margin idiom —
    // asserted here on the standalone button so the check is inherently
    // scoped (cannot be satisfied by some other element's classes).
    expect(html).toContain("h-6 w-6");
    expect(html).toContain("p-[10px] -m-[10px]");
  });

  it("open: open aria-label and the chevron carries the rotation class", () => {
    const html = renderToString(createElement(MultiComboboxChevronButton, { open: true, onToggle: () => {} }));
    expect(html).toContain('aria-label="Hide options"');
    expect(html).toContain("rotate-180");
  });

  it("respects disabled", () => {
    const html = renderToString(
      createElement(MultiComboboxChevronButton, { open: false, disabled: true, onToggle: () => {} }),
    );
    expect(html).toContain("disabled=\"\"");
  });
});

describe("MultiComboboxPanel (render)", () => {
  const OPTIONS: MultiComboboxOption[] = [
    { value: "avocado", label: "Avocado", emoji: "🥑" },
    { value: "banana", label: "Banana", emoji: "🍌" },
  ];

  it("renders the listbox followed by a sticky Done footer button, both inside the panel", () => {
    const html = renderToString(
      createElement(MultiComboboxPanel, {
        listboxId: "veg-listbox",
        options: OPTIONS,
        selectedValues: [],
        highlighted: -1,
        emptyMessage: "No matches",
        onHoverOption: () => {},
        onSelectOption: () => {},
        onDone: () => {},
      }),
    );
    expect(html).toContain('role="listbox"');
    // A multi-select's menu closes ONLY via Done, Escape or a tap outside
    // (item 230) — selecting an option no longer closes it, so this footer is
    // the pointer user's only close affordance and must stay rendered.
    // Done label, deliberately not "Save" (that's reserved for true commits
    // elsewhere in the app) — this button only closes the menu.
    expect(html).toContain(">Done<");
    expect(html).not.toContain(">Save<");
    // A real, non-submitting button spanning the row, min-h-11 tap target.
    const doneButtonMarkup = html.slice(html.indexOf("<button"));
    expect(doneButtonMarkup).toContain('type="button"');
    expect(doneButtonMarkup).toContain("min-h-11");
    // Primary-button treatment: primary fill + the theme-appropriate
    // contrast text token, matching Button.tsx's primary variant.
    expect(doneButtonMarkup).toContain("bg-[var(--color-primary)]");
    expect(doneButtonMarkup).toContain("text-[var(--color-primary-contrast)]");
    // The Done footer comes after the listbox in the markup (sibling below
    // it), not nested inside the scrollable <ul>.
    const listboxEnd = html.indexOf("</ul>");
    const doneStart = html.indexOf(">Done<");
    expect(listboxEnd).toBeGreaterThan(-1);
    expect(doneStart).toBeGreaterThan(listboxEnd);
  });
});

describe("MultiComboboxOptionList (render)", () => {
  const OPTIONS: MultiComboboxOption[] = [
    { value: "avocado", label: "Avocado", emoji: "🥑" },
    { value: "banana", label: "Banana", emoji: "🍌" },
  ];

  it("renders a listbox with option roles, ids, and aria-multiselectable", () => {
    const html = renderToString(
      createElement(MultiComboboxOptionList, {
        listboxId: "veg-listbox",
        options: OPTIONS,
        selectedValues: ["avocado"],
        highlighted: 1,
        emptyMessage: "No matches",
        onHoverOption: () => {},
        onSelectOption: () => {},
      }),
    );
    expect(html).toContain('role="listbox"');
    expect(html).toContain('aria-multiselectable="true"');
    expect(html).toContain('id="veg-listbox"');
    expect((html.match(/role="option"/g) ?? []).length).toBe(2);
    expect(html).toContain(`id="${optionId("veg-listbox", OPTIONS[0]!)}"`);
    expect(html).toContain(`id="${optionId("veg-listbox", OPTIONS[1]!)}"`);
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-selected="false"');
  });

  it("gives a selected (but not highlighted) row a tinted background, with the checkmark still preceding the label", () => {
    const html = renderToString(
      createElement(MultiComboboxOptionList, {
        listboxId: "veg-listbox",
        options: OPTIONS,
        selectedValues: ["avocado"],
        highlighted: 1, // banana is highlighted, avocado (selected) is not
        emptyMessage: "No matches",
        onHoverOption: () => {},
        onSelectOption: () => {},
      }),
    );
    const rows = html.split('role="option"').slice(1);
    const avocadoRow = rows[0]!;
    const bananaRow = rows[1]!;
    // Selected, not highlighted: gets the tint.
    expect(avocadoRow).toContain("bg-[var(--color-primary-soft)]");
    // The check mark (✓) still comes before the label text in the markup.
    expect(avocadoRow.indexOf("✓")).toBeGreaterThan(-1);
    expect(avocadoRow.indexOf("✓")).toBeLessThan(avocadoRow.indexOf("Avocado"));
    // Highlighted (keyboard/hover) still wins its own background and isn't
    // also tinted as selected.
    expect(bananaRow).toContain("bg-[var(--color-bg-inset)]");
    expect(bananaRow).not.toContain("bg-[var(--color-primary-soft)]");
  });

  it("shows the empty message when there are no options", () => {
    const html = renderToString(
      createElement(MultiComboboxOptionList, {
        listboxId: "veg-listbox",
        options: [],
        selectedValues: [],
        highlighted: -1,
        emptyMessage: "No veggies found",
        onHoverOption: () => {},
        onSelectOption: () => {},
      }),
    );
    expect(html).toContain("No veggies found");
    expect(html).not.toContain('role="option"');
  });
});

// ---------------------------------------------------------------------------
// The "add what you typed" row (item 180). Everything here is additive: the
// combobox behaves exactly as before unless a caller passes `onCreate`.
// ---------------------------------------------------------------------------

describe("shouldShowCreateRow", () => {
  it("shows only when a non-blank query matched nothing AND the caller opted in", () => {
    expect(shouldShowCreateRow("kale", 0, true)).toBe(true);
  });

  it("never shows while any option still matches — creating a visible food is a trap", () => {
    expect(shouldShowCreateRow("kale", 1, true)).toBe(false);
  });

  it("never shows on an empty or whitespace-only query (there'd be nothing to name it)", () => {
    expect(shouldShowCreateRow("", 0, true)).toBe(false);
    expect(shouldShowCreateRow("   ", 0, true)).toBe(false);
  });

  it("never shows for a caller that didn't opt in", () => {
    expect(shouldShowCreateRow("kale", 0, false)).toBe(false);
  });
});

describe("rowCount", () => {
  it("counts the create row as a navigable row, so arrows can reach it", () => {
    expect(rowCount(0, true)).toBe(1);
    expect(rowCount(0, false)).toBe(0);
    expect(rowCount(3, false)).toBe(3);
  });
});

describe("resolveCreateEnterAction", () => {
  it("closed: hands Enter back to the surrounding form, exactly like resolveEnterAction", () => {
    expect(resolveCreateEnterAction(false, -1, 0, true)).toEqual({ prevent: false, toggleIndex: null, create: false });
  });

  it("open on the create row: prevents the surrounding form's submit and asks to create", () => {
    // THE item 180 guarantee: pressing Enter here must never also log the
    // meal / add the pantry item the picker is sitting inside.
    expect(resolveCreateEnterAction(true, 0, 0, true)).toEqual({ prevent: true, toggleIndex: null, create: true });
  });

  it("open on a real option: toggles it and never creates, even with a create row configured", () => {
    expect(resolveCreateEnterAction(true, 1, 3, true)).toEqual({ prevent: true, toggleIndex: 1, create: false });
  });

  it("open with no create row visible: identical to resolveEnterAction", () => {
    for (const [highlighted, length] of [
      [-1, 0],
      [-1, 4],
      [2, 4],
      [4, 4],
    ] as const) {
      expect(resolveCreateEnterAction(true, highlighted, length, false)).toEqual({
        ...resolveEnterAction(true, highlighted, length),
        create: false,
      });
    }
  });

  it("open, create row configured but the highlight is nowhere: still prevents, still doesn't create", () => {
    expect(resolveCreateEnterAction(true, -1, 0, true)).toEqual({ prevent: true, toggleIndex: null, create: false });
  });
});

describe("resolveActiveDescendantId", () => {
  it("points at the create row's own id when the highlight sits past the last option", () => {
    expect(resolveActiveDescendantId([], 0, "veg-listbox", true)).toBe(createOptionId("veg-listbox"));
  });

  it("defers to getActiveDescendantId for every real option", () => {
    expect(resolveActiveDescendantId(OPTIONS, 1, "veg-listbox", true)).toBe(optionId("veg-listbox", OPTIONS[1]!));
    expect(resolveActiveDescendantId(OPTIONS, -1, "veg-listbox", true)).toBeUndefined();
    expect(resolveActiveDescendantId([], 0, "veg-listbox", false)).toBeUndefined();
  });
});

describe("MultiComboboxOptionList (create row)", () => {
  const createRow = { label: "Add 'Kale chips' as a custom food", onSelect: () => {} };

  it("replaces the empty message with the create row, as a real option row", () => {
    const html = renderToString(
      createElement(MultiComboboxOptionList, {
        listboxId: "veg-listbox",
        options: [],
        selectedValues: [],
        highlighted: 0,
        emptyMessage: "No matches",
        onHoverOption: () => {},
        onSelectOption: () => {},
        createRow,
      }),
    );
    expect(html).not.toContain("No matches");
    expect(html).toContain(`id="${createOptionId("veg-listbox")}"`);
    expect((html.match(/role="option"/g) ?? []).length).toBe(1);
    // An action, never a selected value.
    expect(html).toContain('aria-selected="false"');
    expect(html).toContain("Add &#x27;Kale chips&#x27; as a custom food");
    // Highlighted at index 0 (= options.length) — same background treatment
    // as any other highlighted row, and the same 44px row height.
    expect(html).toContain("bg-[var(--color-bg-inset)]");
    expect(html).toContain("min-h-11");
  });

  it("renders no create row when the caller passes none (the empty message stands)", () => {
    const html = renderToString(
      createElement(MultiComboboxOptionList, {
        listboxId: "veg-listbox",
        options: [],
        selectedValues: [],
        highlighted: -1,
        emptyMessage: "No matches",
        onHoverOption: () => {},
        onSelectOption: () => {},
      }),
    );
    expect(html).toContain("No matches");
    expect(html).not.toContain(createOptionId("veg-listbox"));
  });

  it("sits after every matching option when one is somehow shown alongside them", () => {
    const html = renderToString(
      createElement(MultiComboboxOptionList, {
        listboxId: "veg-listbox",
        options: OPTIONS.slice(0, 2),
        selectedValues: [],
        highlighted: -1,
        emptyMessage: "No matches",
        onHoverOption: () => {},
        onSelectOption: () => {},
        createRow,
      }),
    );
    expect(html.indexOf(createOptionId("veg-listbox"))).toBeGreaterThan(html.indexOf("Banana"));
  });
});

describe("resolveSelectOutcome (item 230)", () => {
  // The typed query has done its job the moment a pick lands — in every mode,
  // by either route. This is the half of the bug report that said the search
  // text stayed behind after choosing a food.
  it("always clears the typed query, in both modes and by both routes", () => {
    for (const mode of ["multi", "single"] as const) {
      for (const via of ["click", "enter"] as const) {
        expect(resolveSelectOutcome(mode, via).clearQuery).toBe(true);
      }
    }
  });

  it("multi: keeps the menu open and focus in the input so the next food can be typed", () => {
    expect(resolveSelectOutcome("multi", "click")).toEqual({ clearQuery: true, close: false, keepFocus: true });
    expect(resolveSelectOutcome("multi", "enter")).toEqual({ clearQuery: true, close: false, keepFocus: true });
  });

  it("single: closes the menu — one value, one pick, nothing left to do", () => {
    expect(resolveSelectOutcome("single", "click")).toEqual({ clearQuery: true, close: true, keepFocus: false });
    expect(resolveSelectOutcome("single", "enter")).toEqual({ clearQuery: true, close: true, keepFocus: false });
  });

  // The withdrawn earlier idea was "Enter closes, click doesn't". Pinned so a
  // future edit can't quietly reintroduce a split between the two routes.
  it("answers identically for a click and for Enter", () => {
    expect(resolveSelectOutcome("multi", "click")).toEqual(resolveSelectOutcome("multi", "enter"));
    expect(resolveSelectOutcome("single", "click")).toEqual(resolveSelectOutcome("single", "enter"));
  });
});

describe("resolveSingleSelection", () => {
  // The single-select callers (the recipe picker, the "contains ingredient"
  // filter) drive this multi-select through `toggleValue`, which hands back
  // `[current, next]` for a new pick and `[]` for toggling the current one
  // off — so "last wins" and "empty clears" is the whole rule.
  it("takes the newly picked value when a second option is chosen", () => {
    expect(resolveSingleSelection(["recipe-1", "recipe-2"])).toBe("recipe-2");
  });

  it("clears when the current pick was toggled off", () => {
    expect(resolveSingleSelection([])).toBe("");
  });

  it("keeps a lone value as-is", () => {
    expect(resolveSingleSelection(["recipe-1"])).toBe("recipe-1");
  });
});

describe("applySelectOutcome (item 230's decision, carried out)", () => {
  const TYPED: ComboboxUiState = { query: "ban", open: true, highlighted: 2 };

  // Every field of the outcome is obeyed here, so these four assertions are
  // what stops a selection handler from applying two thirds of the decision.
  it("clears the query when the outcome says to, and keeps it when it doesn't", () => {
    expect(applySelectOutcome(TYPED, { clearQuery: true, close: false }).query).toBe("");
    expect(applySelectOutcome(TYPED, { clearQuery: false, close: false }).query).toBe("ban");
  });

  it("closes the menu only when the outcome says to", () => {
    expect(applySelectOutcome(TYPED, { clearQuery: true, close: true }).open).toBe(false);
    expect(applySelectOutcome(TYPED, { clearQuery: true, close: false }).open).toBe(true);
  });

  it("always drops the explicit highlight — the list is about to change shape", () => {
    expect(applySelectOutcome(TYPED, { clearQuery: true, close: false }).highlighted).toBe(-1);
    expect(applySelectOutcome(TYPED, { clearQuery: false, close: true }).highlighted).toBe(-1);
  });

  it("never mutates the state it was given", () => {
    const before = { ...TYPED };
    applySelectOutcome(TYPED, { clearQuery: true, close: true });
    expect(TYPED).toEqual(before);
  });

  // The two mode outcomes, end to end: this is the user-visible half of the
  // bug report ("the typed text stays" / "the menu stays open").
  it("multi: query cleared, menu still open for the next food", () => {
    expect(applySelectOutcome(TYPED, resolveSelectOutcome("multi", "enter"))).toEqual({
      query: "",
      open: true,
      highlighted: -1,
    });
    expect(applySelectOutcome(TYPED, resolveSelectOutcome("multi", "click"))).toEqual({
      query: "",
      open: true,
      highlighted: -1,
    });
  });

  it("single: query cleared and the menu closed", () => {
    expect(applySelectOutcome(TYPED, resolveSelectOutcome("single", "enter"))).toEqual({
      query: "",
      open: false,
      highlighted: -1,
    });
  });
});

describe("the other menu transitions", () => {
  const OPEN_TYPED: ComboboxUiState = { query: "ban", open: true, highlighted: 1 };

  it("starts closed, empty and unhighlighted", () => {
    expect(CLOSED_COMBOBOX_UI).toEqual({ query: "", open: false, highlighted: -1 });
  });

  it("opens without touching the query or the highlight", () => {
    expect(applyOpen({ query: "ban", open: false, highlighted: 1 })).toEqual(OPEN_TYPED);
  });

  // Closing is not discarding: Done / Escape / the chevron leave the typed
  // text exactly where it was.
  it("closes and drops the highlight, keeping the query", () => {
    expect(applyClose(OPEN_TYPED)).toEqual({ query: "ban", open: false, highlighted: -1 });
  });

  it("typing opens the menu and clears any arrow/hover index (item 14)", () => {
    expect(applyQuery(OPEN_TYPED, "car")).toEqual({ query: "car", open: true, highlighted: -1 });
    expect(applyQuery(CLOSED_COMBOBOX_UI, "c")).toEqual({ query: "c", open: true, highlighted: -1 });
  });

  it("hovering a row highlights it", () => {
    expect(applyHighlight(OPEN_TYPED, 2)).toEqual({ query: "ban", open: true, highlighted: 2 });
  });

  it("arrows step the highlight, wrapping, and open a closed menu", () => {
    expect(applyArrow(OPEN_TYPED, 1, 3)).toEqual({ query: "ban", open: true, highlighted: 2 });
    expect(applyArrow({ ...OPEN_TYPED, highlighted: 2 }, 1, 3).highlighted).toBe(0);
    expect(applyArrow(CLOSED_COMBOBOX_UI, 1, 3)).toEqual({ query: "", open: true, highlighted: 0 });
    expect(applyArrow(CLOSED_COMBOBOX_UI, -1, 3).highlighted).toBe(2);
  });
});

describe("resolveEffectiveHighlight (the double-Enter guard)", () => {
  it("auto-lands on the first row only while something has been typed", () => {
    expect(resolveEffectiveHighlight(-1, 3, true, "ban")).toBe(0);
    expect(resolveEffectiveHighlight(-1, 3, true, "")).toBe(-1);
    expect(resolveEffectiveHighlight(-1, 3, true, "   ")).toBe(-1);
  });

  it("honours an index the user arrowed or hovered to, typed query or not", () => {
    expect(resolveEffectiveHighlight(2, 3, true, "")).toBe(2);
    expect(resolveEffectiveHighlight(2, 3, true, "ban")).toBe(2);
  });

  it("highlights nothing when closed, or when there are no rows", () => {
    expect(resolveEffectiveHighlight(2, 3, false, "ban")).toBe(-1);
    expect(resolveEffectiveHighlight(2, 3, false, "")).toBe(-1);
    expect(resolveEffectiveHighlight(-1, 0, true, "zzz")).toBe(-1);
    expect(resolveEffectiveHighlight(-1, 0, true, "")).toBe(-1);
  });

  it("drops a stale index that no longer points at a row", () => {
    expect(resolveEffectiveHighlight(5, 3, true, "")).toBe(-1);
    expect(resolveEffectiveHighlight(5, 3, true, "ban")).toBe(0);
  });
});

// Replaying the keyboard path through the exported helpers, which is as close
// to "press Enter twice" as a DOM-less render test gets: the second Enter must
// add NOTHING. Before this guard it added the first food of the unfiltered
// list — a food the parent never typed or looked at — because the multi
// outcome cleared the query while leaving the menu open.
describe("Enter twice in a row (item 230)", () => {
  function pressEnter(state: ComboboxUiState, selected: string[]) {
    const filtered = filterOptions(OPTIONS, state.query);
    const createVisible = shouldShowCreateRow(state.query, filtered.length, false);
    const highlight = resolveEffectiveHighlight(
      state.highlighted,
      rowCount(filtered.length, createVisible),
      state.open,
      state.query,
    );
    const { prevent, toggleIndex } = resolveCreateEnterAction(state.open, highlight, filtered.length, createVisible);
    if (toggleIndex === null) return { state, selected, prevent, picked: null as string | null };
    const picked = filtered[toggleIndex]!.value;
    return {
      state: applySelectOutcome(state, resolveSelectOutcome("multi", "enter")),
      selected: toggleValue(selected, picked),
      prevent,
      picked,
    };
  }

  it("adds the searched food, then does nothing at all on the second press", () => {
    const first = pressEnter({ query: "ban", open: true, highlighted: -1 }, []);
    expect(first.picked).toBe("banana");
    expect(first.selected).toEqual(["banana"]);
    expect(first.state).toEqual({ query: "", open: true, highlighted: -1 });

    const second = pressEnter(first.state, first.selected);
    expect(second.picked).toBeNull();
    expect(second.selected).toEqual(["banana"]);
    // Still swallowed, so the surrounding form is never submitted by it.
    expect(second.prevent).toBe(true);
    expect(second.state).toEqual(first.state);
  });

  it("still selects on the very first Enter after typing a fresh query", () => {
    const first = pressEnter({ query: "ban", open: true, highlighted: -1 }, []);
    const typedAgain = applyQuery(first.state, "avo");
    expect(pressEnter(typedAgain, first.selected).selected).toEqual(["banana", "avocado"]);
  });
});

describe("MultiCombobox mode is visible in a static render", () => {
  function render(mode: "multi" | "single" | undefined) {
    return renderToString(
      createElement(MultiCombobox, {
        id: "veg",
        options: OPTIONS,
        value: ["avocado"],
        onChange: () => {},
        ...(mode ? { mode } : {}),
      }),
    );
  }

  // "1 selected" next to a field that holds exactly one value is noise — and
  // gating the badge on the mode is what lets each caller's `mode` be pinned
  // by its own render test.
  it("single: no count badge, and no aria-describedby pointing at one", () => {
    const html = render("single");
    expect(html).not.toContain("selected</span>");
    expect(html).not.toContain('aria-describedby="veg-count"');
    expect(html).toContain('aria-label="Remove Avocado"');
  });

  it("multi (and the default): the count badge is there", () => {
    for (const html of [render("multi"), render(undefined)]) {
      expect(html).toMatch(/veg-count"[^>]*>1(?:<!--\s*-->)? selected</);
      expect(html).toContain('aria-describedby="veg-count"');
    }
  });

  it("a single-select listbox does not claim to be multi-selectable", () => {
    const list = (multiselectable: boolean | undefined) =>
      renderToString(
        createElement(MultiComboboxOptionList, {
          listboxId: "veg-listbox",
          options: OPTIONS,
          selectedValues: [],
          highlighted: -1,
          emptyMessage: "No matches",
          onHoverOption: () => {},
          onSelectOption: () => {},
          ...(multiselectable === undefined ? {} : { multiselectable }),
        }),
      );
    expect(list(false)).toContain('aria-multiselectable="false"');
    expect(list(true)).toContain('aria-multiselectable="true"');
    expect(list(undefined)).toContain('aria-multiselectable="true"');
  });
});

// The component reads these fields and derives nothing itself, so this is the
// whole chain from "what is typed" to "what Enter does", pinned in one place.
describe("deriveComboboxView", () => {
  function view(ui: ComboboxUiState, extra: { hasCreate?: boolean; mode?: "multi" | "single"; value?: string[] } = {}) {
    return deriveComboboxView({
      options: OPTIONS,
      value: extra.value ?? [],
      ui,
      mode: extra.mode ?? "multi",
      hasCreate: extra.hasCreate ?? false,
      listboxId: "veg-listbox",
    });
  }

  it("filters by the query and counts the create row as a navigable row", () => {
    expect(view({ query: "ban", open: true, highlighted: -1 }).filtered.map((o) => o.value)).toEqual(["banana"]);
    expect(view({ query: "zzz", open: true, highlighted: -1 }, { hasCreate: true })).toMatchObject({
      createRowVisible: true,
      rows: 1,
    });
    expect(view({ query: "zzz", open: true, highlighted: -1 })).toMatchObject({ createRowVisible: false, rows: 0 });
  });

  it("Enter after typing selects the highlighted match", () => {
    const typed = view({ query: "ban", open: true, highlighted: -1 });
    expect(typed.highlighted).toBe(0);
    expect(typed.enter).toEqual({ prevent: true, toggleIndex: 0, create: false });
    expect(typed.filtered[typed.enter.toggleIndex!]!.value).toBe("banana");
  });

  // The state a multi-select is left in by `applySelectOutcome`: query
  // cleared, menu open. A second Enter must select NOTHING — before this, it
  // silently added the first food of the whole list.
  it("Enter on an open menu with nothing typed selects nothing, and still swallows the key", () => {
    const afterPick = view(applySelectOutcome({ query: "ban", open: true, highlighted: -1 }, resolveSelectOutcome("multi", "enter")));
    expect(afterPick.filtered).toHaveLength(OPTIONS.length);
    expect(afterPick.highlighted).toBe(-1);
    expect(afterPick.enter).toEqual({ prevent: true, toggleIndex: null, create: false });
    expect(afterPick.activeDescendantId).toBeUndefined();
  });

  it("Enter on a closed menu is not ours to handle — the form submits normally", () => {
    expect(view({ query: "ban", open: false, highlighted: -1 }).enter).toEqual({
      prevent: false,
      toggleIndex: null,
      create: false,
    });
  });

  it("Enter on the create row creates instead of selecting", () => {
    const creating = view({ query: "zzz", open: true, highlighted: -1 }, { hasCreate: true });
    expect(creating.enter).toEqual({ prevent: true, toggleIndex: null, create: true });
    expect(creating.activeDescendantId).toBe(createOptionId("veg-listbox"));
  });

  it("names the highlighted row for aria-activedescendant, and nothing while closed", () => {
    expect(view({ query: "ban", open: true, highlighted: -1 }).activeDescendantId).toBe(
      optionId("veg-listbox", { value: "banana", label: "Banana" }),
    );
    expect(view({ query: "ban", open: false, highlighted: 0 }).activeDescendantId).toBeUndefined();
  });

  it("shows the count badge for a non-empty multi-select only", () => {
    const ui = { query: "", open: false, highlighted: -1 };
    expect(view(ui, { value: ["banana"] }).showCountBadge).toBe(true);
    expect(view(ui, { value: [] }).showCountBadge).toBe(false);
    expect(view(ui, { value: ["banana"], mode: "single" }).showCountBadge).toBe(false);
  });
});
