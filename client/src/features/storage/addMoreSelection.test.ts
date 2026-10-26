// Ledger 878: Add more opens with the plate ticked, and Done applies only the
// difference. Pure data, so it runs as plain unit tests. (What opens ticked
// and how Done lands on the plate: features/plate/plate.test.ts.)
import { describe, expect, it } from "vitest";
import { addMoreCanApply, addMoreDiff, addMoreNeedsContainer, type AddMoreIds } from "./addMoreSelection.js";

const TUB = "11111111-1111-1111-1111-111111111111";
const SALMON = "22222222-2222-2222-2222-222222222222";
const PEAR = "33333333-3333-3333-3333-333333333333";
const serving: AddMoreIds = { itemIds: [TUB, SALMON], recipeIds: ["r-dal"], foodIds: ["food-banana"] };

describe("addMoreDiff / addMoreCanApply — Done's state", () => {
  it("needs a container exactly when none is ticked (ledger 878b)", () => {
    expect(addMoreNeedsContainer(serving)).toBe(false);
    expect(addMoreNeedsContainer({ ...serving, itemIds: [] })).toBe(true);
  });

  it("is disabled with the ticks as opened, or ticked back the same in another order", () => {
    for (const requireContainer of [true, false]) {
      expect(addMoreCanApply(serving, serving, requireContainer)).toBe(false);
      expect(addMoreCanApply(serving, { ...serving, itemIds: [SALMON, TUB] }, requireContainer)).toBe(false);
    }
  });

  it("splits the change into new ticks and ticks taken off", () => {
    const ticks = { itemIds: [TUB, PEAR], recipeIds: [], foodIds: ["food-banana", "food-oats"] };
    expect(addMoreDiff(serving, ticks)).toEqual({
      added: { itemIds: [PEAR], recipeIds: [], foodIds: ["food-oats"] },
      removed: { itemIds: [SALMON], recipeIds: ["r-dal"], foodIds: [] },
    });
    expect(addMoreCanApply(serving, ticks, true)).toBe(true);
  });

  it("on Serve stays disabled with no container ticked; Log meal and Edit need none", () => {
    expect(addMoreCanApply(serving, { ...serving, itemIds: [] }, true)).toBe(false);
    expect(addMoreCanApply(serving, { ...serving, itemIds: [] }, false)).toBe(true);
    // An empty plate on Log meal: the first pick may be anything.
    const empty = { itemIds: [], recipeIds: [], foodIds: [] };
    expect(addMoreCanApply(empty, { ...empty, foodIds: ["food-banana"] }, false)).toBe(true);
  });
});
