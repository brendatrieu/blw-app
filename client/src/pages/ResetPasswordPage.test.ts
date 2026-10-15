import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ResetPasswordPage } from "./ResetPasswordPage.js";

function render(entry: string | { pathname: string; state: unknown }) {
  return renderToString(createElement(MemoryRouter, { initialEntries: [entry] }, createElement(ResetPasswordPage)));
}

describe("ResetPasswordPage (render)", () => {
  it("asks for the new password twice, as a new password for password managers", () => {
    const html = render("/reset-password?token=tok-123");
    expect(html).toContain("Choose a new password");
    expect(html.match(/autoComplete="new-password"|autocomplete="new-password"/g)).toHaveLength(2);
    expect(html).toContain("At least 8 characters.");
    expect(html).toContain("Save new password");
  });

  it("works from the token parked in history state", () => {
    expect(render({ pathname: "/reset-password", state: { resetToken: "tok-123" } })).toContain(
      "Choose a new password",
    );
  });

  it("says plainly when the link is spent, expired or missing", () => {
    for (const entry of ["/reset-password?error=INVALID_TOKEN", "/reset-password"]) {
      const html = render(entry);
      expect(html).toContain("This link no longer works");
      expect(html).toContain("Reset links work once and expire after an hour.");
      expect(html).toMatch(/<a[^>]*href="\/login"[^>]*>Back to sign in<\/a>/);
      expect(html).not.toContain("<form");
    }
  });
});
