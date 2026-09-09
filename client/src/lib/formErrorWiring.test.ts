import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { CustomRecipeForm } from "../features/catalog/components/CustomRecipeForm.js";
import { CustomFoodForm } from "../features/catalog/components/CustomFoodForm.js";
import { LogFoodForm } from "../features/tracking/components/LogFoodForm.js";
import { AddPantryItemForm } from "../features/pantry/components/AddPantryItemForm.js";
import { SymptomSurveyForm } from "../features/symptom/components/SymptomSurveyForm.js";
import { CelebrationProvider } from "../components/ui/Celebration.js";
import { LoginPage } from "../pages/LoginPage.js";
import { SignupPage } from "../pages/SignupPage.js";
import { AiSection, DeleteAccountForm } from "../pages/SettingsPage.js";

/**
 * The other half of item 237's render pin: every form's OWN wiring from the
 * errors its hook holds to the field that shows them.
 *
 * `Field.test.ts` pins the error slot itself and `SettingsPage.test.ts` pins
 * `BabyFields`, but both take errors as a prop — so deleting, say,
 * `error={shownErrors.title}` from `CustomRecipeForm` (the exact reported
 * bug: a titleless save saying nothing) left every other test in the suite
 * green. The eight files that hold their errors in `useSubmitValidation`
 * need the hook to be in its post-failed-attempt state before any message
 * renders, and a node-env `renderToString` test cannot dispatch a submit.
 *
 * So the hook — and ONLY the hook — is stubbed to what it returns after a
 * failed attempt: the REAL `validate<Form>` run against the form's REAL
 * current values, with `attempted` already true. Everything else (the
 * validate helpers, the field ids, the markup) is the shipping code, so
 * unwiring any `error={…}` prop fails a test here.
 */
vi.mock("./forms.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./forms.js")>();
  return {
    ...actual,
    useSubmitValidation: <V>(values: V, validate: (values: V) => unknown) => ({
      errors: validate(values),
      attempted: true,
      attemptSubmit: () => false,
    }),
  };
});

function render(element: ReactElement, route = "/"): string {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MemoryRouter, { initialEntries: [route] }, createElement(CelebrationProvider, null, element)),
    ),
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The exact markup `Field` (and the two hand-rolled list slots) emit. */
function alertMarkup(message: string): RegExp {
  return new RegExp(
    `<p role="alert" class="[^"]*text-\\[var\\(--color-danger\\)\\][^"]*">${escapeRegExp(message)}</p>`,
  );
}

/**
 * `message` renders as danger-coloured alert markup, positioned AFTER the
 * control it belongs to and (when `before` is given) BEFORE the next field
 * starts — i.e. in its own field's error slot, not somewhere form-level.
 */
function expectErrorUnder(html: string, control: string, message: string, before?: string): void {
  expect(html).toMatch(alertMarkup(message));
  const controlAt = html.indexOf(control);
  const messageAt = html.indexOf(message);
  expect(controlAt).toBeGreaterThan(-1);
  expect(messageAt).toBeGreaterThan(controlAt);
  if (before !== undefined) {
    const nextAt = html.indexOf(before);
    expect(nextAt).toBeGreaterThan(-1);
    expect(messageAt).toBeLessThan(nextAt);
  }
}

/** Item 235: a tap must produce feedback, so the submit never goes disabled. */
function expectSubmitEnabled(html: string): void {
  expect(html).toMatch(/<button[^>]*type="submit"/);
  expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*\sdisabled=""/);
}

function alertCount(html: string): number {
  return (html.match(/role="alert"/g) ?? []).length;
}

describe("required-field errors reach their own field (item 237)", () => {
  it("CustomRecipeForm: title under the title input, ingredients under the picker", () => {
    const html = render(createElement(CustomRecipeForm, { onSaved: () => {} }));
    expectErrorUnder(html, 'id="custom-recipe-title"', "Title is required", 'id="custom-recipe-age"');
    expectErrorUnder(html, 'id="custom-recipe-ingredients"', "Add at least one ingredient", 'id="custom-recipe-extra"');
    expect(alertCount(html)).toBe(2);
    // Item 240: steps are optional, so an empty recipe never complains here.
    expect(html).not.toContain("Add at least one step");
    expectSubmitEnabled(html);
  });

  it("CustomFoodForm: the name message under the name input", () => {
    const html = render(createElement(CustomFoodForm, { onSaved: () => {} }));
    expectErrorUnder(html, 'id="custom-food-name"', "Name is required", 'id="custom-food-category"');
    expect(alertCount(html)).toBe(1);
    expectSubmitEnabled(html);
  });

  it("LogFoodForm: the list message under the Food field", () => {
    const html = render(createElement(LogFoodForm, { babyId: "baby-1", onDone: () => {} }));
    expectErrorUnder(html, 'id="log-food-food"', "Add at least one food");
    expect(alertCount(html)).toBe(1);
    expectSubmitEnabled(html);
  });

  it("AddPantryItemForm: the visible tab's message only", () => {
    const html = render(createElement(AddPantryItemForm, { onDone: () => {} }));
    expectErrorUnder(html, 'id="pantry-add-food"', "Add at least one food");
    expect(alertCount(html)).toBe(1);
    // The recipe and free-form tabs are not on screen — judging them would
    // shout about fields the parent cannot even see.
    expect(html).not.toContain("Recipe is required");
    expect(html).not.toContain("Enter what it is");
    expectSubmitEnabled(html);
  });

  it("SymptomSurveyForm: the list message beneath the checkboxes, inside the fieldset", () => {
    const html = renderToString(
      createElement(SymptomSurveyForm, { onSubmit: () => {}, isPending: false, errorMessage: null }),
    );
    expect(html).toMatch(alertMarkup("Add at least one symptom"));
    expect(html.lastIndexOf('type="checkbox"')).toBeLessThan(html.indexOf("Add at least one symptom"));
    // Still inside the symptom fieldset: before the next question starts.
    expect(html.indexOf("Add at least one symptom")).toBeLessThan(html.indexOf("How bad is it?"));
    expect(alertCount(html)).toBe(1);
    expectSubmitEnabled(html);
  });

  it("LoginPage: one message per credential field", () => {
    const html = render(createElement(LoginPage, null), "/login");
    expectErrorUnder(html, 'id="login-email"', "Email is required", 'id="login-password"');
    expectErrorUnder(html, 'id="login-password"', "Password is required");
    expect(alertCount(html)).toBe(2);
    expectSubmitEnabled(html);
  });

  it("SignupPage: name, email and password each under their own control", () => {
    const html = render(createElement(SignupPage, null), "/signup");
    expectErrorUnder(html, 'id="signup-name"', "Name is required", 'id="signup-email"');
    expectErrorUnder(html, 'id="signup-email"', "Email is required", 'id="signup-password"');
    expectErrorUnder(html, 'id="signup-password"', "Password is required");
    // The error replaces the hint rather than stacking with it.
    expect(html).not.toContain("At least 8 characters.");
    expect(alertCount(html)).toBe(3);
    expectSubmitEnabled(html);
  });

  it("AiSection: the key message under the key input", () => {
    const html = render(createElement(AiSection, null), "/settings");
    expectErrorUnder(html, 'id="anthropic-api-key"', "API key is required");
    expect(alertCount(html)).toBe(1);
    expectSubmitEnabled(html);
  });

  it("DeleteAccountForm: both answers reported, the destructive submit still enabled", () => {
    const html = render(createElement(DeleteAccountForm, { onCancel: () => {} }), "/settings");
    expectErrorUnder(
      html,
      'id="delete-confirm-phrase"',
      "Type the confirmation phrase exactly",
      'id="delete-confirm-password"',
    );
    expectErrorUnder(html, 'id="delete-confirm-password"', "Password is required");
    expect(alertCount(html)).toBe(2);
    expectSubmitEnabled(html);
  });
});
