import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DeleteConfirmActions } from "./DeleteConfirmActions.js";

function render(overrides: Partial<Parameters<typeof DeleteConfirmActions>[0]> = {}) {
  return renderToString(
    createElement(DeleteConfirmActions, {
      confirmLabel: "Delete for good",
      pendingLabel: "Deleting…",
      pending: false,
      onConfirm: () => {},
      onKeep: () => {},
      ...overrides,
    }),
  );
}

describe("DeleteConfirmActions (item 257)", () => {
  it("pairs the destructive commit with an icon-only × — never a Cancel or Keep text button", () => {
    const html = render();
    expect(html).toContain(">Delete for good<");
    expect(html).toContain('aria-label="Keep it"');
    expect(html).not.toContain(">Cancel<");
    expect(html).not.toContain(">Keep<");
  });

  it("puts the × after the destructive button, so the commit reads first", () => {
    const html = render();
    expect(html.indexOf(">Delete for good<")).toBeLessThan(html.indexOf('aria-label="Keep it"'));
  });

  it("swaps in the pending label and disables both controls while deleting", () => {
    const html = render({ pending: true });
    expect(html).toContain(">Deleting…<");
    expect(html).not.toContain(">Delete for good<");
    expect((html.match(/disabled=""/g) ?? []).length).toBe(2);
  });

  it("keeps the × at the 44px tap target the design system requires", () => {
    expect(render()).toMatch(/aria-label="Keep it"[^>]*class="[^"]*h-11 w-11/);
  });
});
