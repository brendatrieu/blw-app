import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { AuthConfig } from "@blw/shared";
import { ForgotPasswordPage } from "./ForgotPasswordPage.js";

function render(entry: string | { pathname: string; state: unknown }, config?: AuthConfig) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (config) queryClient.setQueryData(["auth-config"], config);
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MemoryRouter, { initialEntries: [entry] }, createElement(ForgotPasswordPage)),
    ),
  );
}

const ON: AuthConfig = { googleEnabled: false, emailEnabled: true };

describe("ForgotPasswordPage (render)", () => {
  it("asks for the address, carrying over what was typed on sign-in", () => {
    const html = render({ pathname: "/forgot-password", state: { email: "parent@example.com" } }, ON);
    expect(html).toContain("Reset your password");
    expect(html).toContain("Enter the email you signed up with and we&#x27;ll send you a link.");
    expect(html).toMatch(/<input[^>]*id="forgot-email"[^>]*value="parent@example.com"/);
    expect(html).toContain("Send link");
    expect(html).toMatch(/<a[^>]*href="\/login"[^>]*>Back to sign in<\/a>/);
  });

  it("renders nothing to fill in when the server cannot send email (it redirects to sign-in)", () => {
    const html = render("/forgot-password", { googleEnabled: false, emailEnabled: false });
    expect(html).not.toContain("<form");
    expect(html).not.toContain("Reset your password");
  });
});
