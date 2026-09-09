import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { PantryItem } from "@blw/shared";
import { CelebrationProvider } from "../../../components/ui/Celebration.js";
import { SheetPanel } from "../../../components/ui/Sheet.js";
import { buildServeInput, ServeAction, ServeControl, ServeSheet } from "./ServeSheet.js";

const BASE_ITEM: PantryItem = {
  id: "11111111-1111-1111-1111-111111111111",
  label: null,
  foodSlug: "avocado",
  foodName: "Avocado",
  recipeId: null,
  recipeTitle: null,
  preparedAt: "2026-08-20T10:00:00.000Z",
  location: "fridge",
  status: "active",
  statusChangedAt: "2026-08-20T10:00:00.000Z",
  expiresAt: "2026-08-23T10:00:00.000Z",
  useSoon: false,
  expired: false,
  quantityNote: null,
  servingsTotal: null,
  servingsLeft: null,
  bestBy: null,
  notes: null,
};

function render(element: ReturnType<typeof createElement>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(CelebrationProvider, null, createElement(MemoryRouter, null, element)),
    ),
  );
}

describe("buildServeInput (item 108)", () => {
  it("passes babyId and servings through and trims both notes to null when blank", () => {
    expect(buildServeInput("baby-1", 3, "  ", "")).toEqual({
      babyId: "baby-1",
      servings: 3,
      reactionNote: null,
      notes: null,
    });
  });

  it("keeps trimmed note text", () => {
    expect(buildServeInput("baby-1", 1, " mild rash ", " froze the rest ")).toEqual({
      babyId: "baby-1",
      servings: 1,
      reactionNote: "mild rash",
      notes: "froze the rest",
    });
  });
});

describe("ServeControl — the serve sheet's body (item 263)", () => {
  const html = render(createElement(ServeControl, { item: BASE_ITEM, babyId: "baby-1" }));

  it("opens straight onto the stepper: no inner Serve/Confirm two-step any more", () => {
    expect(html).toContain('aria-label="Servings"');
    expect(html).toContain('aria-label="Decrease servings"');
    expect(html).toContain('aria-label="Increase servings"');
    // The old collapsed→confirming fork is gone with the inline row.
    expect(html).not.toContain(">Confirm<");
  });

  it("shows both note fields inline — the '+ Add a note' toggle is gone", () => {
    expect(html).not.toContain("Add a note");
    expect(html).toContain("Reaction note (optional)");
    expect(html).toContain("Note (optional)");
    expect((html.match(/<textarea/g) ?? []).length).toBe(2);
  });

  it("puts the notes ABOVE a single primary Serve button, with no Cancel", () => {
    expect(html).toContain(">Serve<");
    expect(html.lastIndexOf("<textarea")).toBeLessThan(html.indexOf(">Serve<"));
    expect(html).not.toContain(">Cancel<");
    // Stepper (2) + Serve (1) and nothing else.
    expect((html.match(/<button/g) ?? []).length).toBe(3);
  });

  it("keeps every control at the 44px tap target", () => {
    expect((html.match(/h-11 w-11/g) ?? []).length).toBe(2);
  });
});

describe("ServeSheet (item 263)", () => {
  it("renders nothing while closed", () => {
    const html = render(
      createElement(ServeSheet, { item: BASE_ITEM, babyId: "baby-1", open: false, onClose: () => {} }),
    );
    expect(html).not.toContain('role="dialog"');
  });

  // The open sheet portals into `document.body`, which the node test env
  // doesn't have — so the wiring is read off the element ServeSheet returns
  // (the `BackButton` history tests use the same plain-call idiom), and the
  // markup it produces is pinned through `SheetPanel` below.
  it("titles itself 'Serve <item>' and asks for the header X", () => {
    const element = ServeSheet({ item: BASE_ITEM, babyId: "baby-1", open: true, onClose: () => {} }) as ReactElement<{
      title: string;
      showClose: boolean;
      open: boolean;
    }>;
    expect(element.props.title).toBe("Serve Avocado");
    expect(element.props.showClose).toBe(true);
    expect(element.props.open).toBe(true);
  });

  it("puts the sheet's close X at the LEFT of its header row, before the title", () => {
    const html = renderToString(
      createElement(SheetPanel, { title: "Serve Avocado", showClose: true, onClose: () => {}, children: "body" }),
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Serve Avocado"');
    expect(html).toContain("Serve Avocado</h2>");
    expect(html).toContain('aria-label="Close"');
    expect(html.indexOf('aria-label="Close"')).toBeLessThan(html.indexOf("</h2>"));
    // Same 44px footprint pages give their header chevron/X (item 258/260).
    expect(html).toMatch(/aria-label="Close"[^>]*class="[^"]*h-11 w-11/);
  });

  it("leaves every other sheet's header untouched (showClose is opt-in)", () => {
    const html = renderToString(createElement(SheetPanel, { title: "Time", onClose: () => {}, children: "body" }));
    expect(html).toContain("Time</h2>");
    expect(html).not.toContain('aria-label="Close"');
  });
});

describe("ServeAction — the detail page's Serve button (item 263)", () => {
  it("renders a Serve button with its sheet closed", () => {
    const html = render(createElement(ServeAction, { item: BASE_ITEM, babyId: "baby-1" }));
    expect(html).toContain(">Serve<");
    expect(html).not.toContain('role="dialog"');
  });
});
