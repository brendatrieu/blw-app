import fastifyHelmet from "@fastify/helmet";
import type { FastifyInstance } from "fastify";

/**
 * Locked-down security headers for the SPA + JSON/SSE API.
 *
 * HSTS is deliberately left to Caddy at the edge (see docs/deploy-oracle.md)
 * — setting it here too would mean two `Strict-Transport-Security` headers
 * disagreeing on maxAge, so helmet's copy is disabled outright.
 */
/**
 * Helmet 8 (the engine behind @fastify/helmet) dropped Permissions-Policy
 * support outright, so it's set by hand here rather than through a helmet
 * option that no longer exists.
 */
const PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=()";

export function registerSecurityHeaders(app: FastifyInstance): void {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("Permissions-Policy", PERMISSIONS_POLICY);
  });

  void app.register(fastifyHelmet, {
    hsts: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // Tailwind's runtime + inline `style` attributes need 'unsafe-inline'.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        // Same-origin fetch/XHR and the chat SSE stream both go through here.
        connectSrc: ["'self'"],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  });
}
