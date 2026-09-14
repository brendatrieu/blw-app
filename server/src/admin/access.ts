// Who may see the metrics dashboard, and how everybody else is told that it
// does not exist.
//
// Three decisions live here, and each one is load-bearing:
//
//   * **Two independent sources of admin.** `ADMIN_EMAILS` (env) is what lets
//     the owner in on a fresh deployment with no database write, and what
//     lets access be revoked by editing a file when a row cannot be trusted.
//     `user.role` is what the Access panel grants. Either is sufficient;
//     neither can be removed by the other.
//   * **404, not 403.** A 403 confirms the route exists. Every refusal here
//     goes through the app's own not-found handler, so an anonymous prober,
//     a signed-in parent and a typo'd URL get the same status, the same body
//     and the same headers.
//   * **The role is read from the database, not from the session.** The
//     better-auth admin plugin is deliberately not enabled (see
//     db/schema.ts), so `request.user` carries no role at all. One indexed
//     primary-key lookup per admin request is the price, and it means a
//     revoked admin loses access on their next request rather than whenever
//     their session happens to be refreshed.
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import type { Env } from "../config.js";
import type { Database } from "../db/index.js";
import { user } from "../db/schema.js";

/** The value `user.role` carries for an admin. Everybody else is "parent". */
export const ADMIN_ROLE = "admin";
/** The default the column was created with. */
export const PARENT_ROLE = "parent";

/**
 * Just enough of a user to answer the question. Deliberately structural
 * rather than `AuthUser`: the role comes from our own column and the email
 * from wherever the caller has it, and a pure function should not need a
 * session object to decide.
 */
export interface AdminIdentity {
  email?: string | null;
  role?: string | null;
}

/** Emails are compared case-insensitively and untrimmed input is normalised,
 * because an address typed into `ADMIN_EMAILS` by hand will have a stray
 * space or a capital letter in it sooner or later. */
export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** True when this address is bootstrapped as an admin by the environment. */
export function isEnvAdmin(email: string | null | undefined, env: Pick<Env, "ADMIN_EMAILS">): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  // config.ts already lowercases and trims the list; normalising again here
  // keeps this function correct for a hand-built env in a test.
  return env.ADMIN_EMAILS.some((entry) => normalizeEmail(entry) === normalized);
}

/**
 * The whole access rule, as one pure function: an admin is somebody whose
 * role column says so, OR whose address is in `ADMIN_EMAILS`.
 *
 * Pure so it can be tested exhaustively without a database, a session or an
 * app — which is what makes "did we get the access rule right" a question
 * with a short answer.
 */
export function isAdmin(identity: AdminIdentity | null | undefined, env: Pick<Env, "ADMIN_EMAILS">): boolean {
  if (!identity) return false;
  if (identity.role === ADMIN_ROLE) return true;
  return isEnvAdmin(identity.email, env);
}

/** The admin resolved for this request, attached by `requireAdmin`. */
export interface AdminContext {
  id: string;
  email: string;
  role: string;
  /** True when the environment is what makes them an admin. */
  fromEnv: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Set by `requireAdmin`; null on every other route. */
    admin: AdminContext | null;
  }
}

/**
 * The refusal. Routed through Fastify's own not-found handler rather than
 * through a hand-written 404, so `/api/admin/me` and `/api/admin/nonsense`
 * cannot drift apart: whatever the app answers for a URL that was never
 * registered is exactly what a non-admin gets here, body and headers
 * included. A test diffs the two responses.
 */
export function refuseAsUnknownRoute(reply: FastifyReply): void {
  reply.callNotFound();
}

/**
 * Builds the `/api/admin/*` guard.
 *
 * Must run AFTER `app.resolveOptionalUser` in a route's preHandler chain —
 * not `requireAuth`, which would answer 401 and thereby announce that
 * something lives at this URL.
 */
export function createRequireAdmin(db: Database, env: Env): preHandlerAsyncHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionUser = request.user;
    if (!sessionUser) {
      refuseAsUnknownRoute(reply);
      return reply;
    }

    const [row] = await db
      .select({ email: user.email, role: user.role })
      .from(user)
      .where(eq(user.id, sessionUser.id))
      .limit(1);

    // No row is the account-deleted-mid-request race; it is also not an admin.
    if (!row || !isAdmin(row, env)) {
      refuseAsUnknownRoute(reply);
      return reply;
    }

    request.admin = {
      id: sessionUser.id,
      email: row.email,
      role: row.role,
      fromEnv: isEnvAdmin(row.email, env),
    };
    return undefined;
  };
}

/** Registers the `request.admin` decorator. Called once, from app.ts. */
export function decorateAdminRequest(app: FastifyInstance): void {
  app.decorateRequest("admin", null);
}

/**
 * Every handler behind `requireAdmin`; this makes the non-null assumption
 * explicit rather than sprinkling `?.` through the routes.
 */
export function currentAdmin(request: FastifyRequest): AdminContext {
  const admin = request.admin;
  if (!admin) {
    throw new Error("currentAdmin called on a request that did not pass requireAdmin");
  }
  return admin;
}
