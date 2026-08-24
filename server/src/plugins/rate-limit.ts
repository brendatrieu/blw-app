import fastifyRateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import type { Env } from "../config.js";

/**
 * Per-route override applied to the better-auth handler. Credential
 * endpoints are the ones worth brute-forcing, so they get a far tighter
 * budget than the global ceiling.
 */
export function authRateLimitConfig(env: Env) {
  return {
    rateLimit: {
      max: env.AUTH_RATE_LIMIT_MAX,
      timeWindow: "1 minute",
    },
  };
}

/**
 * Global IP rate limit. Registered at the root scope before any route so
 * that per-route `config.rateLimit` overrides resolve against it.
 */
export function registerRateLimit(app: FastifyInstance, env: Env): void {
  void app.register(fastifyRateLimit, {
    global: true,
    max: env.GLOBAL_RATE_LIMIT_MAX,
    timeWindow: "1 minute",
    keyGenerator: (request) => request.ip,
    // The builder's return value is thrown, so it has to be a real Error
    // carrying the status; a plain object surfaces as a 500.
    errorResponseBuilder: (_request, context) => {
      const error = new Error(`Too many requests. Try again in ${context.after}.`) as Error & {
        statusCode: number;
        code: string;
      };
      error.statusCode = context.statusCode;
      error.code = "RATE_LIMITED";
      return error;
    },
  });
}
