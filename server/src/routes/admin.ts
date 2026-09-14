// The admin surface: the metrics dashboard's data, and who may see it.
//
// Invariants this file exists to hold:
//
//   * **Nothing here exists for a non-admin.** Every route sits behind
//     `requireAdmin`, which answers through the app's own not-found handler.
//     Anonymous caller, signed-in parent, typo'd URL — one answer, the same
//     bytes. The per-user budget is installed AFTER that guard on purpose: a
//     429 from a route a parent cannot see would tell them it is there.
//   * **Aggregates only.** `/api/admin/metrics` returns counts and ratios.
//     The one place an address appears in this file is the collaborators
//     list — admins, shown to admins — which is what that list is for.
//   * **Granting access is a fresh-session action.** Same reasoning as
//     account deletion: a stolen, still-valid cookie must not be enough to
//     hand somebody else the dashboard. Every grant and revoke is written to
//     `admin_audit`, which survives the deletion of either account.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  ACCOUNT_REAUTH_MAX_AGE_MS,
  adminMetricsResponseSchema,
  grantCollaboratorInputSchema,
  metricsRangeSchema,
  type AdminCollaborator,
  type AdminMeResponse,
  type MetricsRange,
} from "@blw/shared";
import {
  ADMIN_ROLE,
  PARENT_ROLE,
  createRequireAdmin,
  currentAdmin,
  isEnvAdmin,
  normalizeEmail,
} from "../admin/access.js";
import { createPerUserRateLimit, perUserRateLimitHook } from "../ai/client.js";
import type { Env } from "../config.js";
import type { Database } from "../db/index.js";
import { createMetricsCache } from "../metrics/collect.js";
import { adminAudit, session, user } from "../db/schema.js";

/**
 * Per-admin hourly budget for the whole surface. Generous — this is a person
 * with a dashboard open, and the expensive route is cached for five minutes
 * anyway — but finite, because an admin session is still a session.
 */
const ADMIN_REQUESTS_PER_HOUR = 120;

/**
 * Tighter budget for the two routes that change who has access. Grants are
 * rare, deliberate and irreversible-ish; a script hammering them is not a
 * use case, it is an incident.
 */
const ADMIN_WRITES_PER_WINDOW = 10;
const ADMIN_WRITE_WINDOW_MS = 15 * 60 * 1000;

/** Default when `?range=` is absent: a quarter is what the review looks at. */
const DEFAULT_RANGE: MetricsRange = "12w";

interface CollaboratorRow {
  id: string;
  email: string;
  role: string;
}

interface GrantRecord {
  at: Date;
  actorEmail: string | null;
}

export function registerAdminRoutes(app: FastifyInstance, db: Database, env: Env): void {
  const requireAdmin = createRequireAdmin(db, env);
  const budget = perUserRateLimitHook(createPerUserRateLimit(ADMIN_REQUESTS_PER_HOUR));
  const writeBudget = perUserRateLimitHook(
    createPerUserRateLimit(ADMIN_WRITES_PER_WINDOW, ADMIN_WRITE_WINDOW_MS),
  );
  const metricsCache = createMetricsCache();

  // resolveOptionalUser, not requireAuth: a 401 would announce the route.
  const guards = [app.resolveOptionalUser, requireAdmin, budget];
  const writeGuards = [...guards, writeBudget];

  /**
   * Freshness, reusing the account-deletion rule (shared/src/account.ts).
   * Only the session-age half of that pattern applies here: unlike deletion
   * this action is undoable by another admin, and asking for a password on
   * every grant would push people towards leaving the window open instead.
   */
  async function hasFreshSession(request: FastifyRequest, userId: string): Promise<boolean> {
    const sessionId = request.sessionId;
    if (!sessionId) return false;

    const [row] = await db
      .select({ createdAt: session.createdAt })
      .from(session)
      .where(and(eq(session.id, sessionId), eq(session.userId, userId)))
      .limit(1);

    if (!row) return false;
    return Date.now() - row.createdAt.getTime() <= ACCOUNT_REAUTH_MAX_AGE_MS;
  }

  /**
   * Everybody who can open the dashboard, from both sources of admin.
   *
   * Built from three reads rather than one join, because the two sources
   * answer different questions: the role column says who was granted access
   * here, `ADMIN_EMAILS` says who the deployment trusts (including somebody
   * who has not signed up yet, and therefore has no row at all), and
   * `admin_audit` says when and by whom.
   */
  async function listCollaborators(selfId: string): Promise<AdminCollaborator[]> {
    const byRole = await db
      .select({ id: user.id, email: user.email, role: user.role })
      .from(user)
      .where(eq(user.role, ADMIN_ROLE))
      .orderBy(asc(user.email));

    const byEnv: CollaboratorRow[] = env.ADMIN_EMAILS.length
      ? await db
          .select({ id: user.id, email: user.email, role: user.role })
          .from(user)
          .where(inArray(sql`lower(${user.email})`, env.ADMIN_EMAILS))
      : [];

    // Latest grant per target, with the granting admin's address resolved.
    // `distinct on` is core Postgres and runs on PGlite too.
    const auditResult = await db.execute(sql`
      select distinct on (a.target_user_id)
        a.target_user_id as target_user_id, a.at as at, actor.email as actor_email
      from ${adminAudit} a
      left join ${user} actor on actor.id = a.actor_user_id
      where a.action = 'grant' and a.target_user_id is not null
      order by a.target_user_id, a.at desc
    `);
    const auditRows = (
      auditResult as unknown as {
        rows: { target_user_id: string; at: Date; actor_email: string | null }[];
      }
    ).rows;

    const grants = new Map<string, GrantRecord>(
      auditRows.map((row) => [row.target_user_id, { at: new Date(row.at), actorEmail: row.actor_email }]),
    );

    // Keyed by normalised address so somebody who is BOTH env-listed and
    // role=admin appears once, as the stronger of the two.
    const merged = new Map<string, AdminCollaborator>();

    const add = (row: CollaboratorRow | { id: null; email: string; role: null }): void => {
      const key = normalizeEmail(row.email);
      const fromEnv = isEnvAdmin(row.email, env);
      const grant = row.id ? grants.get(row.id) : undefined;
      const isSelf = row.id !== null && row.id === selfId;
      merged.set(key, {
        userId: row.id,
        email: row.email,
        source: fromEnv ? "env" : "database",
        grantedAt: fromEnv ? null : (grant?.at.toISOString() ?? null),
        grantedBy: fromEnv ? null : (grant?.actorEmail ?? null),
        isSelf,
        // An env admin stays an admin whatever the row says, and nobody may
        // remove their own access — both are re-checked server-side.
        canRevoke: !fromEnv && !isSelf && row.id !== null,
      });
    };

    for (const row of byRole) add(row);
    for (const row of byEnv) add(row);
    // Env addresses with no account yet: trusted by the deployment, invisible
    // to the two queries above, and worth showing so the list is the truth.
    for (const email of env.ADMIN_EMAILS) {
      if (!merged.has(normalizeEmail(email))) add({ id: null, email, role: null });
    }

    return [...merged.values()].sort((a, b) => a.email.localeCompare(b.email));
  }

  // -----------------------------------------------------------------------
  // GET /api/admin/me — the client's "is there a dashboard for me" probe
  // -----------------------------------------------------------------------
  app.get("/api/admin/me", { preHandler: guards }, async (_request, reply) => {
    const body: AdminMeResponse = { admin: true };
    // Never a shared cache: the answer is per-person, and a cached "yes"
    // in front of somebody else would be an access-control bug.
    return reply.header("cache-control", "no-store").send(body);
  });

  // -----------------------------------------------------------------------
  // GET /api/admin/metrics — every panel, cached five minutes per range
  // -----------------------------------------------------------------------
  app.get("/api/admin/metrics", { preHandler: guards }, async (request, reply) => {
    const { range } = request.query as { range?: string };
    const parsed = range === undefined ? { success: true as const, data: DEFAULT_RANGE } : metricsRangeSchema.safeParse(range);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const payload = await metricsCache.read(db, parsed.data, new Date());
    // Parsed on the way out in development and test: the panels are hand
    // written SQL, and a shape that drifts from the contract should fail
    // here rather than in a chart.
    if (env.NODE_ENV !== "production") {
      adminMetricsResponseSchema.parse(payload);
    }
    return reply.header("cache-control", "no-store").send(payload);
  });

  // -----------------------------------------------------------------------
  // GET /api/admin/collaborators — who has access, and how
  // -----------------------------------------------------------------------
  app.get("/api/admin/collaborators", { preHandler: guards }, async (request, reply) => {
    const admin = currentAdmin(request);
    return reply
      .header("cache-control", "no-store")
      .send({ collaborators: await listCollaborators(admin.id) });
  });

  // -----------------------------------------------------------------------
  // POST /api/admin/collaborators — grant by email
  // -----------------------------------------------------------------------
  app.post("/api/admin/collaborators", { preHandler: writeGuards }, async (request, reply) => {
    const admin = currentAdmin(request);

    const parsed = grantCollaboratorInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    if (!(await hasFreshSession(request, admin.id))) {
      // The UI turns this into "sign in again, then add somebody".
      return reply.code(401).send({ error: "reauth_required" });
    }

    const email = normalizeEmail(parsed.data.email);
    const [target] = await db
      .select({ id: user.id, email: user.email, role: user.role })
      .from(user)
      .where(eq(sql`lower(${user.email})`, email))
      .limit(1);

    if (!target) {
      // Visible ONLY to an admin, who is already past the 404 guard — the
      // existence of a parent's address is never revealed to anybody else,
      // because nobody else can reach this line. An admin does need to be
      // told the difference between "typo" and "they have not signed up".
      return reply.code(404).send({ error: "unknown_user" });
    }

    if (target.role !== ADMIN_ROLE) {
      await db.transaction(async (tx) => {
        await tx.update(user).set({ role: ADMIN_ROLE }).where(eq(user.id, target.id));
        await tx.insert(adminAudit).values({
          actorUserId: admin.id,
          action: "grant",
          targetUserId: target.id,
        });
      });
    }

    return reply
      .header("cache-control", "no-store")
      .send({ collaborators: await listCollaborators(admin.id) });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/admin/collaborators/:userId — revoke
  // -----------------------------------------------------------------------
  app.delete<{ Params: { userId: string } }>(
    "/api/admin/collaborators/:userId",
    { preHandler: writeGuards },
    async (request, reply) => {
      const admin = currentAdmin(request);

      if (!(await hasFreshSession(request, admin.id))) {
        return reply.code(401).send({ error: "reauth_required" });
      }

      const targetId = request.params.userId;
      const [target] = await db
        .select({ id: user.id, email: user.email, role: user.role })
        .from(user)
        .where(eq(user.id, targetId))
        .limit(1);

      if (!target) {
        return reply.code(404).send({ error: "unknown_user" });
      }

      if (target.id === admin.id) {
        // Locking yourself out is a mistake nobody makes on purpose, and the
        // recovery for it is an environment edit and a redeploy.
        return reply.code(400).send({ error: "cannot_demote_self" });
      }

      if (isEnvAdmin(target.email, env)) {
        // Clearing the row would change nothing: `ADMIN_EMAILS` would still
        // let them in. Saying so is better than a button that appears to work.
        return reply.code(400).send({ error: "env_admin" });
      }

      if (target.role === ADMIN_ROLE) {
        await db.transaction(async (tx) => {
          await tx.update(user).set({ role: PARENT_ROLE }).where(eq(user.id, target.id));
          await tx.insert(adminAudit).values({
            actorUserId: admin.id,
            action: "revoke",
            targetUserId: target.id,
          });
        });
      }

      return reply
        .header("cache-control", "no-store")
        .send({ collaborators: await listCollaborators(admin.id) });
    },
  );
}
