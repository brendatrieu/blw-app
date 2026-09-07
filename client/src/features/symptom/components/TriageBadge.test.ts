import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { SYMPTOM_CATALOG } from "@blw/shared";
import { TRIAGE_EMOJI, TriageBadge, TriageLegend, triageBadgeLabel } from "./TriageBadge.js";
import { SymptomSurveyForm } from "./SymptomSurveyForm.js";

describe("triageBadgeLabel", () => {
  it("names both tiers distinctly and never leaks a phone number", () => {
    expect(triageBadgeLabel("emergency")).toBe("Emergency");
    expect(triageBadgeLabel("urgent_care")).toBe("See today");
    expect(triageBadgeLabel("emergency")).not.toBe(triageBadgeLabel("urgent_care"));
  });
});

describe("TriageBadge", () => {
  it("is emoji-only visually, no pill, with the tier name reserved for screen readers", () => {
    const html = renderToString(createElement(TriageBadge, { level: "emergency" }));
    expect(html).toMatch(/<span aria-hidden="true"[^>]*data-icon="emergency">⚠️<\/span>/);
    expect(html).toMatch(/<span class="sr-only">Emergency<\/span>/);
    expect(html).not.toContain("background-color");
    // Nothing visible besides the emoji itself.
    const visibleText = html.replace(/<span class="sr-only">[^<]*<\/span>/, "").replace(/<[^>]+>/g, "").trim();
    expect(visibleText).toBe(TRIAGE_EMOJI.emergency);
  });

  it("uses the stethoscope, on a light disc, on the urgent-care tier", () => {
    const html = renderToString(createElement(TriageBadge, { level: "urgent_care" }));
    expect(html).toMatch(/<span aria-hidden="true"[^>]*data-icon="urgent_care">🩺<\/span>/);
    expect(html).not.toContain(TRIAGE_EMOJI.emergency);
    expect(html).toMatch(/<span class="sr-only">See today<\/span>/);
  });
});

describe("TriageLegend", () => {
  it("explains both tiers with the same badges the checklist uses", () => {
    const html = renderToString(createElement(TriageLegend));
    expect(html).toContain(TRIAGE_EMOJI.emergency);
    expect(html).toContain(TRIAGE_EMOJI.urgent_care);
    expect(html).toMatch(/immediate care/i);
    expect(html).toMatch(/emergency services/i);
    expect(html).toMatch(/doctor today/i);
    expect(html).not.toContain("999");
    // The samples are real badges (emoji + sr-only name), not bare emoji.
    expect(html).toMatch(/<span class="sr-only">Emergency<\/span>/);
    expect(html).toMatch(/<span class="sr-only">See today<\/span>/);
  });
});

describe("SymptomSurveyForm", () => {
  it("renders the legend above the checklist and a badge for every solo-triage symptom", () => {
    const html = renderToString(
      createElement(SymptomSurveyForm, { onSubmit: () => {}, isPending: false, errorMessage: null }),
    );
    const legendAt = html.indexOf("Symptoms marked like this");
    const checklistAt = html.indexOf("What are you seeing?");
    expect(legendAt).toBeGreaterThan(-1);
    expect(checklistAt).toBeGreaterThan(legendAt);

    const emergencyCount = SYMPTOM_CATALOG.filter((e) => e.soloTriage === "emergency").length;
    const urgentCount = SYMPTOM_CATALOG.filter((e) => e.soloTriage === "urgent_care").length;
    expect(emergencyCount).toBeGreaterThan(0);
    // +1 each for the legend's own sample badge.
    expect(html.split(TRIAGE_EMOJI.emergency).length - 1).toBe(emergencyCount + 1);
    expect(html.split(TRIAGE_EMOJI.urgent_care).length - 1).toBe(urgentCount + 1);
    expect(html).not.toContain(">999<");
  });
});
