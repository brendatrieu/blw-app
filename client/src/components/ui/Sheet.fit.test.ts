// Ledger 1119: a fixedHeight sheet's floor is capped at its fixed box, so the
// pinned Done never lands below the visible area when the box is shorter than
// 100svh (installed iOS since 869). No DOM: hooks replaced, SheetPanel called
// as a function with a stand-in header -> panel -> box chain.
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = { refs: [] as { current: unknown }[], r: 0 };
  return {
    store,
    useRef: (init: unknown) => {
      const i = store.r++;
      if (!(i in store.refs)) store.refs[i] = { current: init };
      return store.refs[i];
    },
    useEffect: (effect: () => void) => void effect(),
  };
});

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRef: h.useRef,
  useEffect: h.useEffect,
}));
vi.mock("../../lib/scrollEdge.js", () => ({ watchScrollEdge: () => () => {} }));

import { fixedMinHeight, SheetPanel } from "./Sheet.js";

function openPanel(fixedHeight: boolean, boxHeight: number) {
  const panel = { style: {} as Record<string, string>, parentElement: { clientHeight: boxHeight } };
  h.store.refs = [{ current: { parentElement: panel } }];
  h.store.r = 0;
  SheetPanel({ fixedHeight, onClose: () => {}, children: null });
  return panel.style;
}

afterEach(() => {
  h.store.refs = [];
  h.store.r = 0;
});

describe("fixedHeight floor (ledger 1119)", () => {
  it("is 85svh or the box less 15svh, whichever is smaller", () => {
    expect(fixedMinHeight(797)).toBe("min(85svh, calc(797px - 15svh))");
    expect(fixedMinHeight(796.6)).toBe("min(85svh, calc(797px - 15svh))");
  });

  it("is written to the panel from its box's height at open", () => {
    expect(openPanel(true, 797).minHeight).toBe("min(85svh, calc(797px - 15svh))");
  });

  it("leaves other sheets and an unmeasured box alone", () => {
    expect(openPanel(false, 797).minHeight).toBeUndefined();
    expect(openPanel(true, 0).minHeight).toBeUndefined();
  });
});
