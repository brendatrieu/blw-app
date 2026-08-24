import { createAuthClient } from "better-auth/react";

/**
 * The API is always same-origin: in development Vite proxies `/api` to the
 * Fastify server, and in production Fastify serves this bundle itself. So
 * the client only needs the base path, never a cross-origin URL.
 */
export const authClient = createAuthClient({
  basePath: "/api/auth",
});

export const { signIn, signUp, signOut } = authClient;

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
