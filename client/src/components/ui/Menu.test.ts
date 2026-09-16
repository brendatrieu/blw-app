import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { getMenuTriggerAriaProps, Menu, MenuItem, MenuLinkItem, MenuPanel } from "./Menu.js";

describe("getMenuTriggerAriaProps", () => {
  it("reports aria-haspopup='menu' and aria-expanded=false when closed", () => {
    expect(getMenuTriggerAriaProps(false)).toEqual({ "aria-haspopup": "menu", "aria-expanded": false });
  });

  it("reports aria-expanded=true when open", () => {
    expect(getMenuTriggerAriaProps(true)).toEqual({ "aria-haspopup": "menu", "aria-expanded": true });
  });
});

describe("Menu (render, closed)", () => {
  it("renders a trigger button with the given aria-label and closed ARIA wiring, and no panel", () => {
    const html = renderToString(
      createElement(Menu, { label: "Actions", children: () => null }),
    );
    expect(html).toContain('aria-label="Actions"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="menu"');
  });

  it("disables the trigger when disabled is set", () => {
    const html = renderToString(createElement(Menu, { label: "Actions", disabled: true, children: () => null }));
    expect(html).toMatch(/<button[^>]*aria-label="Actions"[^>]*disabled/);
  });
});

describe("MenuPanel (render, standalone open state)", () => {
  it("renders a role=menu container with its children", () => {
    const html = renderToString(
      createElement(MenuPanel, {
        id: "test-menu",
        children: createElement(MenuItem, { onSelect: () => {}, children: "Serve" }),
      }),
    );
    expect(html).toContain('role="menu"');
    expect(html).toContain('id="test-menu"');
    expect(html).toContain(">Serve<");
  });

  it("opens downward by default", () => {
    const html = renderToString(createElement(MenuPanel, { children: null }));
    expect(html).toContain("top-full");
    expect(html).not.toContain("bottom-full");
  });

  it("opens upward when placement is 'up' (no room below the trigger)", () => {
    const html = renderToString(createElement(MenuPanel, { placement: "up", children: null }));
    expect(html).toContain("bottom-full");
    expect(html).not.toContain("top-full");
  });
});

describe("MenuItem (render)", () => {
  it("renders as a role=menuitem button", () => {
    const html = renderToString(createElement(MenuItem, { onSelect: () => {}, children: "Mark finished" }));
    expect(html).toMatch(/<button[^>]*role="menuitem"[^>]*>Mark finished<\/button>/);
  });

  it("respects disabled", () => {
    const html = renderToString(createElement(MenuItem, { onSelect: () => {}, disabled: true, children: "Serve" }));
    expect(html).toMatch(/<button[^>]*role="menuitem"[^>]*disabled/);
  });
});

describe("MenuLinkItem (render)", () => {
  it("renders as a role=menuitem link to the given href", () => {
    const html = renderToString(
      createElement(MemoryRouter, null, createElement(MenuLinkItem, { to: "/storage/item-1/edit" }, "Edit")),
    );
    expect(html).toContain('role="menuitem"');
    expect(html).toContain('href="/storage/item-1/edit"');
    expect(html).toContain(">Edit<");
  });
});
