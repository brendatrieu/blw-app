import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { BackButton } from "./BackButton.js";
import { CloseButton } from "./CloseButton.js";
import { PageHeader, resolveHeaderAffordance } from "./PageHeader.js";

function render(props: Parameters<typeof PageHeader>[0]) {
  return renderToString(createElement(MemoryRouter, null, createElement(PageHeader, props)));
}

describe("resolveHeaderAffordance (item 258)", () => {
  it("gives a drilled-into page the back chevron", () => {
    expect(resolveHeaderAffordance({ drilledInto: true })).toBe("back");
  });

  it("gives a page opened as a task the close X", () => {
    expect(resolveHeaderAffordance({ openedAsTask: true })).toBe("close");
  });

  it("gives a tab root neither", () => {
    expect(resolveHeaderAffordance({})).toBe("none");
  });

  // The whole point of the helper: "no page shows both a chevron and an X".
  it("never returns both — a page claiming to be drilled into AND a task gets the X", () => {
    expect(resolveHeaderAffordance({ drilledInto: true, openedAsTask: true })).toBe("close");
  });
});

describe("PageHeader leading slot (items 258/260)", () => {
  it("renders the leading affordance inside the header row, before the h1", () => {
    const html = render({ title: "Edit food", leading: createElement(BackButton, { fallback: "/foods" }) });
    expect(html).toContain('<span class="sr-only">Back</span>');
    // Before the title closes = on the h1's own row, not a line above it.
    expect(html.indexOf('<span class="sr-only">Back</span>')).toBeLessThan(html.indexOf("</h1>"));
    expect(html).toContain("Edit food</h1>");
  });

  it("shows no visible 'Back' text — only the chevron glyph and sr-only label", () => {
    const html = render({ title: "Edit food", leading: createElement(BackButton, { fallback: "/foods" }) });
    const visibleText = html.replace(/<span class="sr-only">[^<]*<\/span>/g, "").replace(/<[^>]+>/g, "").trim();
    expect(visibleText).toBe("Edit food");
  });

  it("puts a CloseButton in the same slot at the same 44px footprint, and no chevron with it", () => {
    const html = render({ title: "Add recipe", leading: createElement(CloseButton, { fallback: "/recipes" }) });
    expect(html).toContain('aria-label="Close"');
    expect(html.indexOf('aria-label="Close"')).toBeLessThan(html.indexOf("</h1>"));
    expect(html).toMatch(/class="[^"]*h-11 w-11/);
    expect(html).not.toContain('<span class="sr-only">Back</span>');
  });

  it("keeps `action` on the right for page actions, alongside a leading chevron", () => {
    const html = render({
      title: "Food log",
      leading: createElement(BackButton, { fallback: "/" }),
      action: createElement("button", { type: "button" }, "Log meal"),
    });
    // Leading first, title, then the action — one row, two distinct slots.
    expect(html.indexOf('<span class="sr-only">Back</span>')).toBeLessThan(html.indexOf("</h1>"));
    expect(html.indexOf("</h1>")).toBeLessThan(html.indexOf(">Log meal<"));
  });

  it("nests nothing interactive inside the h1", () => {
    const html = render({ title: "Edit food", leading: createElement(BackButton, { fallback: "/foods" }) });
    const heading = html.slice(html.indexOf("<h1"), html.indexOf("</h1>"));
    expect(heading).not.toContain("<button");
    expect(heading).not.toContain("<a ");
  });

  it("renders no leading wrapper at all when a page has no way out of its own", () => {
    const html = render({ title: "Fridge", emoji: "🧊" });
    expect(html).not.toContain("<button");
    expect(html).toContain("Fridge</h1>");
  });
});
