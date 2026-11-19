// Ledger 999: the one "Clear search" × (no DOM: markup through
// renderToString, the click handler by calling the button as a function).
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ClearSearchButton, SearchInput } from "./SearchInput.js";

const clearButtons = (html: string) => html.match(/<button[^>]*aria-label="Clear search"[^>]*>/g) ?? [];

describe("SearchInput + ClearSearchButton (ledger 999)", () => {
  it("shows the × only while there is text, a 44px button after a search input", () => {
    const empty = renderToString(createElement(SearchInput, { value: "", onChange: () => {}, onClear: () => {}, "aria-label": "Search foods" }));
    expect(clearButtons(empty)).toEqual([]);
    expect(empty).toMatch(/^<div class="relative[^"]*"><input [^>]*type="search"/);
    expect(empty).not.toContain("pr-11");

    const typed = renderToString(createElement(SearchInput, { value: "avo", onChange: () => {}, onClear: () => {}, className: "shrink-0" }));
    const [button] = clearButtons(typed);
    expect(button).toContain('type="button"');
    expect(button).toMatch(/\bh-11\b/);
    expect(button).toMatch(/\bw-11\b/);
    expect(button).toContain("absolute inset-y-0 right-0 my-auto");
    // Ledger 1016: hover/focus only recolour the glyph (muted -> text); no
    // hover box, no size change, no focus-ring opt-out.
    expect(button).toContain("text-[var(--color-text-muted)]");
    expect(button).toContain("hover:text-[var(--color-text)]");
    expect(button).toContain("focus-visible:text-[var(--color-text)]");
    expect(button).not.toMatch(/hover:(bg|scale|size|h-|w-|p-|ring|shadow)/);
    expect(button).not.toMatch(/focus-visible:(bg|scale|outline-none)|data-no-focus-ring/);
    // The text stops where the × starts (44px of right padding), and the
    // caller's class places the wrapper, not the input.
    expect(typed).toMatch(/<div class="relative shrink-0"><input[^>]*class="[^"]*\bpr-11\b/);
    expect(typed).toContain('value="avo"');
  });

  it("a tap clears, then puts focus straight back on the field; the press never takes focus", () => {
    const calls: string[] = [];
    const inputRef = { current: { focus: () => calls.push("focus") } as unknown as HTMLInputElement };
    const button = ClearSearchButton({ value: "avo", onClear: () => calls.push("clear"), inputRef })!;
    (button.props.onClick as () => void)();
    expect(calls).toEqual(["clear", "focus"]);
    for (const handler of ["onPointerDown", "onMouseDown"]) {
      const event = { preventDefault: vi.fn() };
      (button.props[handler] as (e: unknown) => void)(event);
      expect(event.preventDefault).toHaveBeenCalledOnce();
    }
    expect(ClearSearchButton({ value: "", onClear: () => {}, inputRef })).toBeNull();
    // Only spaces is still text the × can clear.
    expect(ClearSearchButton({ value: " ", onClear: () => {}, inputRef })).not.toBeNull();
  });
});
