import {
  adminCollaboratorsResponseSchema,
  adminFeedbackItemSchema,
  adminFeedbackListResponseSchema,
  adminFeedbackSummarySchema,
  adminMeResponseSchema,
  adminMetricsResponseSchema,
  type AdminCollaboratorsResponse,
  type AdminFeedbackItem,
  type AdminFeedbackListResponse,
  type AdminFeedbackSummary,
  type AdminMetricsResponse,
  type FeedbackFilter,
  type MetricsRange,
  type UpdateFeedbackInput,
} from "@blw/shared";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "../../lib/api.js";

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

// ---------------------------------------------------------------------------
// The feedback inbox (item 361)
// ---------------------------------------------------------------------------

/**
 * One tab of the inbox, newest first and capped server-side.
 *
 * The 404 rule above applies here exactly as it does to the rest of the
 * admin surface — these three routes answer an anonymous caller and a
 * signed-in parent byte for byte as `/api/admin/nonsense` does — which is
 * why every hook that reads them sets `retry: false`.
 *
 * Note what this response carries that no other admin payload does: the
 * parent's own words and their email address. That is the point of an inbox
 * and it is the documented exception to the aggregates-only rule (see the
 * preamble of `shared/src/feedback.ts`). It also never touches IndexedDB —
 * `PERSISTED_QUERY_KEY_PREFIXES` in main.tsx deliberately omits "admin", so
 * a message a parent wrote cannot be left behind on an admin's laptop.
 */
export async function fetchAdminFeedback(filter: FeedbackFilter): Promise<AdminFeedbackListResponse> {
  return adminFeedbackListResponseSchema.parse(
    await apiGet<unknown>(`/api/admin/feedback?filter=${encodeURIComponent(filter)}`),
  );
}

/** The four counts the tabs and the More-page chip are built from. */
export async function fetchFeedbackSummary(): Promise<AdminFeedbackSummary> {
  return adminFeedbackSummarySchema.parse(await apiGet<unknown>("/api/admin/feedback/summary"));
}

/**
 * Mark read / resolve / reopen / clear / restore — all one PATCH.
 *
 * The server owns the transitions (`readAt` is coalesced, `resolvedBy` is
 * taken from the session) and answers with the whole updated item, so the
 * caller writes the server's answer back rather than guessing at one.
 */
export async function updateFeedback(id: string, patch: UpdateFeedbackInput): Promise<AdminFeedbackItem> {
  return adminFeedbackItemSchema.parse(
    await apiPatch<unknown>(`/api/admin/feedback/${encodeURIComponent(id)}`, patch),
  );
}
