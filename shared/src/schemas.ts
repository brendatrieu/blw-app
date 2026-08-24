import { z } from "zod";

/**
 * Placeholder schema for the API health check endpoint.
 * Real domain schemas (foods, recipes, babies, pantry, etc.) land in later phases
 * per the "Data model" section of the implementation plan.
 */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
