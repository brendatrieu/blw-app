import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { LoginPage, validateLogin, type LoginValues } from "./LoginPage.js";

function values(overrides: Partial<LoginValues> = {}): LoginValues {
  return { email: "parent@example.com", password: "hunter2hunter2", ...overrides };
}

function render() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MemoryRouter, { initialEntries: ["/login"] }, createElement(LoginPage, null)),
    ),
  );
}

describe("validateLogin", () => {
  it("accepts a filled-in form", () => {
    expect(validateLogin(values())).toEqual({});
  });

  it("requires an email, treating whitespace as blank", () => {
    expect(validateLogin(values({ email: "" })).email).toBe("Email is required");
    expect(validateLogin(values({ email: "   " })).email).toBe("Email is required");
  });

  it("names a malformed email as a format problem, not a missing one", () => {
    expect(validateLogin(values({ email: "parent@example" })).email).toBe("Enter a valid email");
  });

  it("requires a password — and never trims it, since spaces can be part of one", () => {
    expect(validateLogin(values({ password: "" })).password).toBe("Password is required");
    expect(validateLogin(values({ password: "   " })).password).toBeUndefined();
  });

  it("reports both fields at once, and clears each as it is fixed", () => {
    expect(validateLogin({ email: "", password: "" })).toEqual({
      email: "Email is required",
      password: "Password is required",
    });
    expect(validateLogin({ email: "parent@example.com", password: "" })).toEqual({
      password: "Password is required",
    });
  });
});

describe("LoginPage (render)", () => {
  // Item 235: Sign in was always enabled here; what was missing is the
  // per-field message it produces on an empty submit — and nothing may show
  // before that submit happens.
  it("leaves Sign in enabled and shows no error markup before a submit attempt", () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Sign in</);
    expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*\sdisabled=""[^>]*>Sign in</);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("Email is required");
    expect(html).not.toContain("Password is required");
  });

  // Item 236: native `required` is not sufficient (a PWA shows nothing
  // reliably), and left switched on it would pre-empt the inline messages.
  it("opts out of native constraint validation", () => {
    expect(render()).toMatch(/<form[^>]*novalidate/i);
  });

  it("offers both ways in — sign in, or create an account — and no Google button", () => {
    const html = render();
    expect(html).toContain("Welcome to Little Meals");
    expect(html).toContain("Sign in or create an account.");
    expect(html).toMatch(/<a[^>]*href="\/signup"[^>]*>Create an account<\/a>/);
    expect(html).not.toContain("Google");
    expect(html).not.toContain("Welcome back");
  });

  it("still renders both fields with the ids a failed submit focuses", () => {
    const html = render();
    expect(html).toContain('id="login-email"');
    expect(html).toContain('id="login-password"');
  });
});
