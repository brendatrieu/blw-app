// Items 599, 610: the shared delete question, a centred pop-up. ConfirmDialog
// is called as a plain function (it holds no hooks) and its Dialog element
// read; the open card's markup is pinned through DialogPanel, which renders
// without a portal.
import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { Dialog, DialogPanel } from "./Dialog.js";

type Props = Parameters<typeof ConfirmDialog>[0];
type Child = ReactElement<{ onClick?: () => void; variant?: string; children?: unknown }>;

function question(overrides: Partial<Props> = {}) {
  const events: string[] = [];
  const element = ConfirmDialog({
    open: true,
    onClose: () => events.push("closed"),
    title: "Delete this meal?",
    children: "This can't be undone.",
    confirmLabel: "Delete",
    pendingLabel: "Deleting…",
    pending: false,
    onConfirm: () => events.push("confirmed"),
    ...overrides,
  }) as ReactElement<{ ariaLabel: string; open: boolean; onClose: () => void; children: unknown }>;
  const html = renderToString(
    createElement(DialogPanel, { ariaLabel: element.props.ariaLabel, children: element.props.children as never }),
  );
  // The button row is the last child; its buttons in order.
  const children = element.props.children as (Child | null)[];
  const row = children[children.length - 1] as ReactElement<{ children: (Child | null)[] }>;
  const buttons = row.props.children.filter(Boolean) as Child[];
  return { element, html, events, buttons };
}

describe("ConfirmDialog (items 599, 610)", () => {
  it("is a centred Dialog named by its question", () => {
    const { element } = question();
    expect(element.type).toBe(Dialog);
    expect(element.props.ariaLabel).toBe("Delete this meal?");
  });

  it("shows the question as the heading, one muted line close under it, then Cancel before the quiet red Delete — both 44px, no ×", () => {
    const { html } = question();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Delete this meal?"');
    expect(html).toMatch(/<h2[^>]*>Delete this meal\?<\/h2>/);
    // ~30% of the sheet's 22.7px gap (item 610): 6px.
    expect(html).toMatch(/class="mt-1\.5 [^"]*text-\[var\(--color-text-muted\)\]">This can(?:&#x27;|')t be undone\.</);
    const cancel = html.match(/<button [^>]*>Cancel<\/button>/)![0];
    const commit = html.match(/<button [^>]*>Delete<\/button>/)![0];
    expect(html.indexOf(cancel)).toBeLessThan(html.indexOf(commit));
    // Cancel is the secondary button; Delete is red text + border, not a red block.
    expect(cancel).toContain("border-[var(--color-border)]");
    expect(cancel).not.toContain("--color-danger");
    expect(commit).toContain("text-[var(--color-danger)] ");
    expect(commit).toContain("border-[var(--color-danger)]");
    expect(commit).not.toContain("bg-[var(--color-danger)]");
    for (const button of [cancel, commit]) {
      expect(button).toContain("min-h-11");
      expect(button).not.toContain("min-h-9");
    }
    expect(html).not.toContain('aria-label="Close"');
  });

  it("commits only through Delete; Cancel only closes", () => {
    const { buttons, events } = question();
    expect(buttons.map((button) => button.props.variant)).toEqual(["secondary", "danger-quiet"]);
    buttons[0]!.props.onClick!();
    expect(events).toEqual(["closed"]);
    buttons[1]!.props.onClick!();
    expect(events).toEqual(["closed", "confirmed"]);
  });

  it("backs out on an overlay tap or Escape: the Dialog's onClose is the caller's close, never the commit", () => {
    const { element, events } = question();
    element.props.onClose();
    expect(events).toEqual(["closed"]);
  });

  it("shows the pending label, disabled, while in flight", () => {
    const { html } = question({ pending: true });
    expect(html).toMatch(/<button [^>]*type="button" disabled="">Deleting…<\/button>/);
  });

  it("announces a failure as an alert", () => {
    const { html } = question({ error: "Couldn't delete that — try again." });
    expect(html).toMatch(/role="alert"[^>]*>Couldn(?:&#x27;|')t delete that — try again\.</);
  });

  it("offers only Cancel until there is an answer (no onConfirm)", () => {
    const { html } = question({ onConfirm: undefined as never });
    expect(html).not.toContain(">Delete</button>");
    expect(html).toContain(">Cancel</button>");
  });
});
