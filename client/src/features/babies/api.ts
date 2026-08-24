import type { AuthConfig, Baby, CreateBabyInput, UpdateBabyInput } from "@blw/shared";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../lib/api.js";

export const babyKeys = {
  all: ["babies"] as const,
  list: (includeArchived: boolean) => ["babies", { includeArchived }] as const,
};

export const authConfigKey = ["auth-config"] as const;

export function fetchBabies(includeArchived: boolean): Promise<Baby[]> {
  return apiGet<Baby[]>(`/api/babies${includeArchived ? "?includeArchived=true" : ""}`);
}

export function createBaby(input: CreateBabyInput): Promise<Baby> {
  return apiPost<Baby>("/api/babies", input);
}

export function updateBaby(id: string, input: UpdateBabyInput): Promise<Baby> {
  return apiPatch<Baby>(`/api/babies/${id}`, input);
}

export function deleteBaby(id: string): Promise<void> {
  return apiDelete<void>(`/api/babies/${id}`);
}

/** Whether the server can actually complete a Google sign-in. */
export function fetchAuthConfig(): Promise<AuthConfig> {
  return apiGet<AuthConfig>("/api/auth-config");
}
