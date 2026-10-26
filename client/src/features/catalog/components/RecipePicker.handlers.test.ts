// The picker resolves to one recipe (a storage container's). A meal's
// recipes are added through the plate's Add more since ledger 902.
// Called as a plain function with its two hooks stubbed (no DOM, CLAUDE.md).
import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useMemo: (factory: () => unknown) => factory() };
});

vi.mock("../hooks.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useRecipes: () => ({ data: { recipes: [] }, isLoading: false }) };
});

import { RecipePicker } from "./RecipePicker.js";

type Combobox = { props: { mode: string; value: string[]; onChange: (next: string[]) => void } };
const picker = (props: unknown) => (RecipePicker as unknown as (props: unknown) => Combobox)(props);

describe("RecipePicker onChange", () => {
  it("single: a second pick replaces the first", () => {
    const onChange = vi.fn();
    const combobox = picker({ id: "x", value: "a", onChange });
    expect(combobox.props.mode).toBe("single");
    combobox.props.onChange(["a", "b"]);
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
