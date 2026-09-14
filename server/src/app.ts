import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { sql } from "drizzle-orm";
import type { DeepHealthResponse, HealthResponse } from "@blw/shared";
import { loadConfig, type Env } from "./config.js";
import { createDb, type Database } from "./db/index.js";
import { createAuth, type AuthLogger } from "./auth.js";
import { registerRateLimit } from "./plugins/rate-limit.js";
import { registerSecurityHeaders } from "./plugins/security.js";
import { registerAuth } from "./plugins/auth.js";
import { registerCatalogRoutes } from "./routes/catalog.js";
import { registerBabyRoutes } from "./routes/babies.js";
import { registerMealRoutes } from "./routes/meals.js";
import { registerFavoriteRoutes } from "./routes/favorites.js";
import { registerStorageRoutes } from "./routes/storage.js";
import { registerRecipeRoutes } from "./routes/recipes.js";
import { registerAiKeyRoutes } from "./routes/ai-keys.js";
import { registerSymptomRoutes, type SymptomRoutesOptions } from "./routes/symptom.js";
import { registerChatRoutes, type ChatRoutesOptions } from "./routes/chat.js";
import { registerAccountRoutes } from "./routes/account.js";
import { registerPreferenceRoutes } from "./routes/preferences.js";
import { registerUsageRoutes } from "./routes/usage.js";
import type { ApiKeyVerifier } from "./ai/client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistDir = path.resolve(__dirname, "../../client/dist");

/**
 * `?deep=1`, `?deep=true` and a bare `?deep` all ask for the database check;
 * anything else (including `?deep=0`) keeps the cheap answer. Exported so the
 * parsing is pinned by a test rather than by reading the handler.
 */
export function isDeepHealthRequested(deep: string | undefined): boolean {
  return deep === "1" || deep === "true" || deep === "";
}

export interface BuildAppOptions {
  env?: Env;
  // Injectable so tests can pass an isolated (e.g. in-memory PGlite) instance
  // instead of buildApp() standing up the default persisted dev database.
  db?: Database;
  // Lets tests silence the dev email logger (verification links are printed
  // to the log when RESEND_API_KEY is unset).
  authLogger?: AuthLogger;
  // Lets tests exercise AI-key validation without a live Anthropic round
  // trip. Production leaves this unset and the real verifier is used.
  verifyApiKey?: ApiKeyVerifier;
  // Lets tests inject a fake Anthropic client factory / analyzer so the
  // symptom checker's branches can be driven without the network — and so a
  // test can assert the red-flag path made zero SDK calls.
  symptom?: SymptomRoutesOptions;
  // Lets tests drive the chat tool-runner loop without a live Anthropic
  // round trip, and assert exactly what was sent to it.
  chat?: ChatRoutesOptions;
  // Request logging. Defaults to on outside NODE_ENV=test; tests that need a
  // non-test NODE_ENV (the dev auto-auth suite) turn it off explicitly so the
  // suite output stays readable.
  logger?: boolean;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const env = options.env ?? loadConfig();
  const db = options.db ?? createDb(env.DATABASE_URL);
  const app = Fastify({
    logger: options.logger ?? env.NODE_ENV !== "test",
    // Every request gets an id, echoed to the caller as `x-request-id` and
    // logged with any failure. This is the whole of "error tracking" for now:
    // a parent who reports a problem can read one short id off the screen,
    // and it leads straight to the stack in the server log — without the app
    // ever putting a message or a stack into an analytics event.
    genReqId: () => randomUUID(),
  });

  registerSecurityHeaders(app);
  registerRateLimit(app, env);

  // On every response, including errors and 404s.
  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  /**
   * 5xx answers become `{ error: "internal_error", requestId }`.
   *
   * Two reasons, in order: a stack or a driver message in a response body is
   * an information leak, and the client needs something to show the parent
   * that is useful to us later. Known errors — the rate limiter's 429, any
   * 4xx a route throws — are passed through to Fastify's default handler
   * unchanged, because their status, code and message are already the
   * contract those callers were written against.
   */
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    const statusCode = error.statusCode ?? 500;

    if (statusCode < 500) {
      // Second pass through `send(err)` with the handler already run falls
      // back to Fastify's built-in serializer, which is exactly what these
      // responses looked like before this handler existed.
      return reply.send(error);
    }

    request.log.error({ reqId: request.id, err: error }, "request failed");
    return reply.code(statusCode).send({ error: "internal_error", requestId: request.id });
  });

  // Routes go inside after(): @fastify/rate-limit wires per-route budgets
  // through an onRoute hook, which only sees routes declared once the plugin
  // has finished loading.
  app.after(() => {
    registerAuth(app, {
      auth: createAuth({ db, env, logger: options.authLogger ?? app.log }),
      env,
    });

    /**
     * Shallow by default — the container healthcheck polls this every 30
     * seconds and must not pay for a database round trip. `?deep=1` adds a
     * `SELECT 1`, for an external uptime pinger that should notice an app
     * still answering in front of a dead database. A failed deep check is a
     * 503, so the pinger sees a failure rather than a cheerful 200.
     */
    app.get("/api/health", async (request, reply): Promise<HealthResponse | DeepHealthResponse> => {
      const { deep } = request.query as { deep?: string };
      if (!isDeepHealthRequested(deep)) {
        return { status: "ok" };
      }

      try {
        await db.execute(sql`select 1`);
        return { status: "ok", database: "ok" };
      } catch (err) {
        request.log.error({ reqId: request.id, err }, "deep health check failed");
        return reply.code(503).send({ status: "error", database: "error" } satisfies DeepHealthResponse);
      }
    });

    // Must come before any /api/ai/* route: it installs the shared per-user
    // AI budget through an onRoute hook, which only sees routes declared
    // after it.
    registerAiKeyRoutes(app, db, { env, verifyApiKey: options.verifyApiKey }); // BYO Anthropic key

    registerCatalogRoutes(app, db); // foods catalog + custom foods
    registerRecipeRoutes(app, db); // recipe catalog + custom recipes
    registerBabyRoutes(app, db); // baby profiles CRUD
    registerMealRoutes(app, db); // meals + allergen progress
    registerFavoriteRoutes(app, db); // recipe favorites
    registerStorageRoutes(app, db); // storage items + expiry tracking
    registerSymptomRoutes(app, db, options.symptom); // triage + symptom checker
    registerChatRoutes(app, db, options.chat); // recipe assistant + ask-anything BLW chat
    registerAccountRoutes(app, db); // data export + account deletion
    registerPreferenceRoutes(app, db); // per-user app preferences (tour, usage sharing)
    registerUsageRoutes(app, db, env); // anonymous usage events
  });

  const clientBuildExists = fs.existsSync(path.join(clientDistDir, "index.html"));

  if (clientBuildExists) {
    app.register(fastifyStatic, {
      root: clientDistDir,
      index: "index.html",
    });

    // SPA fallback: serve index.html for any non-API GET that doesn't match a
    // static asset, so client-side routing works on refresh/deep-link. Never
    // intercepts /api/* — those either matched a route above or fall through
    // to the default 404 handler.
    app.setNotFoundHandler((request, reply) => {
      if (request.method !== "GET" || request.url.startsWith("/api/")) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      reply.sendFile("index.html");
    });
  }

  return app;
}
