import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { BackButton } from "./BackButton.js";

describe("BackButton", () => {
  it("renders a button with the default 'Back' label and a chevron icon", () => {
    const html = renderToString(
      createElement(MemoryRouter, null, createElement(BackButton, { fallback: "/foods" })),
    );
    expect(html).toContain("Back");
    expect(html).toContain("<svg");
    expect(html).toContain("<button");
  });

  it("renders custom label children instead of the default", () => {
    const html = renderToString(
      createElement(MemoryRouter, null, createElement(BackButton, { fallback: "/safety" }, "Safety Library")),
    );
    expect(html).toContain("Safety Library");
    expect(html).not.toContain(">Back<");
  });
});
