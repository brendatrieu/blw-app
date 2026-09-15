import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContainerChoiceField } from "./ContainerChoiceField.js";

function render(foodIds: string[], value: "one" | "separate" = "one") {
  return renderToString(createElement(ContainerChoiceField, { foodIds, value, onChange: () => {} }));
}

// Item 348: leftovers from a three-food meal become ONE container unless the
// parent says otherwise. This is the only place that choice is rendered —
// both the Add form and the log form's leftovers block mount this component,
// so its visibility rule and its default are theirs too.
describe("ContainerChoiceField", () => {
  it("asks 'Save as' with both containers, as a radiogroup, from two foods up", () => {
    const html = render(["food-1", "food-2"]);
    expect(html).toContain("Save as");
    expect(html).toMatch(/role="radiogroup"[^>]*aria-label="Save as"/);
    expect(html).toContain("One container");
    expect(html).toContain("Separate containers");
  });

  it("defaults to One container — the segment checked before anyone touches it", () => {
    const html = render(["food-1", "food-2"]);
    expect(html).toMatch(/aria-checked="true"[^>]*>(?:<!-- -->)?\s*One container</);
    expect(html).toMatch(/aria-checked="false"[^>]*>(?:<!-- -->)?\s*Separate containers</);
  });

  it("follows an explicit 'separate' choice", () => {
    const html = render(["food-1", "food-2"], "separate");
    expect(html).toMatch(/aria-checked="true"[^>]*>(?:<!-- -->)?\s*Separate containers</);
    expect(html).toMatch(/aria-checked="false"[^>]*>(?:<!-- -->)?\s*One container</);
  });

  it("renders nothing at all at one food — one food is one container either way", () => {
    expect(render(["food-1"])).toBe("");
  });

  it("renders nothing at all at zero foods", () => {
    expect(render([])).toBe("");
  });

  it("keeps asking as the list grows past two", () => {
    expect(render(["food-1", "food-2", "food-3", "food-4"])).toContain("Save as");
  });

  // 44px hit areas: both segments are real buttons in the app's standard
  // segmented track, not a compact custom control.
  it("gives each segment the app's minimum tap target", () => {
    const html = render(["food-1", "food-2"]);
    expect((html.match(/min-h-11/g) ?? []).length).toBe(2);
  });
});
