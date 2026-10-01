// X28 guard: the other slot tests mock this module, so pin the real hook —
// it must read the value AppLayout provides, or Back/X fall back into the page body.
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeaderSlotContext, useHeaderSlot } from "./headerSlot.js";

describe("useHeaderSlot (item 654)", () => {
  it("returns the element provided by HeaderSlotContext, and null without a provider", () => {
    const seen: unknown[] = [];
    function Probe() {
      seen.push(useHeaderSlot());
      return null;
    }
    const sentinel = { id: "slot" } as unknown as HTMLElement;
    renderToString(
      createElement(HeaderSlotContext.Provider, { value: sentinel }, createElement(Probe)),
    );
    renderToString(createElement(Probe));
    expect(seen).toEqual([sentinel, null]);
  });
});
