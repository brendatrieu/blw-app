import { describe, expect, it } from "vitest";
import {
  SYMPTOM_CATALOG,
  symptomSchema,
  type MealTiming,
  type Severity,
  type Symptom,
} from "@blw/shared";
import { TRIAGE_RULES, escalate, runTriage, type TriageOutcomeLevel } from "../ai/triage.js";

// Every emergency call this app ever makes comes out of this one pure
// function, so it gets the most paranoid suite in the repo. Two guards keep
// it honest as the symptom vocabulary grows:
//
//   * "every rule has a fixture" fails when a rule is added without a test;
//   * "every symptom's solo outcome" fails when a symptom is added to the
//     shared catalog without a matching rule (or with the wrong one).

function triage(
  symptoms: Symptom[],
  severity: Severity = "mild",
  mealTiming: MealTiming = "unknown",
): ReturnType<typeof runTriage> {
  return runTriage({ symptoms, severity, mealTiming });
}

function reasonFor(ruleId: string): string {
  const rule = TRIAGE_RULES.find((candidate) => candidate.id === ruleId);
  if (!rule) throw new Error(`No triage rule with id ${ruleId}`);
  return rule.reason;
}

interface RuleFixture {
  ruleId: string;
  symptoms: Symptom[];
  mealTiming?: MealTiming;
  expected: TriageOutcomeLevel;
}

/** One minimal survey per rule — nothing extra that could fire a second rule. */
const RULE_FIXTURES: RuleFixture[] = [
  { ruleId: "difficulty_breathing", symptoms: ["difficulty_breathing"], expected: "emergency" },
  { ruleId: "noisy_breathing", symptoms: ["wheeze_or_noisy_breathing"], expected: "emergency" },
  { ruleId: "tongue_throat_swelling", symptoms: ["tongue_throat_swelling"], expected: "emergency" },
  { ruleId: "trouble_swallowing", symptoms: ["trouble_swallowing"], expected: "emergency" },
  {
    ruleId: "face_swelling_with_swallowing",
    symptoms: ["lip_face_swelling", "trouble_swallowing"],
    expected: "emergency",
  },
  { ruleId: "face_swelling_alone", symptoms: ["lip_face_swelling"], expected: "urgent_care" },
  { ruleId: "pale_or_floppy", symptoms: ["pale_or_floppy"], expected: "emergency" },
  { ruleId: "unresponsive", symptoms: ["unresponsive_or_fainting"], expected: "emergency" },
  {
    ruleId: "widespread_hives_second_system",
    symptoms: ["hives_widespread", "vomiting_single"],
    expected: "emergency",
  },
  {
    ruleId: "fpies_pattern",
    symptoms: ["vomiting_repetitive", "unusual_sleepiness"],
    mealTiming: "1_to_4h",
    expected: "urgent_care",
  },
  {
    ruleId: "repetitive_vomiting_with_lethargy",
    symptoms: ["vomiting_repetitive", "unusual_sleepiness"],
    mealTiming: "over_12h",
    expected: "urgent_care",
  },
];

describe("triage rules, one at a time", () => {
  for (const fixture of RULE_FIXTURES) {
    it(`${fixture.ruleId} -> ${fixture.expected}`, () => {
      const result = triage(fixture.symptoms, "mild", fixture.mealTiming ?? "unknown");
      expect(result.level).toBe(fixture.expected);
      expect(result.reasons).toContain(reasonFor(fixture.ruleId));
      expect(result.whileWaiting.length).toBeGreaterThan(0);
    });
  }

  it("every rule in the table has a fixture above", () => {
    const covered = new Set(RULE_FIXTURES.map((fixture) => fixture.ruleId));
    const declared = TRIAGE_RULES.map((rule) => rule.id);
    expect(declared.filter((id) => !covered.has(id))).toEqual([]);
  });

  it("rule ids are unique", () => {
    const ids = TRIAGE_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("every symptom's solo outcome matches the shared catalog", () => {
  // The catalog is the contract the UI and the docs read; this is where it is
  // proved to match the engine. A new enum value with no catalog entry fails
  // the first test; a catalog entry with no matching rule fails the second.
  it("the catalog covers every symptom enum value exactly once", () => {
    const catalogValues = SYMPTOM_CATALOG.map((entry) => entry.value);
    expect(new Set(catalogValues).size).toBe(catalogValues.length);
    expect([...catalogValues].sort()).toEqual([...symptomSchema.options].sort());
  });

  for (const entry of SYMPTOM_CATALOG) {
    const expected = entry.soloTriage ?? "none";
    it(`${entry.value} alone -> ${expected}`, () => {
      const result = triage([entry.value]);
      expect(result.level).toBe(expected);
      if (expected === "none") {
        expect(result.reasons).toEqual([]);
        expect(result.whileWaiting).toEqual([]);
      }
    });
  }

  it("at least one symptom is emergency-class on its own", () => {
    // Guards against a refactor that quietly empties the red-flag table and
    // leaves every test above passing vacuously.
    expect(SYMPTOM_CATALOG.filter((entry) => entry.soloTriage === "emergency").length).toBeGreaterThan(0);
  });
});

describe("combinations", () => {
  it("widespread hives alone is not an emergency", () => {
    expect(triage(["hives_widespread"]).level).toBe("none");
  });

  it("widespread hives plus any gut symptom is an emergency", () => {
    for (const second of ["vomiting_single", "vomiting_repetitive", "diarrhea", "blood_in_stool"] as const) {
      expect(triage(["hives_widespread", second]).level).toBe("emergency");
    }
  });

  it("widespread hives plus a cough is an emergency (second system, respiratory)", () => {
    expect(triage(["hives_widespread", "persistent_cough"]).level).toBe("emergency");
  });

  it("localized hives plus a gut symptom is not escalated", () => {
    // The rule is about hives *across the body*; one patch plus a single
    // vomit is exactly the everyday case the AI step exists to look at.
    expect(triage(["hives_localized", "vomiting_single"]).level).toBe("none");
  });

  it("facial swelling with throat swelling reports the airway rule, not the urgent one", () => {
    const result = triage(["lip_face_swelling", "tongue_throat_swelling"]);
    expect(result.level).toBe("emergency");
    expect(result.reasons).toContain(reasonFor("face_swelling_with_swallowing"));
    expect(result.reasons).not.toContain(reasonFor("face_swelling_alone"));
  });

  it("the FPIES window rule replaces the timing-agnostic one rather than doubling it", () => {
    const result = triage(["vomiting_repetitive", "unusual_sleepiness"], "mild", "1_to_4h");
    expect(result.reasons).toContain(reasonFor("fpies_pattern"));
    expect(result.reasons).not.toContain(reasonFor("repetitive_vomiting_with_lethargy"));
  });

  it("repeated vomiting with lethargy is urgent whether or not the meal time is known", () => {
    for (const timing of ["under_1h", "1_to_4h", "4_to_12h", "over_12h", "unknown"] as const) {
      expect(triage(["vomiting_repetitive", "unusual_sleepiness"], "mild", timing).level).toBe("urgent_care");
    }
  });

  it("repeated vomiting alone is left to the AI step", () => {
    expect(triage(["vomiting_repetitive"], "mild", "1_to_4h").level).toBe("none");
  });

  it("takes the highest level when rules of different levels both fire", () => {
    const result = triage(["lip_face_swelling", "difficulty_breathing"]);
    expect(result.level).toBe("emergency");
    expect(result.reasons).toContain(reasonFor("difficulty_breathing"));
    expect(result.reasons).toContain(reasonFor("face_swelling_alone"));
  });

  it("an everyday mild survey produces no red flag and no advice", () => {
    const result = triage(["mouth_rash", "fussiness", "food_refusal"], "moderate");
    expect(result).toEqual({ level: "none", reasons: [], whileWaiting: [] });
  });
});

describe("severity escalation", () => {
  it("escalate() moves one step and stops at emergency", () => {
    expect(escalate("none")).toBe("urgent_care");
    expect(escalate("urgent_care")).toBe("emergency");
    expect(escalate("emergency")).toBe("emergency");
  });

  it("severe with no red flag becomes urgent_care", () => {
    const result = triage(["fussiness"], "severe");
    expect(result.level).toBe("urgent_care");
    expect(result.reasons).toHaveLength(1);
    expect(result.whileWaiting.length).toBeGreaterThan(0);
  });

  it("severe escalates urgent_care to emergency", () => {
    expect(triage(["lip_face_swelling"], "severe").level).toBe("emergency");
  });

  it("severe leaves emergency where it is", () => {
    expect(triage(["difficulty_breathing"], "severe").level).toBe("emergency");
  });

  it("mild and moderate do not escalate", () => {
    expect(triage(["fussiness"], "mild").level).toBe("none");
    expect(triage(["fussiness"], "moderate").level).toBe("none");
    expect(triage(["lip_face_swelling"], "moderate").level).toBe("urgent_care");
  });
});

describe("while-waiting advice", () => {
  it("emergency advice leads with calling emergency services", () => {
    const result = triage(["difficulty_breathing"]);
    expect(result.whileWaiting[0]).toMatch(/emergency services/i);
  });

  it("urgent advice tells the parent to escalate if things change", () => {
    const result = triage(["lip_face_swelling"]);
    expect(result.whileWaiting.join(" ")).toMatch(/emergency services/i);
    expect(result.whileWaiting.join(" ")).toMatch(/today/i);
  });

  it("the FPIES rule adds its rehydration step without duplicating the base steps", () => {
    const result = triage(["vomiting_repetitive", "unusual_sleepiness"], "mild", "1_to_4h");
    expect(result.whileWaiting.join(" ")).toMatch(/rehydration/i);
    expect(new Set(result.whileWaiting).size).toBe(result.whileWaiting.length);
  });

  it("never suggests a medication by name or dose", () => {
    const everySymptom = SYMPTOM_CATALOG.map((entry) => entry.value);
    const advice = [
      ...triage(everySymptom, "severe").whileWaiting,
      ...triage(["lip_face_swelling"]).whileWaiting,
    ].join(" ");
    expect(advice).not.toMatch(/antihistamine|piriton|benadryl|steroid|\bmg\b|\bml\b/i);
  });
});
