import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import type { HealthResponse } from "@blw/shared";
import { loadConfig, type Env } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistDir = path.resolve(__dirname, "../../client/dist");

export interface BuildAppOptions {
  env?: Env;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const env = options.env ?? loadConfig();
  const app = Fastify({
    logger: env.NODE_ENV !== "test",
  });

  app.get("/api/health", async (): Promise<HealthResponse> => {
    return { status: "ok" };
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
