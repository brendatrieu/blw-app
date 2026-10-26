// Log meal's "Save leftovers to storage" as data (items 152-153, 348; ledger
// 759), moved here with the code from LogFoodForm (ledger 902).
import { describe, expect, it } from "vitest";
import { buildLeftoverStorageInput, resolveLeftoverSource, type LeftoverSourceKind } from "./leftovers.js";

describe("resolveLeftoverSource", () => {
  it("resolves to the recipe when one is selected, regardless of how many foods are also selected", () => {
    expect(resolveLeftoverSource(["recipe-1"], ["food-1", "food-2", "food-3"])).toEqual({
      kind: "recipe",
      recipeIds: ["recipe-1"],
    });
  });

  it("resolves to the single food when no recipe is selected and exactly one food is", () => {
    expect(resolveLeftoverSource([], ["food-1"])).toEqual({ kind: "foods", foodIds: ["food-1"] });
  });

  // Item 348: several foods are no longer a question to answer — they are
  // the container. The old "choose" branch (and the select behind it) is gone.
  it("resolves to EVERY selected food when no recipe is selected and several are", () => {
    expect(resolveLeftoverSource([], ["food-1", "food-2", "food-3"])).toEqual({
      kind: "foods",
      foodIds: ["food-1", "food-2", "food-3"],
    });
  });

  it("keeps the foods in the order they were picked", () => {
    const result = resolveLeftoverSource([], ["food-3", "food-1", "food-2"]);
    expect(result).toEqual({ kind: "foods", foodIds: ["food-3", "food-1", "food-2"] });
  });

  // Edge case backing the switch's disabled state: nothing fresh on the
  // plate, which is never submitted (the switch is off — see PlateScreen's
  // tests).
  it("resolves to an empty foods list at zero selected foods and no recipe (the disabled-toggle edge case)", () => {
    expect(resolveLeftoverSource([], [])).toEqual({ kind: "foods", foodIds: [] });
  });

  // Kills a mutant that ignores recipeId and branches on foodIds alone.
  it("never resolves to 'foods' when a recipe is selected, even with zero foods", () => {
    const result = resolveLeftoverSource(["recipe-1"], []);
    expect(result.kind).toBe("recipe");
  });
});

describe("buildLeftoverStorageInput", () => {
  const preparedAt = new Date(2026, 7, 26, 10, 36);

  it("builds a recipe-sourced payload: recipeId present, foodIds absent", () => {
    const source: LeftoverSourceKind = { kind: "recipe", recipeIds: ["recipe-1"] };
    const result = buildLeftoverStorageInput(source, "freezer", "", "", false, preparedAt);
    expect(result).toEqual({
      recipeId: "recipe-1",
      location: "freezer",
      preparedAt: preparedAt.toISOString(),
      servingsTotal: undefined,
      bestBy: undefined,
    });
    expect(result).not.toHaveProperty("foodIds");
    expect(result).not.toHaveProperty("separateItems");
  });

  it("builds a food-sourced payload: foodIds present, recipeId absent", () => {
    const source: LeftoverSourceKind = { kind: "foods", foodIds: ["food-1"] };
    const result = buildLeftoverStorageInput(source, "fridge", "", "", false, preparedAt);
    expect(result).toEqual({
      foodIds: ["food-1"],
      location: "fridge",
      preparedAt: preparedAt.toISOString(),
      servingsTotal: undefined,
      bestBy: undefined,
    });
    expect(result).not.toHaveProperty("recipeId");
  });

  // Item 348: the whole point — a three-food meal's leftovers carry all
  // three ids, not the one the parent was once made to choose.
  it("sends EVERY selected food id, in order, for a multi-food meal", () => {
    const source: LeftoverSourceKind = { kind: "foods", foodIds: ["food-3", "food-1", "food-2"] };
    const result = buildLeftoverStorageInput(source, "fridge", "", "", false, preparedAt);
    expect(result.foodIds).toEqual(["food-3", "food-1", "food-2"]);
  });

  it("round-trips the separate-containers flag once two or more foods make it meaningful", () => {
    const source: LeftoverSourceKind = { kind: "foods", foodIds: ["food-1", "food-2"] };
    expect(buildLeftoverStorageInput(source, "fridge", "", "", true, preparedAt).separateItems).toBe(true);
    expect(buildLeftoverStorageInput(source, "fridge", "", "", false, preparedAt).separateItems).toBe(false);
  });

  // The flag is gated on the same predicate that shows the control, so a
  // choice made at two foods and then undone (by removing one) cannot leak.
  it("omits the flag entirely below two foods, even when it is set", () => {
    const one: LeftoverSourceKind = { kind: "foods", foodIds: ["food-1"] };
    expect(buildLeftoverStorageInput(one, "fridge", "", "", true, preparedAt)).not.toHaveProperty("separateItems");
  });

  it("never sends the flag for a recipe container, which the server rejects it on", () => {
    const source: LeftoverSourceKind = { kind: "recipe", recipeIds: ["recipe-1"] };
    expect(buildLeftoverStorageInput(source, "fridge", "", "", true, preparedAt)).not.toHaveProperty("separateItems");
  });

  // Ledger 759: two or more recipes ride as `recipeIds` with the choice;
  // one recipe stays the plain `recipeId` container.
  it("sends two recipes as recipeIds, in pick order, with the container choice", () => {
    const source: LeftoverSourceKind = { kind: "recipe", recipeIds: ["recipe-2", "recipe-1"] };
    expect(buildLeftoverStorageInput(source, "freezer", "", "", false, preparedAt)).toEqual({
      recipeIds: ["recipe-2", "recipe-1"],
      separateItems: false,
      location: "freezer",
      preparedAt: preparedAt.toISOString(),
      servingsTotal: undefined,
      bestBy: undefined,
    });
    const separate = buildLeftoverStorageInput(source, "freezer", "", "", true, preparedAt);
    expect(separate.separateItems).toBe(true);
    expect(separate).not.toHaveProperty("recipeId");
    expect(separate).not.toHaveProperty("foodIds");
  });

  it("defaults to one container when the caller passes no choice at all", () => {
    const source: LeftoverSourceKind = { kind: "foods", foodIds: ["food-1", "food-2"] };
    expect(buildLeftoverStorageInput(source, "fridge", "", "").separateItems).toBe(false);
  });

  it("parses a non-blank servingsTotal to a number and passes bestBy through", () => {
    const source: LeftoverSourceKind = { kind: "foods", foodIds: ["food-1"] };
    const result = buildLeftoverStorageInput(source, "counter", "6", "2026-09-10", false, preparedAt);
    expect(result.servingsTotal).toBe(6);
    expect(result.bestBy).toBe("2026-09-10");
  });

  it("treats a blank/whitespace servingsTotal as omitted, not zero or NaN", () => {
    const source: LeftoverSourceKind = { kind: "foods", foodIds: ["food-1"] };
    const result = buildLeftoverStorageInput(source, "fridge", "   ", "", false, preparedAt);
    expect(result.servingsTotal).toBeUndefined();
  });

  // notes/quantityNote are never auto-copied from the meal — kills a mutant
  // that sends them as "" or null instead of omitting the keys entirely.
  it("never includes notes or quantityNote", () => {
    const source: LeftoverSourceKind = { kind: "recipe", recipeIds: ["recipe-1"] };
    const result = buildLeftoverStorageInput(source, "fridge", "", "", false, preparedAt);
    expect(result).not.toHaveProperty("notes");
    expect(result).not.toHaveProperty("quantityNote");
  });
});

describe("buildLeftoverStorageInput default preparedAt", () => {
  it("minute-truncates the default preparedAt (seconds and ms are zero)", () => {
    const input = buildLeftoverStorageInput({ kind: "foods", foodIds: ["f-1"] }, "fridge", "", "");
    const prepared = new Date(input.preparedAt!);
    expect(prepared.getSeconds()).toBe(0);
    expect(prepared.getMilliseconds()).toBe(0);
  });
});

