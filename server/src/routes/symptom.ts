// POST /api/ai/symptom-check and GET /api/babies/:babyId/symptom-checks.
//
// The route is the place the three-branch contract is enforced:
//
//   triage   — a red flag was reported. Persisted, returned, and the model is
//              never contacted. This branch must stay reachable with no key,
//              no network, and no Anthropic account at all.
//   fallback — no key on file, or the call refused/failed. The deterministic
//              ranking over the same snapshot, plus static guidance.
//   ai       — the structured assessment, schema-checked, from the caller's
//              own key.
//
// Every branch is written to `symptom_checks` before the response is sent, so
// the history list and the audit trail see exactly what the parent saw.
import type Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  SYMPTOM_DISCLAIMER,
  SYMPTOM_WINDOW_HOURS,
  ageInMonths,
  babyIdRouteParamSchema,
  symptomCheckRequestSchema,
  symptomResultSchema,
  symptomSurveySchema,
  type SymptomCheckHistoryItem,
  type SymptomCheckHistoryResponse,
  type SymptomCheckResponse,
  type SymptomFallbackResult,
  type SymptomResult,
  type SymptomSurvey,
  type TriageLevel,
} from "@blw/shared";
import type { Database } from "../db/index.js";
import { babies, symptomChecks } from "../db/schema.js";
import { notFound } from "../plugins/auth.js";
import { buildExposureSnapshot, rankFallbackCandidates, type ExposureSnapshotItem } from "../ai/snapshot.js";
import {
  FALLBACK_NEXT_STEPS,
  FALLBACK_WHEN_TO_SEEK_HELP,
  analyzeSymptoms,
  type SymptomAnalysisOutcome,
} from "../ai/symptom.js";
import { runTriage } from "../ai/triage.js";

const HISTORY_LIMIT = 20;

export interface SymptomRoutesOptions {
  /**
   * Injectable so tests never construct a real Anthropic client. Defaults to
   * the `app.anthropicForUser` decorator installed by the AI-key routes,
   * resolved lazily so registration order inside `app.after()` does not
   * matter.
   */
  anthropicForUser?: (userId: string) => Promise<Anthropic | null>;
}

function badRequest(reply: FastifyReply, details: unknown): FastifyReply {
  return reply.code(400).send({ error: "invalid_request", details });
}

/** Every handler here sits behind requireAuth; this makes that explicit. */
function currentUserId(request: FastifyRequest): string {
  const id = request.user?.id;
  if (!id) {
    throw new Error("currentUserId called on an unauthenticated request");
  }
  return id;
}

/**
 * A fallback result is stored as `contact_doctor_24h` rather than a level
 * derived from the ranking. The ranking is a timing coincidence, not a triage
 * judgement, and the card it renders tells the parent to take the list to
 * their pediatrician — so the stored level matches what they were actually
 * told.
 */
const FALLBACK_TRIAGE_LEVEL: TriageLevel = "contact_doctor_24h";

function buildFallback(
  snapshot: readonly ExposureSnapshotItem[],
  survey: SymptomSurvey,
  reason: SymptomFallbackResult["reason"],
): SymptomFallbackResult {
  return {
    kind: "fallback",
    reason,
    triageLevel: FALLBACK_TRIAGE_LEVEL,
    candidates: rankFallbackCandidates(snapshot, survey),
    nextSteps: [...FALLBACK_NEXT_STEPS],
    whenToSeekHelp: [...FALLBACK_WHEN_TO_SEEK_HELP],
    disclaimer: SYMPTOM_DISCLAIMER,
  };
}

export function registerSymptomRoutes(app: FastifyInstance, db: Database, options: SymptomRoutesOptions = {}): void {
  const anthropicForUser = options.anthropicForUser ?? ((userId: string) => app.anthropicForUser(userId));

  // -----------------------------------------------------------------------
  // POST /api/ai/symptom-check
  //
  // Under /api/ai/, so the shared 20/hour/user budget installed by
  // registerAiKeyRoutes applies automatically — this module must therefore be
  // registered after that one in app.ts.
  // -----------------------------------------------------------------------
  app.post("/api/ai/symptom-check", { preHandler: app.requireAuth }, async (request, reply) => {
    const body = symptomCheckRequestSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, body.error.flatten());

    const { babyId, survey } = body.data;

    const [baby] = await db
      .select({ id: babies.id, birthDate: babies.birthDate })
      .from(babies)
      .where(and(eq(babies.id, babyId), eq(babies.userId, currentUserId(request))))
      .limit(1);
    if (!baby) return notFound(reply);

    // ------------------------------------------------------------------
    // Step 1 — deterministic triage. Nothing above this line touched the
    // network, and nothing below it runs if a red flag fired.
    // ------------------------------------------------------------------
    const triage = runTriage(survey);
    if (triage.level !== "none") {
      const result: SymptomResult = {
        kind: "triage",
        level: triage.level,
        reasons: triage.reasons,
        whileWaiting: triage.whileWaiting,
        disclaimer: SYMPTOM_DISCLAIMER,
      };
      const saved = await persist(db, babyId, survey, [], triage.level, result, null);
      return reply.code(201).send(saved);
    }

    // ------------------------------------------------------------------
    // Step 2 — the exposure snapshot, then the model if a key is on file.
    // ------------------------------------------------------------------
    const onsetAt = new Date(survey.onsetAt);
    const snapshot = await buildExposureSnapshot(db, babyId, onsetAt);

    const client = await anthropicForUser(currentUserId(request));
    if (!client) {
      // Not a 403: the symptom checker is the one AI surface that is fully
      // useful without a key, so a missing key is a quieter answer, not a
      // locked door.
      const result = buildFallback(snapshot, survey, "no_ai_key");
      return reply.code(201).send(await persist(db, babyId, survey, snapshot, FALLBACK_TRIAGE_LEVEL, result, null));
    }

    const outcome: SymptomAnalysisOutcome = await analyzeSymptoms(
      client,
      { survey, snapshot, ageMonths: ageInMonths(baby.birthDate), now: new Date() },
      request.log,
    );

    if (!outcome.ok) {
      const result = buildFallback(snapshot, survey, "ai_unavailable");
      return reply.code(201).send(await persist(db, babyId, survey, snapshot, FALLBACK_TRIAGE_LEVEL, result, null));
    }

    const result: SymptomResult = {
      kind: "ai",
      ...outcome.assessment,
      disclaimer: SYMPTOM_DISCLAIMER,
    };
    return reply
      .code(201)
      .send(await persist(db, babyId, survey, snapshot, outcome.assessment.triageLevel, result, outcome.model));
  });

  // -----------------------------------------------------------------------
  // GET /api/babies/:babyId/symptom-checks — history
  //
  // Deliberately not under /api/ai/: it is a database read that costs the
  // user nothing, and it must stay available when the AI budget is spent.
  // -----------------------------------------------------------------------
  app.get("/api/babies/:babyId/symptom-checks", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = babyIdRouteParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);

    const [baby] = await db
      .select({ id: babies.id })
      .from(babies)
      .where(and(eq(babies.id, params.data.babyId), eq(babies.userId, currentUserId(request))))
      .limit(1);
    if (!baby) return notFound(reply);

    const rows = await db
      .select({
        id: symptomChecks.id,
        createdAt: symptomChecks.createdAt,
        triageLevel: symptomChecks.triageLevel,
        survey: symptomChecks.survey,
        result: symptomChecks.result,
      })
      .from(symptomChecks)
      .where(eq(symptomChecks.babyId, params.data.babyId))
      .orderBy(desc(symptomChecks.createdAt))
      .limit(HISTORY_LIMIT);

    const items: SymptomCheckHistoryItem[] = [];
    for (const row of rows) {
      // Rows written by an older shape of this feature are skipped rather
      // than crashing the list or being rendered half-parsed.
      const survey = symptomSurveySchema.safeParse(row.survey);
      const result = symptomResultSchema.safeParse(row.result);
      if (!survey.success || !result.success) continue;

      items.push({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        triageLevel: row.triageLevel,
        symptoms: survey.data.symptoms,
        severity: survey.data.severity,
        onsetAt: survey.data.onsetAt,
        result: result.data,
      });
    }

    return reply.send({ items } satisfies SymptomCheckHistoryResponse);
  });
}

async function persist(
  db: Database,
  babyId: string,
  survey: SymptomSurvey,
  snapshot: readonly ExposureSnapshotItem[],
  triageLevel: TriageLevel,
  result: SymptomResult,
  model: string | null,
): Promise<SymptomCheckResponse> {
  const inserted = await db
    .insert(symptomChecks)
    .values({
      babyId,
      survey,
      // Zero when Step 1 short-circuited: no snapshot was built, so claiming
      // a 168h window in the audit row would be a lie.
      windowHours: snapshot.length === 0 && result.kind === "triage" ? 0 : SYMPTOM_WINDOW_HOURS,
      foodsConsidered: snapshot,
      triageLevel,
      result,
      model,
    })
    .returning();

  const row = inserted[0];
  if (!row) {
    throw new Error("Insert of symptom check returned no row");
  }

  return { id: row.id, createdAt: row.createdAt.toISOString(), result };
}
