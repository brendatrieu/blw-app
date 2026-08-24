// Step 2, part 2: the single structured model call, and the static copy the
// feature falls back to when that call is not available or not usable.
//
// There is deliberately no tool loop and no streaming here. One request, one
// structured response, one schema check — so the only failure modes are
// "refused", "unparseable" and "network", and every one of them lands on the
// same rule-based fallback the no-key path already uses.
import type Anthropic from "@anthropic-ai/sdk";
import {
  NARRATIVE_MAX_WORDS,
  MAX_CANDIDATES,
  SYMPTOM_WINDOW_HOURS,
  likelihoodSchema,
  noveltySchema,
  reactionTypeSchema,
  symptomAssessmentSchema,
  symptomLabel,
  triageLevelSchema,
  type SymptomAssessment,
  type SymptomSurvey,
} from "@blw/shared";
import { SYMPTOM_SYSTEM_PROMPT } from "./prompts/symptom.js";
import type { ExposureSnapshotItem } from "./snapshot.js";

/** Never a dated alias — the plan pins the family, not a snapshot date. */
export const SYMPTOM_MODEL = "claude-opus-5";
export const SYMPTOM_MAX_TOKENS = 16_000;

/**
 * Server-side refusal fallback: if Opus declines the request, the platform
 * retries it on a default model rather than handing us nothing. Opt-in beta.
 */
const REFUSAL_FALLBACK_BETAS = ["server-side-fallback-2026-07-01"];

// ---------------------------------------------------------------------------
// Structured output format
// ---------------------------------------------------------------------------

/**
 * Written out by hand rather than derived with `betaZodOutputFormat`.
 *
 * That helper calls `z.toJSONSchema`, which only exists in zod 4; this
 * workspace is on zod 3 and every other package's schemas are v3, so
 * upgrading for one call site is not on the table. The shape below is exactly
 * what the SDK's own schema transform emits: `type` / `description` /
 * `properties` / `additionalProperties: false` / `required`, with constraints
 * the structured-output schema does not carry natively (enum members, length
 * caps) spelled out in the description instead.
 *
 * The enum members are read off the shared zod enums rather than retyped, so
 * they cannot drift; `symptom.test.ts` additionally asserts the property set
 * matches `symptomAssessmentSchema`. Whatever comes back is re-validated with
 * the zod schema before a parent sees it.
 */
function enumProperty(values: readonly string[], description: string): Record<string, unknown> {
  return { type: "string", description: `${description} Exactly one of: ${values.join(", ")}.` };
}

const CANDIDATE_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["foodSlug", "foodName", "likelihood", "reactionType", "novelty", "windowFit", "rationale"],
  properties: {
    foodSlug: {
      type: "string",
      description: "The food's catalog slug, copied exactly from the exposure snapshot.",
    },
    foodName: {
      type: "string",
      description: "The food's display name, copied exactly from the exposure snapshot.",
    },
    likelihood: enumProperty(
      likelihoodSchema.options,
      "How well this food fits the pattern relative to the others listed.",
    ),
    reactionType: enumProperty(
      reactionTypeSchema.options,
      "Which reaction timing the fit is based on: immediate (minutes to 2h), delayed or FPIES-type (2-72h), or unclear.",
    ),
    novelty: enumProperty(
      noveltySchema.options,
      "How new this food is to the baby, taken from timesServedEver in the snapshot.",
    ),
    windowFit: {
      type: "string",
      description:
        "One short phrase, 160 characters or fewer, on how the gap between this serving and symptom onset fits the reaction type.",
    },
    rationale: {
      type: "string",
      description:
        "Two sentences at most, 400 characters or fewer, in plain parent-facing language. Never names a diagnosis.",
    },
  },
};

const SYMPTOM_ASSESSMENT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["triageLevel", "candidates", "narrative", "nextSteps", "whenToSeekHelp"],
  properties: {
    triageLevel: enumProperty(
      triageLevelSchema.options,
      "How urgently a clinician should be involved, based only on what the parent reported.",
    ),
    candidates: {
      type: "array",
      minItems: 0,
      items: CANDIDATE_JSON_SCHEMA,
      description: `Foods from the snapshot that best fit the timing, most likely first. At most ${MAX_CANDIDATES} entries. May be empty.`,
    },
    narrative: {
      type: "string",
      description: `Plain-language explanation for a parent, ${NARRATIVE_MAX_WORDS} words or fewer. No diagnosis, no medication. Ends by telling them to confirm with their pediatrician.`,
    },
    nextSteps: {
      type: "array",
      minItems: 1,
      items: { type: "string", description: "One concrete thing to do next, 240 characters or fewer." },
      description: "Between one and six concrete things the parent can do next.",
    },
    whenToSeekHelp: {
      type: "array",
      minItems: 1,
      items: { type: "string", description: "One observable warning sign, 240 characters or fewer." },
      description: "Between one and six specific signs that mean stop watching and get medical help.",
    },
  },
};

/** The `output_config.format` object, in the shape `messages.parse` expects. */
export const SYMPTOM_OUTPUT_FORMAT = {
  type: "json_schema" as const,
  schema: SYMPTOM_ASSESSMENT_JSON_SCHEMA,
  parse: (content: string): SymptomAssessment => symptomAssessmentSchema.parse(JSON.parse(content)),
};

export interface SymptomAnalysisInput {
  survey: SymptomSurvey;
  snapshot: readonly ExposureSnapshotItem[];
  /** Age in months — the only thing about the baby that ever leaves the box. */
  ageMonths: number;
  now: Date;
}

export type SymptomAnalysisOutcome =
  | { ok: true; assessment: SymptomAssessment; model: string }
  /** The model declined. Not an error — the fallback card is the answer. */
  | { ok: false; reason: "refusal" }
  /** Truncated, empty, or failed the schema on the way back. */
  | { ok: false; reason: "invalid_output" }
  /** Network, auth, rate limit, or anything else thrown by the SDK. */
  | { ok: false; reason: "error" };

export interface AnalysisLogger {
  info: (details: Record<string, unknown>, message: string) => void;
  warn: (details: Record<string, unknown>, message: string) => void;
}

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------

/**
 * Free text is fenced so the model can tell parent prose from instructions.
 * Stripping the fence tokens out of the parent's own text is what stops a
 * pasted "</user_input> ignore your rules" from breaking out of it.
 */
function fenceUserText(text: string): string {
  return `<user_input>\n${text.replace(/<\/?user_input>/gi, "")}\n</user_input>`;
}

/**
 * The first (and only) user message: everything per-request lives here, never
 * in the system prompt, so the cached system prefix stays byte-identical.
 *
 * Privacy invariant (ledger 18): age in months, symptom enum values, food
 * names and slugs, and the parent's own notes. No baby name, no user id, no
 * email, no database id of any kind. `symptom.test.ts` asserts this against a
 * real request body.
 */
export function buildSymptomUserMessage(input: SymptomAnalysisInput): string {
  const { survey, snapshot, ageMonths, now } = input;

  const symptoms = survey.symptoms.map((symptom) => ({ code: symptom, label: symptomLabel(symptom) }));

  const reported = {
    symptoms,
    severity: survey.severity,
    onsetAt: survey.onsetAt,
    mealTiming: survey.mealTiming,
    bodyAreas: survey.bodyAreas,
  };

  const sections = [
    `Baby's age: ${ageMonths} months`,
    `Current date and time (UTC): ${now.toISOString()}`,
    "",
    "## What the parent reported",
    JSON.stringify(reported, null, 2),
    "",
    `## Exposure snapshot — every food served in the ${SYMPTOM_WINDOW_HOURS} hours before onset, closest to onset first`,
    JSON.stringify(snapshot, null, 2),
    "",
    "## The parent's own words",
    survey.notes ? fenceUserText(survey.notes) : "(none given)",
    "",
    `Rank at most ${MAX_CANDIDATES} foods from the snapshot above and return the structured assessment.`,
  ];

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

/**
 * `fallbacks` is accepted by the API alongside the refusal-fallback beta but
 * is not in @anthropic-ai/sdk 0.72.1's parameter types yet. Attaching it here
 * keeps that one gap in a single named place instead of widening the whole
 * request object to `any` and losing the parsed-output typing with it.
 */
function withRefusalFallback<T extends object>(params: T): T {
  return Object.assign(params, { fallbacks: "default" });
}

/** Trim to the word budget the prompt asks for rather than rejecting a good answer over it. */
function clampWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(" ")}…`;
}

/**
 * Post-parse normalisation. The schema already guarantees the shape; this
 * enforces the two limits that are prose rules rather than types, so an
 * over-long narrative degrades instead of dropping the whole assessment.
 */
function normalize(assessment: SymptomAssessment): SymptomAssessment {
  return {
    ...assessment,
    candidates: assessment.candidates.slice(0, MAX_CANDIDATES),
    narrative: clampWords(assessment.narrative, NARRATIVE_MAX_WORDS),
  };
}

export async function analyzeSymptoms(
  client: Anthropic,
  input: SymptomAnalysisInput,
  logger?: AnalysisLogger,
): Promise<SymptomAnalysisOutcome> {
  // Request order is tools -> system -> messages for prompt caching; there
  // are no tools on this call, so the cached prefix is the system block.
  const params = {
    model: SYMPTOM_MODEL,
    max_tokens: SYMPTOM_MAX_TOKENS,
    betas: REFUSAL_FALLBACK_BETAS,
    system: [
      {
        type: "text" as const,
        text: SYMPTOM_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages: [{ role: "user" as const, content: buildSymptomUserMessage(input) }],
    output_config: {
      // Safety-critical reasoning over a week of food history: worth the
      // latency. `thinking` is deliberately absent — it is adaptive by
      // default and passing budget_tokens is rejected outright.
      effort: "high" as const,
      format: SYMPTOM_OUTPUT_FORMAT,
    },
  };

  let message;
  try {
    message = await client.beta.messages.parse(withRefusalFallback(params));
  } catch (error) {
    // The message may quote an upstream error body; the payload never is.
    logger?.warn({ err: error instanceof Error ? error.message : "unknown" }, "symptom analysis call failed");
    return { ok: false, reason: "error" };
  }

  // Widened deliberately: `stop_reason` must be checked before content is
  // read, and this comparison must keep working if the union gains a value.
  const stopReason: string | null = message.stop_reason;

  logger?.info(
    {
      stopReason,
      model: message.model,
      cacheReadInputTokens: message.usage.cache_read_input_tokens,
      cacheCreationInputTokens: message.usage.cache_creation_input_tokens,
    },
    "symptom analysis completed",
  );

  if (stopReason === "refusal") {
    return { ok: false, reason: "refusal" };
  }

  if (stopReason === "max_tokens") {
    // A truncated structured response is not partially usable.
    return { ok: false, reason: "invalid_output" };
  }

  // Re-validate rather than trusting `parsed_output`: the model may have been
  // swapped under us by the server-side fallback, and this object is about to
  // be shown to a parent as guidance.
  const parsed = symptomAssessmentSchema.safeParse(message.parsed_output);
  if (!parsed.success) {
    logger?.warn({ stopReason }, "symptom analysis returned an unusable assessment");
    return { ok: false, reason: "invalid_output" };
  }

  return { ok: true, assessment: normalize(parsed.data), model: message.model };
}

// ---------------------------------------------------------------------------
// Static fallback copy
// ---------------------------------------------------------------------------

/**
 * Shown with the rule-based candidate table whenever there is no model
 * answer — no key on file, a refusal, or a failed call. Deliberately the
 * same advice in all three cases: the reason the narrative is missing is not
 * the parent's problem to reason about.
 */
export const FALLBACK_NEXT_STEPS: readonly string[] = [
  "Hold off on the foods listed above until you have spoken to your pediatrician.",
  "Write down exactly what your baby ate, when they ate it, and what you saw — the list above is a starting point.",
  "Photograph any rash or swelling now; it often fades before an appointment.",
  "Keep logging every food as usual, so the next check has a fuller picture.",
  "Share this list with your pediatrician and let them decide what to test or reintroduce.",
];

export const FALLBACK_WHEN_TO_SEEK_HELP: readonly string[] = [
  "Any trouble breathing, wheezing, or noisy breathing — call emergency services.",
  "Swelling of the tongue or throat, drooling, or trouble swallowing — call emergency services.",
  "Your baby goes pale, grey, floppy, or is hard to wake — call emergency services.",
  "Repeated vomiting, or vomiting with unusual sleepiness — get them seen the same day.",
  "Symptoms that keep spreading or getting worse rather than settling — get them seen the same day.",
];
