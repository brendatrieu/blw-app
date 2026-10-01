// Item 655: with several babies the header chip carries the SAME switcher
// behavior as Home's — picking an option sets the active baby. BabyChip is
// called as a plain function with useActiveBaby mocked, and the select's
// onChange is driven by hand (no DOM).
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ageInMonths, type Baby } from "@blw/shared";

const h = vi.hoisted(() => ({
  setActiveBabyId: vi.fn(),
  babies: [] as unknown[],
  active: null as unknown,
}));

vi.mock("../features/babies/useActiveBaby.js", () => ({
  useActiveBaby: () => ({
    babies: h.babies,
    activeBaby: h.active ?? h.babies[0] ?? null,
    setActiveBabyId: h.setActiveBabyId,
  }),
}));

import { BabyChip } from "./BabyChip.js";

type El = ReactElement<{
  children?: ReactNode;
  onChange?: (e: { target: { value: string } }) => void;
}>;

function findSelect(node: ReactNode): El | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findSelect(child as ReactNode);
      if (hit) return hit;
    }
    return null;
  }
  const el = node as El;
  if (el.type === "select") return el;
  return findSelect(el.props.children);
}

const baby = (id: string, name: string): Baby => ({
  id,
  name,
  birthDate: "2026-01-01",
  notes: null,
  archived: false,
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("BabyChip switcher (item 655)", () => {
  it("sets the picked baby active, and clears to null on an empty value", () => {
    h.babies = [baby("b1", "Remy"), baby("b2", "Ada")];
    const select = findSelect(BabyChip());
    expect(select).not.toBeNull();
    select!.props.onChange!({ target: { value: "b2" } });
    expect(h.setActiveBabyId).toHaveBeenLastCalledWith("b2");
    select!.props.onChange!({ target: { value: "" } });
    expect(h.setActiveBabyId).toHaveBeenLastCalledWith(null);
  });

  it("shows and selects the ACTIVE baby, not just the first one", () => {
    // A different birthday too, so the age must come from the active baby as well.
    const ada = { ...baby("b2", "Ada"), birthDate: "2025-06-01" };
    h.babies = [baby("b1", "Remy"), ada];
    h.active = ada;
    try {
      expect(findSelect(BabyChip())?.props).toMatchObject({ value: "b2" });
      const html = renderToString(createElement(BabyChip));
      expect(html).toContain(
        `>Ada</span><span class="shrink-0 whitespace-pre"> · ${ageInMonths(ada.birthDate)} mo</span>`,
      );
      expect(html).not.toContain(">Remy</span>");
      // The avatar initial is the active baby's too.
      expect(html).toContain(">A</span>");
      expect(html).not.toContain(">R</span>");
      // The invisible select is laid over the whole chip, so tapping the chip opens it.
      expect(html).toMatch(/<select [^>]*class="[^"]*\babsolute inset-0\b[^"]*\bopacity-0\b/);
      // Keyboard focus on the hidden select draws a ring on the visible chip.
      expect(html).toMatch(/<label class="[^"]*has-\[:focus-visible\]:outline-2/);
      expect(html).toMatch(/<option value="b2" selected="">Ada<\/option>/);
      expect(html).not.toMatch(/<option value="b1" selected/);
    } finally {
      h.active = null;
    }
  });

  it("one baby: a static chip with no picker, initial uppercased", () => {
    h.babies = [baby("b1", "remy")];
    expect(findSelect(BabyChip())).toBeNull();
    expect(renderToString(createElement(BabyChip))).toContain(">R</span>");
  });
});
