import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Button, ButtonLink } from "./Button.js";

describe("Button variants", () => {
  it("renders the tonal variant with the soft-tint tokens, not the primary fill", () => {
    const html = renderToString(createElement(Button, { variant: "tonal" }, "Tonal"));
    expect(html).toContain("var(--color-primary-soft)");
    expect(html).toContain("var(--color-primary-soft-text)");
    expect(html).not.toContain("var(--color-primary-contrast)");
  });

  it("keeps secondary as the plain bordered neutral style (untouched by tonal)", () => {
    const html = renderToString(createElement(Button, { variant: "secondary" }, "Cancel"));
    expect(html).toContain("var(--color-border)");
    expect(html).not.toContain("var(--color-primary-soft)");
  });

  it("ButtonLink supports the tonal variant too", () => {
    const html = renderToString(
      createElement(MemoryRouter, null, createElement(ButtonLink, { to: "/pantry/add", variant: "tonal" }, "Add pantry item")),
    );
    expect(html).toContain("var(--color-primary-soft)");
    expect(html).toContain('href="/pantry/add"');
  });
});
