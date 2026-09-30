// Item 599: the shared delete question. ConfirmSheet is called as a plain
// function (it holds no hooks) and its Sheet element read; the open panel's
// markup is pinned through SheetPanel, which renders without a portal.
import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfirmSheet } from "./ConfirmSheet.js";
import { Sheet, SheetPanel } from "./Sheet.js";

type Props = Parameters<typeof ConfirmSheet>[0];

function sheet(overrides: Partial<Props> = {}) {
  const confirms: number[] = [];
  const element = ConfirmSheet({
    open: true,
    onClose: () => {},
    title: "Delete this meal?",
    children: "This can't be undone.",
    confirmLabel: "Delete",
    pendingLabel: "Deleting…",
    pending: false,
    onConfirm: () => confirms.push(1),
    ...overrides,
  }) as ReactElement<{ title: string; showClose: boolean; open: boolean; children: unknown }>;
  const html = renderToString(
    createElement(SheetPanel, {
      title: element.props.title,
      showClose: element.props.showClose,
      onClose: () => {},
      children: element.props.children as never,
    }),
  );
  return { element, html, confirms };
}

describe("ConfirmSheet (item 599)", () => {
  it("is a Sheet with the question as its title and a visible × to back out", () => {
    const { element } = sheet();
    expect(element.type).toBe(Sheet);
    expect(element.props.title).toBe("Delete this meal?");
    expect(element.props.showClose).toBe(true);
  });

  it("names the dialog by its question, one muted line, and one right-aligned red-outlined commit (item 607)", () => {
    const { html } = sheet();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Delete this meal?"');
    expect(html).toMatch(/<h2[^>]*>Delete this meal\?<\/h2>/);
    expect(html).toMatch(/text-\[var\(--color-text-muted\)\]">This can(?:&#x27;|')t be undone\.</);
    const commit = html.match(/<button [^>]*>Delete<\/button>/)![0];
    // Red text + border on the sheet surface, not a solid red block; right-aligned, not full-width.
    expect(commit).toContain("text-[var(--color-danger)] ");
    expect(commit).toContain("border-[var(--color-danger)]");
    expect(commit).toContain("bg-[var(--color-bg-elevated)]");
    expect(commit).not.toContain("bg-[var(--color-danger)]");
    expect(commit).not.toContain("w-full");
    expect(commit).toContain("self-end");
    // Quieter, not smaller: still the 44px touch target.
    expect(commit).toContain("min-h-11");
    expect(commit).not.toContain("min-h-9");
    expect(html).toContain('aria-label="Close"');
    expect(html).not.toContain(">Cancel<");
  });

  it("commits only through the red button", () => {
    const { element, confirms } = sheet();
    expect(confirms).toEqual([]);
    const children = element.props.children as ReactElement<{ onClick?: () => void; variant?: string }>[];
    const commit = children.find((child) => child?.props?.variant === "danger-quiet");
    commit!.props.onClick!();
    expect(confirms).toEqual([1]);
  });

  it("shows the pending label, disabled, while in flight", () => {
    const { html } = sheet({ pending: true });
    expect(html).toMatch(/<button [^>]*type="button" disabled="">Deleting…<\/button>/);
  });

  it("announces a failure as an alert", () => {
    const { html } = sheet({ error: "Couldn't delete that — try again." });
    expect(html).toMatch(/role="alert"[^>]*>Couldn(?:&#x27;|')t delete that — try again\.</);
  });

  it("offers no commit until there is an answer (no onConfirm)", () => {
    const { html } = sheet({ onConfirm: undefined as never });
    expect(html).not.toContain(">Delete</button>");
  });
});
