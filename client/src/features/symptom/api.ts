import type {
  SymptomCheckHistoryResponse,
  SymptomCheckRequest,
  SymptomCheckResponse,
} from "@blw/shared";
import { apiGet, apiPost } from "../../lib/api.js";

/**
 * One request, one answer. The server decides which of the three result kinds
 * comes back — red-flag triage, the rule-based fallback, or the model's
 * assessment — so the client never has to know whether a key is on file.
 */
export function runSymptomCheck(body: SymptomCheckRequest): Promise<SymptomCheckResponse> {
  return apiPost<SymptomCheckResponse>("/api/ai/symptom-check", body);
}

export function fetchSymptomChecks(babyId: string): Promise<SymptomCheckHistoryResponse> {
  return apiGet<SymptomCheckHistoryResponse>(`/api/babies/${babyId}/symptom-checks`);
}
