// Step 2, part 1: the exposure snapshot, and the deterministic ranking that
// stands in for the model when no API key is on file.
//
// The snapshot is the single body of evidence the whole feature reasons over:
// every food this baby was served in the 168 hours before symptom onset, with
// the three axes that matter — how new the food is, whether it is a top-9
// allergen, and how the gap between serving and onset fits the two reaction
// windows.
//
// Privacy invariant (ledger 18): a snapshot row carries food names, slugs,
// timestamps and allergen classes. No baby name, no user id, no row id. This
// object is passed verbatim into the model prompt, so nothing may be added
// here that would not be safe to send.
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Novelty, ReactionType, Symptom, SymptomCandidate, SymptomSurvey } from "@blw/shared";
import { MAX_CANDIDATES, SYMPTOM_WINDOW_HOURS, symptomEntry } from "@blw/shared";
import type { Database } from "../db/index.js";
import { allergens, foodAllergens, foods, serveLogs } from "../db/schema.js";

const HOUR_MS = 60 * 60 * 1000;

export interface ExposureSnapshotItem {
  foodSlug: string;
  foodName: string;
  /** ISO timestamp of this serving. */
  servedAt: string;
  /** Gap between this serving and symptom onset, one decimal place. */
  hoursBeforeOnset: number;
  /** Total servings of this food for this baby at or before onset. */
  timesServedEver: number;
  /** True when this particular serving is the food's first ever. */
  firstExposure: boolean;
  /**
   * Allergen slug, or null for a food with no allergen class. Every allergen
   * in this app's catalog is one of the top 9, so `isTop9` is the same
   * predicate expressed for the prompt's benefit.
   */
  allergenClass: string | null;
  isTop9: boolean;
}

/** How new a food is, from its lifetime serving count at onset. */
export function noveltyFor(timesServedEver: number): Novelty {
  if (timesServedEver <= 1) return "first_exposure";
  if (timesServedEver <= 3) return "second_or_third";
  return "established";
}

/**
 * Every serving in the 168h before `onsetAt`, closest to onset first.
 *
 * Servings after onset are excluded — a food eaten after the rash appeared
 * cannot have caused it, and including it would invite the model to say so.
 */
export async function buildExposureSnapshot(
  db: Database,
  babyId: string,
  onsetAt: Date,
): Promise<ExposureSnapshotItem[]> {
  const windowStart = new Date(onsetAt.getTime() - SYMPTOM_WINDOW_HOURS * HOUR_MS);

  const servings = await db
    .select({
      foodId: serveLogs.foodId,
      foodSlug: foods.slug,
      foodName: foods.name,
      servedAt: serveLogs.servedAt,
    })
    .from(serveLogs)
    .innerJoin(foods, eq(serveLogs.foodId, foods.id))
    .where(
      and(eq(serveLogs.babyId, babyId), lte(serveLogs.servedAt, onsetAt), gte(serveLogs.servedAt, windowStart)),
    )
    .orderBy(desc(serveLogs.servedAt));

  if (servings.length === 0) return [];

  const foodIds = [...new Set(servings.map((row) => row.foodId))];

  // Lifetime counts, not window counts: a food served daily for a month is
  // established even though only seven servings fall inside the window.
  const totals = await db
    .select({
      foodId: serveLogs.foodId,
      timesServed: sql<number>`count(*)::int`,
      firstServedAt: sql<string>`min(${serveLogs.servedAt})`,
    })
    .from(serveLogs)
    .where(
      and(eq(serveLogs.babyId, babyId), lte(serveLogs.servedAt, onsetAt), inArray(serveLogs.foodId, foodIds)),
    )
    .groupBy(serveLogs.foodId);

  const totalsByFoodId = new Map(totals.map((row) => [row.foodId, row]));

  const allergenRows = await db
    .select({ foodId: foodAllergens.foodId, slug: allergens.slug })
    .from(foodAllergens)
    .innerJoin(allergens, eq(foodAllergens.allergenId, allergens.id))
    .where(inArray(foodAllergens.foodId, foodIds));

  // A food can carry more than one allergen class (a wheat-and-sesame
  // cracker); the lowest slug alphabetically is picked so the value is
  // stable across runs rather than dependent on row order.
  const allergenByFoodId = new Map<string, string>();
  for (const row of allergenRows) {
    const existing = allergenByFoodId.get(row.foodId);
    if (existing === undefined || row.slug < existing) allergenByFoodId.set(row.foodId, row.slug);
  }

  return servings.map((row) => {
    const total = totalsByFoodId.get(row.foodId);
    const timesServedEver = total?.timesServed ?? 1;
    const firstServedMs = total?.firstServedAt ? new Date(total.firstServedAt).getTime() : row.servedAt.getTime();
    const allergenClass = allergenByFoodId.get(row.foodId) ?? null;

    return {
      foodSlug: row.foodSlug,
      foodName: row.foodName,
      servedAt: row.servedAt.toISOString(),
      hoursBeforeOnset: roundTo1((onsetAt.getTime() - row.servedAt.getTime()) / HOUR_MS),
      timesServedEver,
      firstExposure: row.servedAt.getTime() === firstServedMs,
      allergenClass,
      isTop9: allergenClass !== null,
    };
  });
}

function roundTo1(value: number): number {
  return Math.round(value * 10) / 10;
}

// ---------------------------------------------------------------------------
// Deterministic ranking (the no-key path, and the fallback when a call fails)
// ---------------------------------------------------------------------------

/** First exposure outranks a food the baby has eaten happily for weeks. */
const NOVELTY_WEIGHT: Record<Novelty, number> = {
  first_exposure: 3,
  second_or_third: 2,
  established: 0.5,
};

const TOP9_WEIGHT = 3;
const OTHER_FOOD_WEIGHT = 1;

/** IgE-type reactions cluster in the first two hours. */
function immediateWindowFit(hours: number): number {
  if (hours <= 2) return 1;
  if (hours <= 6) return 0.4;
  if (hours <= 24) return 0.15;
  return 0.05;
}

/** FPIES and other delayed patterns run 2-72h, most often 1-4h. */
function delayedWindowFit(hours: number): number {
  if (hours >= 2 && hours <= 72) return 1;
  if (hours < 2) return 0.5;
  if (hours <= 120) return 0.3;
  return 0.1;
}

/**
 * How much each reaction window counts for this survey.
 *
 * Both windows are always scored — a parent who reports only diarrhoea may
 * well have missed an earlier rash — but the one the reported symptoms point
 * at counts nearly three times as much. That ratio matters: it is what keeps
 * a serving three hours before a hives-only report described as immediate
 * timing that ran late, rather than being relabelled a delayed reaction
 * purely because 3h happens to sit inside the wider window.
 */
const UNREPORTED_WINDOW_WEIGHT = 0.35;

function windowWeights(symptoms: readonly Symptom[]): { immediate: number; delayed: number } {
  const timings = symptoms.map((symptom) => symptomEntry(symptom).timing);
  return {
    immediate: timings.includes("immediate") ? 1 : UNREPORTED_WINDOW_WEIGHT,
    delayed: timings.includes("delayed") ? 1 : UNREPORTED_WINDOW_WEIGHT,
  };
}

function formatGap(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} minutes`;
  const value = hours < 10 ? roundTo1(hours) : Math.round(hours);
  return `${value} ${value === 1 ? "hour" : "hours"}`;
}

function windowFitText(hours: number, reactionType: ReactionType): string {
  const gap = formatGap(hours);
  if (reactionType === "ige_immediate") {
    return hours <= 2
      ? `Served ${gap} before symptoms — inside the minutes-to-2-hours window for immediate reactions.`
      : `Served ${gap} before symptoms — later than the usual minutes-to-2-hours immediate window.`;
  }
  if (reactionType === "delayed_or_fpies") {
    return hours >= 2 && hours <= 72
      ? `Served ${gap} before symptoms — inside the 2-72 hour window for delayed reactions.`
      : `Served ${gap} before symptoms — outside the usual 2-72 hour delayed window.`;
  }
  return `Served ${gap} before symptoms — the timing does not clearly favour an immediate or a delayed pattern.`;
}

function likelihoodFor(score: number): SymptomCandidate["likelihood"] {
  if (score >= 4.5) return "high";
  if (score >= 1.5) return "medium";
  return "low";
}

function rationaleFor(item: ExposureSnapshotItem, novelty: Novelty, reactionType: ReactionType): string {
  const noveltyPhrase =
    novelty === "first_exposure"
      ? "was the first time your baby had eaten it"
      : novelty === "second_or_third"
        ? `had only been eaten ${item.timesServedEver} times before`
        : "is already an established food for your baby";

  const allergenPhrase = item.allergenClass
    ? ` It is a top-9 allergen (${item.allergenClass.replace(/_/g, " ")}), which is where new reactions usually come from.`
    : " It is not one of the top-9 allergens.";

  const timingPhrase =
    reactionType === "ige_immediate"
      ? " The gap to symptoms fits immediate-type timing."
      : reactionType === "delayed_or_fpies"
        ? " The gap to symptoms fits delayed-type timing."
        : " The gap to symptoms does not point clearly at either pattern.";

  return `${item.foodName} ${noveltyPhrase}.${allergenPhrase}${timingPhrase}`;
}

interface ScoredCandidate {
  score: number;
  candidate: SymptomCandidate;
}

/**
 * The rule-based ranking used whenever the model is not in play. Same output
 * shape as the model's `candidates`, so the UI renders one card component
 * either way and a parent without a key still gets the useful part.
 *
 * Score = novelty weight x allergen weight x best window fit. Both reaction
 * windows are scored and the better one is kept, which is also what decides
 * the reported `reactionType`.
 */
export function rankFallbackCandidates(
  snapshot: readonly ExposureSnapshotItem[],
  survey: Pick<SymptomSurvey, "symptoms">,
): SymptomCandidate[] {
  const weights = windowWeights(survey.symptoms);
  const bestByFood = new Map<string, ScoredCandidate>();

  for (const item of snapshot) {
    const novelty = noveltyFor(item.timesServedEver);
    const immediate = immediateWindowFit(item.hoursBeforeOnset) * weights.immediate;
    const delayed = delayedWindowFit(item.hoursBeforeOnset) * weights.delayed;

    const windowScore = Math.max(immediate, delayed);
    const reactionType: ReactionType =
      immediate === delayed ? "unclear" : immediate > delayed ? "ige_immediate" : "delayed_or_fpies";

    const score = NOVELTY_WEIGHT[novelty] * (item.isTop9 ? TOP9_WEIGHT : OTHER_FOOD_WEIGHT) * windowScore;

    const scored: ScoredCandidate = {
      score,
      candidate: {
        foodSlug: item.foodSlug,
        foodName: item.foodName,
        likelihood: likelihoodFor(score),
        reactionType,
        novelty,
        windowFit: windowFitText(item.hoursBeforeOnset, reactionType),
        rationale: rationaleFor(item, novelty, reactionType),
      },
    };

    // One row per food: the serving that fits best represents it.
    const existing = bestByFood.get(item.foodSlug);
    if (!existing || scored.score > existing.score) bestByFood.set(item.foodSlug, scored);
  }

  return [...bestByFood.values()]
    .sort((a, b) => b.score - a.score || a.candidate.foodName.localeCompare(b.candidate.foodName))
    .slice(0, MAX_CANDIDATES)
    .map((entry) => entry.candidate);
}
