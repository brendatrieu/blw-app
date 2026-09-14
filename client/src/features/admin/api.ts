import {
  adminCollaboratorsResponseSchema,
  adminMeResponseSchema,
  adminMetricsResponseSchema,
  type AdminCollaboratorsResponse,
  type AdminMetricsResponse,
  type MetricsRange,
} from "@blw/shared";
import { ApiError, apiDelete, apiGet, apiPost } from "../../lib/api.js";

/**
 * The client half of the admin API.
 *
 * The one thing to understand here: **404 is an answer, not a failure.**
 * Every `/api/admin/*` route replies with the app's ordinary unknown-route
 * 404 — byte for byte — to anonymous callers and signed-in non-admins alike,
 * so the dashboard cannot be found by probing. That means the client must
 * read a 404 from `/api/admin/me` as "you are not an admin" and must never
 * retry it, log it, or show it as an error: retrying would turn an answer
 * into traffic, and surfacing it would tell the very people the 404 exists
 * for that there is something here to be refused.
 */

/** Statuses that mean "no admin surface for you", rather than "something broke". */
function isRefusal(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 401);
}

export async function fetchIsAdmin(): Promise<boolean> {
  try {
    const body = await apiGet<unknown>("/api/admin/me");
    return adminMeResponseSchema.safeParse(body).success;
  } catch (error) {
    if (isRefusal(error)) return false;
    throw error;
  }
}

/**
 * The whole dashboard in one response, validated against the shared schema
 * rather than cast. A metrics page that renders a number the server no
 * longer computes the same way is worse than one that fails loudly: this is
 * the surface product decisions get made on.
 */
export async function fetchAdminMetrics(range: MetricsRange): Promise<AdminMetricsResponse> {
  return adminMetricsResponseSchema.parse(await apiGet<unknown>(`/api/admin/metrics?range=${range}`));
}

export async function fetchCollaborators(): Promise<AdminCollaboratorsResponse> {
  return adminCollaboratorsResponseSchema.parse(await apiGet<unknown>("/api/admin/collaborators"));
}

/** Grants by email — the address must already belong to an account. */
export async function grantCollaborator(email: string): Promise<AdminCollaboratorsResponse> {
  return adminCollaboratorsResponseSchema.parse(await apiPost<unknown>("/api/admin/collaborators", { email }));
}

export async function revokeCollaborator(userId: string): Promise<AdminCollaboratorsResponse> {
  return adminCollaboratorsResponseSchema.parse(
    await apiDelete<unknown>(`/api/admin/collaborators/${encodeURIComponent(userId)}`),
  );
}
