import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SYMPTOM_CATALOG } from "@blw/shared";
import { SymptomSurveyForm, symptomCheckboxId, validateSymptomSurvey } from "./SymptomSurveyForm.js";

function renderForm(props: Partial<Parameters<typeof SymptomSurveyForm>[0]> = {}) {
  return renderToString(
    createElement(SymptomSurveyForm, {
      onSubmit: () => {},
      isPending: false,
      errorMessage: null,
      ...props,
    }),
  );
}

describe("validateSymptomSurvey", () => {
  it("accepts a survey with at least one symptom ticked", () => {
    expect(validateSymptomSurvey({ symptoms: ["hives_localized"] })).toEqual({});
  });

  it("requires at least one symptom, phrased as a list error", () => {
    expect(validateSymptomSurvey({ symptoms: [] }).symptoms).toBe("Add at least one symptom");
  });

  it("clears its own error as soon as a box is ticked", () => {
    expect(validateSymptomSurvey({ symptoms: [] }).symptoms).toBeDefined();
    expect(validateSymptomSurvey({ symptoms: ["vomiting_single"] }).symptoms).toBeUndefined();
  });
});

describe("symptomCheckboxId", () => {
  it("gives each symptom a stable id — what a failed submit focuses", () => {
    expect(symptomCheckboxId("hives_localized")).toBe("symptom-hives_localized");
  });
});

describe("SymptomSurveyForm (render)", () => {
  // Item 235: the submit stays enabled with nothing ticked, so a tap can say
  // "Add at least one symptom" instead of doing nothing at all.
  it("leaves the submit enabled with nothing ticked, and shows no error markup before a submit attempt", () => {
    const html = renderForm();
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Check the last 7 days</);
    expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*\sdisabled=""[^>]*>Check the last 7 days</);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("Add at least one symptom");
  });

  it("still disables the submit while a check is in flight", () => {
    expect(renderForm({ isPending: true })).toMatch(
      /<button[^>]*type="submit"[^>]*\sdisabled=""[^>]*>Checking…</,
    );
  });

  // Item 236: this form's checkboxes carry no native constraint to fall back
  // on, so the inline message is the only feedback — `noValidate` keeps the
  // policy the same as every other form in the app.
  it("opts out of native constraint validation", () => {
    expect(renderForm()).toMatch(/<form[^>]*novalidate/i);
  });

  // The message needs somewhere to land, and the focus needs something to
  // land on: every checkbox carries its own id.
  it("gives every symptom checkbox an id", () => {
    const html = renderForm();
    for (const entry of SYMPTOM_CATALOG) {
      expect(html).toContain(`id="${symptomCheckboxId(entry.value)}"`);
    }
  });

  // A server failure is a different thing from a missing answer, but it is
  // still an alert now rather than an unannounced paragraph.
  it("renders a server error message as an alert", () => {
    const html = renderForm({ errorMessage: "Could not run the check." });
    expect(html).toMatch(/<p role="alert"[^>]*>Could not run the check\.<\/p>/);
  });
});
