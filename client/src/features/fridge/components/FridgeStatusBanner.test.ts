import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FridgeStatusBanner } from "./FridgeStatusBanner.js";

describe("FridgeStatusBanner (item 147, shared undo UI)", () => {
  it("renders the change label and an Undo control", () => {
    const html = renderToString(
      createElement(FridgeStatusBanner, {
        change: { id: "1", title: "Avocado", from: "active", to: "discarded" },
        onUndo: () => {},
      }),
    );
    expect(html).toContain("Marked discarded: Avocado");
    expect(html).toContain(">Undo<");
  });
});
