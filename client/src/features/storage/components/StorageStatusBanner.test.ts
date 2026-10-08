import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { storageStatusChangeLabel } from "../hooks.js";
import { StorageStatusBanner } from "./StorageStatusBanner.js";

describe("StorageStatusBanner (item 147, shared undo UI)", () => {
  it("renders the change label and an Undo control", () => {
    const html = renderToString(
      createElement(StorageStatusBanner, {
        label: storageStatusChangeLabel({ id: "1", title: "Avocado", from: "active", to: "discarded" }),
        onUndo: () => {},
      }),
    );
    expect(html).toContain("Marked discarded: Avocado");
    expect(html).toContain(">Undo<");
  });

  it("carries the serve's label the same way (ledger 760)", () => {
    const html = renderToString(createElement(StorageStatusBanner, { label: "Served: Lentil Patties + 2 more", onUndo: () => {} }));
    expect(html).toContain("<span>Served: Lentil Patties + 2 more</span>");
    expect(html).toContain(">Undo<");
  });

  it("gives Undo a 44px tap target without changing how it looks (VERIFY-3S B3)", () => {
    const html = renderToString(createElement(StorageStatusBanner, { label: "Served: Peas", onUndo: () => {} }));
    // A 20px line + 2 x 12px = 44px tall; the text + 2 x 8px wide.
    expect(html).toMatch(/<button type="button" class="relative [^"]*after:absolute after:-inset-x-2 after:-inset-y-3"[^>]*>Undo</);
  });
});
