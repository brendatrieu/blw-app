import { z } from "zod";

/**
 * Symptom checker contract, shared by `server/src/ai/*`,
 * `server/src/routes/symptom.ts` and `client/src/features/symptom/**`.
 *
 * Two hard constraints shape everything in this file:
 *
 *  1. **Nothing here is diagnostic.** The survey is a fixed checkbox
 *     vocabulary and the result is a ranked list of *timing* coincidences.
 *     Every response carries a disclaimer string so no surface can render a
 *     result without it.
 *  2. **Emergency judgement is deterministic.** The red-flag classification
 *     lives in `SYMPTOM_CATALOG.soloTriage` and in `server/src/ai/triage.ts`,
 *     never in a model response. The catalog is the oracle the triage unit
 *     tests check the rule engine against, so a symptom added here without a
 *     matching triage rule fails the suite.
 */

// ---------------------------------------------------------------------------
// Survey vocabulary
// ---------------------------------------------------------------------------

export const symptomSchema = z.enum([
  // skin
  "hives_localized",
  "hives_widespread",
  "widespread_rash",
  "mouth_rash",
  "eczema_flare",
  // mouth / face / airway
  "lip_face_swelling",
  "tongue_throat_swelling",
  "trouble_swallowing",
  // breathing
  "difficulty_breathing",
  "wheeze_or_noisy_breathing",
  "persistent_cough",
  // tummy
  "vomiting_single",
  "vomiting_repetitive",
  "diarrhea",
  "blood_in_stool",
  // whole body
  "pale_or_floppy",
  "unresponsive_or_fainting",
  "unusual_sleepiness",
  // behaviour
  "fussiness",
  "food_refusal",
]);
export type Symptom = z.infer<typeof symptomSchema>;

export const symptomGroupSchema = z.enum(["skin", "mouth_face", "breathing", "tummy", "whole_body", "behavior"]);
export type SymptomGroup = z.infer<typeof symptomGroupSchema>;

export const SYMPTOM_GROUP_LABELS: Record<SymptomGroup, string> = {
  skin: "Skin",
  mouth_face: "Mouth and face",
  breathing: "Breathing",
  tummy: "Tummy",
  whole_body: "Whole body",
  behavior: "Behaviour",
};

/**
 * How quickly a symptom typically shows up after the trigger food.
 * `immediate` = IgE-type, minutes to ~2h. `delayed` = FPIES/proctocolitis
 * type, ~2-72h. `either` = uninformative on its own.
 */
export type SymptomTiming = "immediate" | "delayed" | "either";

export interface SymptomCatalogEntry {
  value: Symptom;
  label: string;
  group: SymptomGroup;
  /**
   * Triage level this symptom produces **on its own**, with no other symptom
   * ticked and severity `mild`. Null means it is not a red flag by itself.
   *
   * This is the contract `server/src/ai/triage.ts` is tested against: the
   * table-driven test walks every entry here and asserts the rule engine
   * agrees. Adding a symptom without deciding this field is a type error;
   * deciding it without writing the matching rule is a test failure.
   */
  soloTriage: "emergency" | "urgent_care" | null;
  timing: SymptomTiming;
}

export const SYMPTOM_CATALOG: readonly SymptomCatalogEntry[] = [
  { value: "hives_localized", label: "Hives in one spot", group: "skin", soloTriage: null, timing: "immediate" },
  {
    value: "hives_widespread",
    label: "Hives over several parts of the body",
    group: "skin",
    soloTriage: null,
    timing: "immediate",
  },
  { value: "widespread_rash", label: "Widespread rash", group: "skin", soloTriage: null, timing: "immediate" },
  { value: "mouth_rash", label: "Rash or redness around the mouth", group: "skin", soloTriage: null, timing: "immediate" },
  { value: "eczema_flare", label: "Eczema flare-up", group: "skin", soloTriage: null, timing: "delayed" },
  {
    value: "lip_face_swelling",
    label: "Swollen lips, eyelids or face",
    group: "mouth_face",
    soloTriage: "urgent_care",
    timing: "immediate",
  },
  {
    value: "tongue_throat_swelling",
    label: "Swollen tongue or throat",
    group: "mouth_face",
    soloTriage: "emergency",
    timing: "immediate",
  },
  {
    value: "trouble_swallowing",
    label: "Trouble swallowing, drooling or a hoarse cry",
    group: "mouth_face",
    soloTriage: "emergency",
    timing: "immediate",
  },
  {
    value: "difficulty_breathing",
    label: "Struggling to breathe",
    group: "breathing",
    soloTriage: "emergency",
    timing: "immediate",
  },
  {
    value: "wheeze_or_noisy_breathing",
    label: "Wheezing or noisy breathing",
    group: "breathing",
    soloTriage: "emergency",
    timing: "immediate",
  },
  {
    value: "persistent_cough",
    label: "Coughing that won't settle",
    group: "breathing",
    soloTriage: null,
    timing: "immediate",
  },
  { value: "vomiting_single", label: "Vomited once", group: "tummy", soloTriage: null, timing: "either" },
  {
    value: "vomiting_repetitive",
    label: "Vomiting again and again",
    group: "tummy",
    soloTriage: null,
    timing: "delayed",
  },
  { value: "diarrhea", label: "Diarrhoea", group: "tummy", soloTriage: null, timing: "delayed" },
  { value: "blood_in_stool", label: "Blood or mucus in the nappy", group: "tummy", soloTriage: null, timing: "delayed" },
  {
    value: "pale_or_floppy",
    label: "Pale, grey or floppy",
    group: "whole_body",
    soloTriage: "emergency",
    timing: "either",
  },
  {
    value: "unresponsive_or_fainting",
    label: "Unresponsive or fainting",
    group: "whole_body",
    soloTriage: "emergency",
    timing: "immediate",
  },
  {
    value: "unusual_sleepiness",
    label: "Unusually sleepy or hard to rouse",
    group: "whole_body",
    soloTriage: null,
    timing: "delayed",
  },
  { value: "fussiness", label: "Unusually fussy or uncomfortable", group: "behavior", soloTriage: null, timing: "either" },
  { value: "food_refusal", label: "Refusing food", group: "behavior", soloTriage: null, timing: "either" },
];

const catalogByValue = new Map(SYMPTOM_CATALOG.map((entry) => [entry.value, entry]));

export function symptomEntry(value: Symptom): SymptomCatalogEntry {
  const entry = catalogByValue.get(value);
  if (!entry) throw new Error(`Symptom ${value} is missing from SYMPTOM_CATALOG`);
  return entry;
}

export function symptomLabel(value: Symptom): string {
  return symptomEntry(value).label;
}

export const severitySchema = z.enum(["mild", "moderate", "severe"]);
export type Severity = z.infer<typeof severitySchema>;

export const SEVERITY_LABELS: Record<Severity, string> = {
  mild: "Mild — noticeable but settled quickly",
  moderate: "Moderate — clearly upset for a while",
  severe: "Severe — frightening, or getting worse",
};

export const bodyAreaSchema = z.enum([
  "face",
  "mouth",
  "torso",
  "arms",
  "legs",
  "back",
  "nappy_area",
  "whole_body",
]);
export type BodyArea = z.infer<typeof bodyAreaSchema>;

export const BODY_AREA_LABELS: Record<BodyArea, string> = {
  face: "Face",
  mouth: "Mouth",
  torso: "Chest or tummy",
  arms: "Arms",
  legs: "Legs",
  back: "Back",
  nappy_area: "Nappy area",
  whole_body: "All over",
};

/**
 * How long after the last meal the symptoms began. Kept as a coarse enum
 * rather than a free number because it comes from a parent's recollection —
 * and because the FPIES triage rule keys off the classic 1-4h window, which
 * a bucket expresses honestly and a spurious "2.7 hours" does not.
 */
export const mealTimingSchema = z.enum(["under_1h", "1_to_4h", "4_to_12h", "over_12h", "unknown"]);
export type MealTiming = z.infer<typeof mealTimingSchema>;

export const MEAL_TIMING_LABELS: Record<MealTiming, string> = {
  under_1h: "Less than an hour after eating",
  "1_to_4h": "1-4 hours after eating",
  "4_to_12h": "4-12 hours after eating",
  over_12h: "More than 12 hours after eating",
  unknown: "Not sure",
};

/** The exposure window the snapshot covers, and the survey's onset floor. */
export const SYMPTOM_WINDOW_HOURS = 168;
const ONSET_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
/** A parent east of UTC can legitimately report "just now" a few minutes ahead. */
const ONSET_FUTURE_SLACK_MS = 5 * 60 * 1000;

export const onsetAtSchema = z
  .string()
  .datetime({ message: "onsetAt must be an ISO datetime" })
  .superRefine((value, ctx) => {
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "onsetAt is not a real datetime" });
      return;
    }
    const now = Date.now();
    if (ms > now + ONSET_FUTURE_SLACK_MS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "onsetAt cannot be in the future" });
    }
    if (ms < now - ONSET_MAX_AGE_MS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "onsetAt cannot be more than 14 days ago" });
    }
  });

export const symptomSurveySchema = z.object({
  symptoms: z.array(symptomSchema).min(1, "Pick at least one symptom").max(SYMPTOM_CATALOG.length),
  severity: severitySchema,
  onsetAt: onsetAtSchema,
  mealTiming: mealTimingSchema.default("unknown"),
  bodyAreas: z.array(bodyAreaSchema).max(8).optional().default([]),
  /** The only free-text field in the whole feature. */
  notes: z
    .string()
    .trim()
    .max(1000, "Notes must be 1000 characters or fewer")
    .nullish()
    .transform((value) => (value ? value : null)),
});
export type SymptomSurvey = z.infer<typeof symptomSurveySchema>;
export type SymptomSurveyInput = z.input<typeof symptomSurveySchema>;

// ---------------------------------------------------------------------------
// Assessment (the model's structured output, and the fallback's shape too)
// ---------------------------------------------------------------------------

export const triageLevelSchema = z.enum([
  "monitor_at_home",
  "contact_doctor_24h",
  "urgent_care",
  "emergency",
]);
export type TriageLevel = z.infer<typeof triageLevelSchema>;

/** Levels that must render the full-screen, can't-be-missed card. */
export function isAlarmLevel(level: TriageLevel): boolean {
  return level === "urgent_care" || level === "emergency";
}

export const likelihoodSchema = z.enum(["high", "medium", "low"]);
export type Likelihood = z.infer<typeof likelihoodSchema>;

export const reactionTypeSchema = z.enum(["ige_immediate", "delayed_or_fpies", "unclear"]);
export type ReactionType = z.infer<typeof reactionTypeSchema>;

export const noveltySchema = z.enum(["first_exposure", "second_or_third", "established"]);
export type Novelty = z.infer<typeof noveltySchema>;

export const REACTION_TYPE_LABELS: Record<ReactionType, string> = {
  ige_immediate: "Immediate-type timing",
  delayed_or_fpies: "Delayed-type timing",
  unclear: "Timing unclear",
};

export const NOVELTY_LABELS: Record<Novelty, string> = {
  first_exposure: "First time eaten",
  second_or_third: "2nd-3rd time eaten",
  established: "Already established",
};

/**
 * One suspected food. Deliberately identical for the AI path and the
 * rule-based fallback so the UI has a single card component.
 *
 * No ids: this shape is also what goes to the model, and the privacy
 * invariant is that AI payloads carry food names and slugs only.
 */
export const symptomCandidateSchema = z.object({
  foodSlug: z.string().describe("The food's catalog slug, copied exactly from the exposure snapshot."),
  foodName: z.string().describe("The food's display name, copied exactly from the exposure snapshot."),
  likelihood: likelihoodSchema.describe("How well this food fits the pattern relative to the others listed."),
  reactionType: reactionTypeSchema.describe(
    "Which reaction timing the fit is based on: immediate (minutes to 2h), delayed/FPIES (2-72h), or unclear.",
  ),
  novelty: noveltySchema.describe("How new this food is to the baby, from timesServedEver in the snapshot."),
  windowFit: z
    .string()
    .max(160)
    .describe("One short phrase on how the gap between this serving and symptom onset fits the reaction type."),
  rationale: z
    .string()
    .max(400)
    .describe("Two sentences at most, plain parent-facing language. Never names a diagnosis."),
});
export type SymptomCandidate = z.infer<typeof symptomCandidateSchema>;

export const MAX_CANDIDATES = 5;
export const NARRATIVE_MAX_WORDS = 300;

/** The exact structured output requested from the model. */
export const symptomAssessmentSchema = z.object({
  triageLevel: triageLevelSchema.describe(
    "How urgently a clinician should be involved, based only on what the parent reported.",
  ),
  candidates: z
    .array(symptomCandidateSchema)
    .max(MAX_CANDIDATES)
    .describe("Foods from the snapshot that best fit the timing, most likely first. May be empty."),
  narrative: z
    .string()
    .describe("Plain-language explanation for a parent, 300 words or fewer. No diagnosis, no medication."),
  nextSteps: z.array(z.string().max(240)).min(1).max(6).describe("Concrete things to do next."),
  whenToSeekHelp: z
    .array(z.string().max(240))
    .min(1)
    .max(6)
    .describe("Specific signs that mean stop watching and get medical help."),
});
export type SymptomAssessment = z.infer<typeof symptomAssessmentSchema>;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

/** Repeated on every result so no rendering path can omit it. */
export const SYMPTOM_DISCLAIMER =
  "Not medical advice — pattern-spotting only. This looks at timing between foods and symptoms; it cannot diagnose an allergy. Confirm anything here with your pediatrician.";

export const triageOutcomeLevelSchema = z.enum(["urgent_care", "emergency"]);

/** Step 1 fired: a red flag was reported and the model was never called. */
export const symptomTriageResultSchema = z.object({
  kind: z.literal("triage"),
  level: triageOutcomeLevelSchema,
  reasons: z.array(z.string()),
  whileWaiting: z.array(z.string()),
  disclaimer: z.string(),
});
export type SymptomTriageResult = z.infer<typeof symptomTriageResultSchema>;

export const fallbackReasonSchema = z.enum(["no_ai_key", "ai_unavailable"]);
export type FallbackReason = z.infer<typeof fallbackReasonSchema>;

/** Step 2 without a model: the deterministic ranking over the same snapshot. */
export const symptomFallbackResultSchema = z.object({
  kind: z.literal("fallback"),
  reason: fallbackReasonSchema,
  triageLevel: triageLevelSchema,
  candidates: z.array(symptomCandidateSchema),
  nextSteps: z.array(z.string()),
  whenToSeekHelp: z.array(z.string()),
  disclaimer: z.string(),
});
export type SymptomFallbackResult = z.infer<typeof symptomFallbackResultSchema>;

export const symptomAiResultSchema = symptomAssessmentSchema.extend({
  kind: z.literal("ai"),
  disclaimer: z.string(),
});
export type SymptomAiResult = z.infer<typeof symptomAiResultSchema>;

export const symptomResultSchema = z.discriminatedUnion("kind", [
  symptomTriageResultSchema,
  symptomFallbackResultSchema,
  symptomAiResultSchema,
]);
export type SymptomResult = z.infer<typeof symptomResultSchema>;

/** The level a result should be rendered at, whichever branch produced it. */
export function resultTriageLevel(result: SymptomResult): TriageLevel {
  return result.kind === "triage" ? result.level : result.triageLevel;
}

export const symptomCheckRequestSchema = z.object({
  babyId: z.string().uuid(),
  survey: symptomSurveySchema,
});
export type SymptomCheckRequest = z.input<typeof symptomCheckRequestSchema>;

export const symptomCheckResponseSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  result: symptomResultSchema,
});
export type SymptomCheckResponse = z.infer<typeof symptomCheckResponseSchema>;

export const symptomCheckHistoryItemSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  triageLevel: triageLevelSchema,
  symptoms: z.array(symptomSchema),
  severity: severitySchema,
  onsetAt: z.string(),
  result: symptomResultSchema,
});
export type SymptomCheckHistoryItem = z.infer<typeof symptomCheckHistoryItemSchema>;

export const symptomCheckHistoryResponseSchema = z.object({
  items: z.array(symptomCheckHistoryItemSchema),
});
export type SymptomCheckHistoryResponse = z.infer<typeof symptomCheckHistoryResponseSchema>;
