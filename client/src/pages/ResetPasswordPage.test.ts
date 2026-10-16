import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { AuthConfig } from "@blw/shared";
import { ResetPasswordPage } from "./ResetPasswordPage.js";

function render(entry: string | { pathname: string; state: unknown }, config?: AuthConfig) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (config) queryClient.setQueryData(["auth-config"], config);
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MemoryRouter, { initialEntries: [entry] }, createElement(ResetPasswordPage)),
    ),
  );
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

  it("offers a fresh link by email only when the server can send one (ledger 822)", () => {
    const newLink = /<a[^>]*href="\/forgot-password"[^>]*>Send a new link<\/a>/;
    expect(render("/reset-password", { googleEnabled: false, emailEnabled: true })).toMatch(newLink);
    expect(render("/reset-password", { googleEnabled: false, emailEnabled: false })).not.toMatch(newLink);
    expect(render("/reset-password")).not.toContain("Send a new link");
  });
});
