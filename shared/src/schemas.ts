import { z } from "zod";

/**
 * Placeholder schema for the API health check endpoint.
 * Real domain schemas (foods, recipes, babies, storage, etc.) land in later phases
 * per the "Data model" section of the implementation plan.
 */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

/**
 * `GET /api/health?deep=1`. The shallow form above stays exactly as it was —
 * the container healthcheck polls it every 30s and must not start paying for
 * a database round trip — while an external uptime pinger asks for this one,
 * which proves the app can still reach Postgres. Answered with 503 and
 * `status: "error"` when it cannot, so the pinger sees a failure rather than
 * a cheerful 200 in front of a dead database.
 */
export const deepHealthResponseSchema = z.object({
  status: z.enum(["ok", "error"]),
  database: z.enum(["ok", "error"]),
});

export type DeepHealthResponse = z.infer<typeof deepHealthResponseSchema>;
