import { useQuery } from "@tanstack/react-query";
import { createAuthClient } from "better-auth/react";
import { authConfigSchema, type AuthConfig } from "@blw/shared";
import { apiGet } from "./api.js";

/**
 * The API is always same-origin: in development Vite proxies `/api` to the
 * Fastify server, and in production Fastify serves this bundle itself. So
 * the client only needs the base path, never a cross-origin URL.
 */
export const authClient = createAuthClient({
  basePath: "/api/auth",
});

export const { signIn, signUp, signOut, resetPassword, requestPasswordReset } = authClient;

// Explicit annotation: the inferred hook type reaches into better-auth's
// internal declaration files, which tsc refuses to name from here.
export const useSession: typeof authClient.useSession = authClient.useSession;

export type Session = typeof authClient.$Infer.Session;
export type SessionUser = Session["user"];

/**
 * Turns a better-auth error into something worth showing a parent. The
 * server deliberately gives the same answer for "no such account" and "wrong
 * password", and that wording is kept here rather than guessing.
 */
export function authErrorMessage(error: { message?: string | undefined } | null): string | null {
  if (!error) return null;
  return error.message && error.message.trim().length > 0
    ? error.message
    : "Something went wrong. Please try again.";
}

/**
 * What the server can do for sign-in (GET /api/auth-config): today, whether
 * a password-reset email would really arrive (ledger 822). Not persisted —
 * "auth-config" is absent from main.tsx's persisted prefixes — so a key added
 * on the server shows up on the next load. Unknown (loading, offline) reads
 * as "no", so the app never promises an email it cannot vouch for.
 */
export function useAuthConfig(): { data: AuthConfig | undefined } {
  return useQuery({
    queryKey: ["auth-config"],
    queryFn: async () => authConfigSchema.parse(await apiGet<unknown>("/api/auth-config")),
    staleTime: 5 * 60_000,
    retry: false,
  });
}
