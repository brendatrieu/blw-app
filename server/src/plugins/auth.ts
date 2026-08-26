import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import type { AuthConfig } from "@blw/shared";
import type { Auth, AuthUser } from "../auth.js";
import type { Env } from "../config.js";
import { isGoogleEnabled } from "../config.js";
import { authRateLimitConfig } from "./rate-limit.js";
import { registerDevAutoAuth } from "./dev-auth.js";

declare module "fastify" {
  interface FastifyInstance {
    /** The better-auth instance backing `/api/auth/*`. */
    auth: Auth;
    /** Resolves the caller's session or rejects the request with 401. */
    requireAuth: preHandlerAsyncHookHandler;
  }

  interface FastifyRequest {
    /**
     * The authenticated user, or `null` on anonymous requests. Only routes
     * behind `app.requireAuth` may assume this is non-null.
     */
    user: AuthUser | null;
    /** Session id of the current request, useful for audit logging. */
    sessionId: string | null;
  }
}

export interface RegisterAuthOptions {
  auth: Auth;
  env: Env;
}

/**
 * Mounts better-auth on Fastify and exposes the session helpers.
 *
 * A plain function, not `app.register()`: decorators and the `requireAuth`
 * hook must live at the root scope so routes declared in sibling modules can
 * use them without the encapsulation dance.
 */
export function registerAuth(app: FastifyInstance, { auth, env }: RegisterAuthOptions): void {
  app.decorate("auth", auth);
  app.decorateRequest("user", null);
  app.decorateRequest("sessionId", null);

  // Development convenience, installed before anything reads a session so it
  // covers both `requireAuth` and the `/api/auth/*` handler below from one
  // place. A no-op unless NODE_ENV === "development" — see dev-auth.ts.
  registerDevAutoAuth(app, { auth, env });

  /**
   * Resolves the session directly through better-auth's server API rather
   * than an internal HTTP round trip, so it is not affected by the auth
   * route's rate limit.
   */
  const resolveSession = async (request: FastifyRequest) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    request.user = session?.user ?? null;
    request.sessionId = session?.session.id ?? null;
    return session;
  };

  const requireAuth: preHandlerAsyncHookHandler = async (request, reply) => {
    const session = await resolveSession(request);
    if (!session) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    return undefined;
  };

  app.decorate("requireAuth", requireAuth);

  // ---------------------------------------------------------------------
  // better-auth HTTP handler
  // ---------------------------------------------------------------------
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    config: authRateLimitConfig(env),
    async handler(request: FastifyRequest, reply: FastifyReply) {
      const url = new URL(request.url, env.BETTER_AUTH_URL);
      const headers = fromNodeHeaders(request.headers);

      const init: RequestInit = { method: request.method, headers };
      if (request.body !== undefined && request.body !== null && request.method !== "GET") {
        init.body = JSON.stringify(request.body);
      }

      const response = await auth.handler(new Request(url.toString(), init));

      reply.status(response.status);

      // `Headers.forEach` folds repeated Set-Cookie values into one comma
      // joined string, which browsers then parse as a single malformed
      // cookie. getSetCookie() keeps them as separate header lines.
      const setCookie = response.headers.getSetCookie();
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() === "set-cookie") return;
        reply.header(key, value);
      });
      if (setCookie.length > 0) {
        reply.header("set-cookie", setCookie);
      }

      return reply.send(response.body ? await response.text() : null);
    },
  });

  // ---------------------------------------------------------------------
  // Capability probe for the sign-in UI
  // ---------------------------------------------------------------------
  // Lets the client disable "Continue with Google" with an explanation
  // instead of sending the user into a redirect the server cannot complete.
  app.get("/api/auth-config", async (): Promise<AuthConfig> => {
    return { googleEnabled: isGoogleEnabled(env) };
  });
}

/**
 * Ownership guard shared by every user-owned resource: a row that exists but
 * belongs to somebody else is reported exactly like a row that does not
 * exist, so the API never confirms the existence of another account's data.
 */
export function notFound(reply: FastifyReply): FastifyReply {
  return reply.code(404).send({ error: "not_found" });
}
