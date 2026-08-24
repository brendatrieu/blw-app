// Step 1 of the symptom checker: deterministic red-flag triage.
//
// This runs for every survey, for every user, before anything else — with or
// without an AI key, before the exposure snapshot is built, and before any
// model is contacted. If it fires, the model is never called at all.
//
// The rules below are a fixed table, not a judgement call. Emergency
// classification of an infant's symptoms is the one thing in this app that
// must never depend on a model response, a network round trip, or a stored
// API key. Everything here is a pure function of the survey so it can be
// exercised exhaustively in `src/test/triage.test.ts`.
//
// Bias: over-triage. Telling a parent to get a baby seen when it turns out to
// be nothing costs an afternoon; the other error costs much more.
import type { MealTiming, Severity, Symptom } from "@blw/shared";

/** `none` means "no red flag" — it is not one of the API's triage levels. */
export type TriageOutcomeLevel = "none" | "urgent_care" | "emergency";

/** The slice of the survey triage is allowed to see. Nothing else is used. */
export interface TriageInput {
  symptoms: readonly Symptom[];
  severity: Severity;
  mealTiming?: MealTiming;
}

export interface TriageResult {
  level: TriageOutcomeLevel;
  /** Plain-language explanation of every rule that fired, in table order. */
  reasons: string[];
  /** What to do right now. Empty when `level` is `none`. */
  whileWaiting: string[];
}

export interface TriageRule {
  id: string;
  level: Exclude<TriageOutcomeLevel, "none">;
  reason: string;
  matches: (input: TriageInput, has: (symptom: Symptom) => boolean) => boolean;
  /** Rule-specific advice appended to the level's standard steps. */
  extraWhileWaiting?: string[];
}

/**
 * Symptoms in a second organ system, used by the widespread-hives rule: skin
 * plus gut or skin plus airway is the pattern that turns "a rash" into
 * "a whole-body reaction".
 */
const GI_SYMPTOMS: readonly Symptom[] = ["vomiting_single", "vomiting_repetitive", "diarrhea", "blood_in_stool"];
const RESPIRATORY_SYMPTOMS: readonly Symptom[] = [
  "wheeze_or_noisy_breathing",
  "difficulty_breathing",
  "persistent_cough",
];

/**
 * Ordered red-flag table. Order affects only the order reasons are listed;
 * the resulting level is the highest level among the rules that fired.
 */
export const TRIAGE_RULES: readonly TriageRule[] = [
  {
    id: "difficulty_breathing",
    level: "emergency",
    reason: "You reported that your baby is struggling to breathe.",
    matches: (_input, has) => has("difficulty_breathing"),
  },
  {
    id: "noisy_breathing",
    level: "emergency",
    reason: "Wheezing or noisy breathing after a food can mean the airway is narrowing.",
    matches: (_input, has) => has("wheeze_or_noisy_breathing"),
  },
  {
    id: "tongue_throat_swelling",
    level: "emergency",
    reason: "Swelling of the tongue or throat can close a baby's airway quickly.",
    matches: (_input, has) => has("tongue_throat_swelling"),
  },
  {
    id: "trouble_swallowing",
    level: "emergency",
    // Trouble swallowing, drooling or a changed cry are airway signs in a
    // baby, so this stands alone rather than only counting alongside
    // visible swelling.
    reason: "Trouble swallowing, drooling or a hoarse cry are signs the airway is affected.",
    matches: (_input, has) => has("trouble_swallowing"),
  },
  {
    id: "face_swelling_with_swallowing",
    level: "emergency",
    reason: "Facial swelling together with trouble swallowing or throat swelling is an airway emergency.",
    matches: (_input, has) => has("lip_face_swelling") && (has("trouble_swallowing") || has("tongue_throat_swelling")),
  },
  {
    id: "face_swelling_alone",
    level: "urgent_care",
    reason: "Swollen lips, eyelids or face need to be seen today, in case the swelling spreads.",
    // Only when the airway rule above did not already fire, so the parent
    // reads one clear instruction rather than two competing ones.
    matches: (_input, has) =>
      has("lip_face_swelling") && !has("trouble_swallowing") && !has("tongue_throat_swelling"),
  },
  {
    id: "pale_or_floppy",
    level: "emergency",
    reason: "A pale, grey or floppy baby may be going into shock.",
    matches: (_input, has) => has("pale_or_floppy"),
  },
  {
    id: "unresponsive",
    level: "emergency",
    reason: "You reported that your baby was unresponsive or fainted.",
    matches: (_input, has) => has("unresponsive_or_fainting"),
  },
  {
    id: "widespread_hives_second_system",
    level: "emergency",
    reason:
      "Hives across the body plus tummy or breathing symptoms means more than one body system is involved, which is how a severe reaction starts.",
    matches: (input, has) =>
      has("hives_widespread") &&
      [...GI_SYMPTOMS, ...RESPIRATORY_SYMPTOMS].some((symptom) => input.symptoms.includes(symptom)),
  },
  {
    id: "fpies_pattern",
    level: "urgent_care",
    reason:
      "Repeated vomiting starting 1-4 hours after a meal, with your baby pale or unusually sleepy, matches the pattern clinicians watch for after a new food.",
    matches: (input, has) =>
      has("vomiting_repetitive") &&
      (has("unusual_sleepiness") || has("pale_or_floppy")) &&
      input.mealTiming === "1_to_4h",
    extraWhileWaiting: [
      "Offer small, frequent sips of their usual milk or an oral rehydration solution — repeated vomiting dehydrates a baby fast.",
    ],
  },
  {
    id: "repetitive_vomiting_with_lethargy",
    level: "urgent_care",
    // Deliberately independent of meal timing: a parent who cannot remember
    // when the last meal was should not get a quieter answer.
    reason: "Repeated vomiting together with unusual sleepiness needs a clinician to look at your baby today.",
    matches: (input, has) =>
      has("vomiting_repetitive") && has("unusual_sleepiness") && input.mealTiming !== "1_to_4h",
    extraWhileWaiting: [
      "Offer small, frequent sips of their usual milk or an oral rehydration solution — repeated vomiting dehydrates a baby fast.",
    ],
  },
];

const EMERGENCY_WHILE_WAITING: readonly string[] = [
  "Call emergency services now — 999 in the UK, 911 in the US — and say it is a baby with a suspected allergic reaction.",
  "If a clinician has prescribed an adrenaline auto-injector for this baby, use it now exactly as you were shown, then still call.",
  "Lay your baby flat with their legs raised. If breathing is hard, hold them upright; if they are being sick or unresponsive, lay them on their side.",
  "Do not give any food, drink or medicine unless emergency services tell you to.",
  "Stay with them and keep watching their breathing until help arrives.",
];

const URGENT_CARE_WHILE_WAITING: readonly string[] = [
  "Get your baby seen today — call your pediatrician's urgent line, NHS 111, or your nearest urgent care.",
  "Keep them where you can see them and do not leave them to nap alone until they have been checked.",
  "Do not offer the suspected food again until a clinician has advised you.",
  "Write down what they ate, when they ate it, and what you saw — take that with you.",
  "If breathing changes, the tongue or throat swells, or they go pale and floppy, stop waiting and call emergency services.",
];

const LEVEL_RANK: Record<TriageOutcomeLevel, number> = { none: 0, urgent_care: 1, emergency: 2 };

/** One step up the ladder. Emergency is the top; it cannot escalate further. */
export function escalate(level: TriageOutcomeLevel): TriageOutcomeLevel {
  if (level === "none") return "urgent_care";
  return "emergency";
}

const SEVERE_REASON = "You described this as severe, so the guidance below is one level more cautious.";

/**
 * Pure red-flag triage over a survey.
 *
 * Returns `none` when nothing in the table fires — the caller then goes on to
 * build the exposure snapshot and (if a key is on file) call the model.
 */
export function runTriage(input: TriageInput): TriageResult {
  const symptoms = new Set(input.symptoms);
  const has = (symptom: Symptom): boolean => symptoms.has(symptom);

  const fired = TRIAGE_RULES.filter((rule) => rule.matches(input, has));

  let level: TriageOutcomeLevel = "none";
  for (const rule of fired) {
    if (LEVEL_RANK[rule.level] > LEVEL_RANK[level]) level = rule.level;
  }

  const reasons = fired.map((rule) => rule.reason);

  if (input.severity === "severe") {
    level = escalate(level);
    reasons.push(SEVERE_REASON);
  }

  if (level === "none") {
    return { level, reasons: [], whileWaiting: [] };
  }

  const base = level === "emergency" ? EMERGENCY_WHILE_WAITING : URGENT_CARE_WHILE_WAITING;
  const extras = fired.flatMap((rule) => rule.extraWhileWaiting ?? []);
  const whileWaiting = [...new Set([...base, ...extras])];

  return { level, reasons, whileWaiting };
}
