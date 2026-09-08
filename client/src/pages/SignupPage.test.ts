import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { SignupPage, validateSignup, type SignupValues } from "./SignupPage.js";

function values(overrides: Partial<SignupValues> = {}): SignupValues {
  return { name: "Sam", email: "parent@example.com", password: "hunter2hunter2", ...overrides };
}

function render() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MemoryRouter, { initialEntries: ["/signup"] }, createElement(SignupPage, null)),
    ),
  );
}

describe("validateSignup", () => {
  it("accepts a filled-in form", () => {
    expect(validateSignup(values())).toEqual({});
  });

  it("requires a name, treating whitespace as blank", () => {
    expect(validateSignup(values({ name: "" })).name).toBe("Name is required");
    expect(validateSignup(values({ name: "   " })).name).toBe("Name is required");
  });

  it("requires an email and calls out a malformed one separately", () => {
    expect(validateSignup(values({ email: "" })).email).toBe("Email is required");
    expect(validateSignup(values({ email: "parent" })).email).toBe("Enter a valid email");
  });

  it("distinguishes a missing password from a too-short one", () => {
    expect(validateSignup(values({ password: "" })).password).toBe("Password is required");
    expect(validateSignup(values({ password: "short" })).password).toBe(
      "Enter a password of at least 8 characters",
    );
    expect(validateSignup(values({ password: "exactly8" })).password).toBeUndefined();
  });

  it("reports every missing field at once, and clears each as it is fixed", () => {
    expect(validateSignup({ name: "", email: "", password: "" })).toEqual({
      name: "Name is required",
      email: "Email is required",
      password: "Password is required",
    });
    expect(validateSignup({ name: "Sam", email: "", password: "hunter2hunter2" })).toEqual({
      email: "Email is required",
    });
  });
});

describe("SignupPage (render)", () => {
  // Item 235: the button stays enabled and the page stays quiet until the
  // first submit — the password-length message used to be the only one, and
  // it was a form-level sentence rather than a message under its field.
  it("leaves Create account enabled and shows no error markup before a submit attempt", () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Create account</);
    expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*\sdisabled=""[^>]*>Create account</);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("is required");
  });

  it("keeps the password hint visible while there is no error to replace it", () => {
    expect(render()).toContain("At least 8 characters.");
  });

  // Item 236.
  it("opts out of native constraint validation", () => {
    expect(render()).toMatch(/<form[^>]*novalidate/i);
  });

  it("renders all three fields with the ids a failed submit focuses", () => {
    const html = render();
    expect(html).toContain('id="signup-name"');
    expect(html).toContain('id="signup-email"');
    expect(html).toContain('id="signup-password"');
  });
});
