import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  MenuItem,
  MenuLinkItem,
  MenuPanel,
  type MenuItemProps,
  type MenuLinkItemProps,
  type MenuProps,
} from "../../../components/ui/Menu.js";
import { MealActionsMenu } from "./MealActionsMenu.js";

function renderMenu() {
  return renderToString(
    createElement(
      MemoryRouter,
      null,
      createElement(MealActionsMenu, { mealId: "meal-1", onRequestDelete: () => {} }),
    ),
  );
}

/** The panel is only in the DOM once opened, which a node-env render can't
 * click its way to. `Menu` takes its panel content as a render prop, so the
 * real open state is reachable without a DOM: call `MealActionsMenu` and
 * invoke the `Menu` element's own `children(close)` to get the exact rows the
 * component composes — no hand-typed copy of them. */
function openPanelRows(options: { mealId?: string; onRequestDelete?: () => void; close?: () => void } = {}) {
  const { mealId = "meal-1", onRequestDelete = () => {}, close = () => {} } = options;
  const menu = MealActionsMenu({ mealId, onRequestDelete }) as ReactElement<MenuProps>;
  return menu.props.children(close);
}

function renderOpenPanel(mealId = "meal-1") {
  return renderToString(
    createElement(MemoryRouter, null, createElement(MenuPanel, null, openPanelRows({ mealId }))),
  );
}

/** The rows come back as a fragment; flatten it so individual items can be
 * inspected (and their `onSelect` invoked) directly. */
function openPanelItems(options: { onRequestDelete?: () => void; close?: () => void } = {}) {
  const rows = openPanelRows(options) as ReactElement<{ children?: ReactNode }>;
  return Children.toArray(rows.props.children).filter((child): child is ReactElement => isValidElement(child));
}

describe("MealActionsMenu (item 194)", () => {
  it("renders a closed Actions trigger with the same menu ARIA wiring storage rows use", () => {
    const html = renderMenu();
    expect(html).toContain('aria-label="Actions"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="menu"');
  });

  it("keeps the edit href out of the closed markup (nothing to nest inside a card's anchor)", () => {
    expect(renderMenu()).not.toContain("/log-meal?edit=meal-1");
  });

  it("offers Edit as a real link to the meal's edit route and Delete as a menuitem button", () => {
    const html = renderOpenPanel();
    expect(html).toContain('role="menu"');
    expect(html).toMatch(/<a [^>]*role="menuitem"[^>]*href="\/log-meal\?edit=meal-1"/);
    expect(html).toContain("Edit");
    expect(html).toMatch(/<button[^>]*role="menuitem"[^>]*>Delete<\/button>/);
  });

  it("points Edit at the id of the meal it was given, not a fixed route", () => {
    expect(renderOpenPanel("meal-42")).toMatch(
      /<a [^>]*role="menuitem"[^>]*href="\/log-meal\?edit=meal-42"/,
    );
    expect(renderOpenPanel("meal-42")).not.toContain("/meals/meal-42");
  });

  it("composes exactly the two rows Edit (link) then Delete (button), in that order", () => {
    const items = openPanelItems();
    expect(items).toHaveLength(2);
    expect(items[0]?.type).toBe(MenuLinkItem);
    expect((items[0] as ReactElement<MenuLinkItemProps>).props.to).toBe("/log-meal?edit=meal-1");
    expect(items[1]?.type).toBe(MenuItem);
    expect((items[1] as ReactElement<MenuItemProps>).props.children).toBe("Delete");
  });

  it("asks the card to reveal its confirm row when Delete is chosen, and closes the menu", () => {
    let deleteRequests = 0;
    let closes = 0;
    const items = openPanelItems({
      onRequestDelete: () => {
        deleteRequests += 1;
      },
      close: () => {
        closes += 1;
      },
    });
    const deleteItem = items.find((item) => item.type === MenuItem) as ReactElement<MenuItemProps>;
    expect(deleteItem).toBeDefined();

    deleteItem.props.onSelect();

    expect(deleteRequests).toBe(1);
    expect(closes).toBe(1);
  });

  it("closes the menu when Edit is chosen (the link navigates on its own)", () => {
    let closes = 0;
    const items = openPanelItems({
      close: () => {
        closes += 1;
      },
    });
    const editItem = items.find((item) => item.type === MenuLinkItem) as ReactElement<MenuLinkItemProps>;
    editItem.props.onSelect?.();
    expect(closes).toBe(1);
  });
});
