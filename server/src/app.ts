import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import type { HealthResponse } from "@blw/shared";
import { loadConfig, type Env } from "./config.js";
import { createDb, type Database } from "./db/index.js";
import { createAuth, type AuthLogger } from "./auth.js";
import { registerRateLimit } from "./plugins/rate-limit.js";
import { registerAuth } from "./plugins/auth.js";
import { registerCatalogRoutes } from "./routes/catalog.js";
import { registerBabyRoutes } from "./routes/babies.js";
import { registerServeLogRoutes } from "./routes/serve-logs.js";
import { registerFavoriteRoutes } from "./routes/favorites.js";
import { registerPantryRoutes } from "./routes/pantry.js";
import { registerAiKeyRoutes } from "./routes/ai-keys.js";
import { registerSymptomRoutes, type SymptomRoutesOptions } from "./routes/symptom.js";
import { registerChatRoutes, type ChatRoutesOptions } from "./routes/chat.js";
import type { ApiKeyVerifier } from "./ai/client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistDir = path.resolve(__dirname, "../../client/dist");

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
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const env = options.env ?? loadConfig();
  const db = options.db ?? createDb(env.DATABASE_URL);
  const app = Fastify({
    logger: env.NODE_ENV !== "test",
  });

  registerRateLimit(app, env);

  // Routes go inside after(): @fastify/rate-limit wires per-route budgets
  // through an onRoute hook, which only sees routes declared once the plugin
  // has finished loading.
  app.after(() => {
    registerAuth(app, {
      auth: createAuth({ db, env, logger: options.authLogger ?? app.log }),
      env,
    });

    app.get("/api/health", async (): Promise<HealthResponse> => {
      return { status: "ok" };
    });

    // Must come before any /api/ai/* route: it installs the shared per-user
    // AI budget through an onRoute hook, which only sees routes declared
    // after it.
    registerAiKeyRoutes(app, db, { env, verifyApiKey: options.verifyApiKey }); // BYO Anthropic key

    registerCatalogRoutes(app, db); // catalog routes
    registerBabyRoutes(app, db); // baby profiles CRUD
    registerServeLogRoutes(app, db); // serve logs + allergen progress
    registerFavoriteRoutes(app, db); // recipe favorites
    registerPantryRoutes(app, db); // pantry items + expiry tracking
    registerSymptomRoutes(app, db, options.symptom); // triage + symptom checker
    registerChatRoutes(app, db, options.chat); // recipe assistant + ask-anything BLW chat
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
