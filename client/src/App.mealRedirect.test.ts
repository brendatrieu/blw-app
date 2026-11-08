// Ledger 966: the meal page is retired. An old /meals/:id link (a bookmark,
// a back-button entry) opens that meal's Edit instead. `<Navigate>` only moves
// on an effect, which a server render never runs, so it is swapped for a
// marker that prints where it would go.
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Navigate: ({ to, replace }: { to: string; replace?: boolean }) => `[Navigate ${to}${replace ? " replace" : ""}]`,
}));

import { MemoryRouter, Route, Routes } from "react-router-dom";
import { App, MealPageRedirect } from "./App.js";

function routeElement(node: ReactNode, path: string): ReactElement | undefined {
  if (Array.isArray(node)) return node.map((child) => routeElement(child, path)).find(Boolean);
  if (!isValidElement(node)) return undefined;
  const el = node as ReactElement<{ path?: string; element?: ReactElement; children?: ReactNode }>;
  if (el.props.path === path) return el.props.element;
  return routeElement(el.props.children, path);
}

describe("/meals/:id redirects to the meal's Edit (ledger 966)", () => {
  it("mounts the redirect on the old route", () => {
    expect(routeElement((App as unknown as () => ReactNode)(), "/meals/:id")?.type).toBe(MealPageRedirect);
  });

  it("goes to /log-meal?edit=:id, replacing the old entry", () => {
    const html = renderToString(
      createElement(
        MemoryRouter,
        { initialEntries: ["/meals/6f1c0b1a-0000-4000-8000-000000000001"] },
        createElement(Routes, null, createElement(Route, { path: "/meals/:id", element: createElement(MealPageRedirect) })),
      ),
    );
    expect(html).toBe("[Navigate /log-meal?edit=6f1c0b1a-0000-4000-8000-000000000001 replace]");
  });
});
