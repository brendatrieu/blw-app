import type { AiKeyStatus, SaveAiKeyResponse } from "@blw/shared";
import { ApiError, apiDelete, apiGet } from "../../lib/api.js";

// lib/api.ts exposes GET/POST/PATCH/DELETE; saving the key is a PUT (it is an
// idempotent replace of the single key on the account). Same local wrapper
// the tracking feature uses, extended to send a JSON body.
async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "PUT",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = response.statusText || `Request failed with status ${response.status}`;
    try {
      const parsed: unknown = await response.json();
      if (parsed && typeof parsed === "object" && "error" in parsed && typeof (parsed as { error: unknown }).error === "string") {
        message = (parsed as { error: string }).error;
      }
    } catch {
      // Non-JSON or empty error body — fall through to the status text.
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function fetchAiKeyStatus(): Promise<AiKeyStatus> {
  return apiGet<AiKeyStatus>("/api/account/ai-key");
}

/**
 * The key is sent exactly once, in a request body — never a query string,
 * never persisted client-side. The response carries only the last four
 * characters back.
 */
export function saveAiKey(apiKey: string): Promise<SaveAiKeyResponse> {
  return apiPut<SaveAiKeyResponse>("/api/account/ai-key", { apiKey });
}

export function deleteAiKey(): Promise<void> {
  return apiDelete<void>("/api/account/ai-key");
}
