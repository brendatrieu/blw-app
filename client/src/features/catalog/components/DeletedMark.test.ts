import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FoodNames } from "./DeletedMark.js";

function inFlexTitle(foods: { name: string; deleted?: boolean }[]): string {
  return renderToString(createElement("h1", { className: "flex" }, createElement(FoodNames, { foods })));
}

describe("FoodNames", () => {
  it("renders plain comma-joined text when nothing is deleted", () => {
    expect(inFlexTitle([{ name: "Sweet Potato" }, { name: "Beef" }])).toBe('<h1 class="flex">Sweet Potato, Beef</h1>');
  });

  it("keeps a marked list in ONE element, so a flex title cannot split it into columns", () => {
    const html = inFlexTitle([{ name: "Sweet Potato", deleted: true }, { name: "Beef" }]);
    // Exactly one child of the h1: a span holding the name, the mark and the rest.
    expect(html).toMatch(/^<h1 class="flex"><span>Sweet Potato<span [^>]*>\u00a0<!-- -->\(deleted\)<\/span>, Beef<\/span><\/h1>$/);
  });
});
