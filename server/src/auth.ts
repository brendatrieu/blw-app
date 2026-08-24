import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Env } from "./config.js";
import { isGoogleEnabled } from "./config.js";
import type { Database } from "./db/index.js";
import { account, session, user, verification } from "./db/schema.js";

/** Minimal logger surface so this module can take Fastify's logger or console. */
export interface AuthLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Sends transactional mail through Resend's HTTP API. Without an API key
 * (the default in local development) the message is written to the server
 * log instead, so the verification/reset link is still reachable.
 *
 * Links are only ever logged outside production — printing a live
 * password-reset token into a production log file would be a credential leak.
 */
async function deliverEmail(env: Env, logger: AuthLogger, email: OutgoingEmail): Promise<void> {
  if (!env.RESEND_API_KEY) {
    if (env.NODE_ENV === "production") {
      logger.error(
        `Cannot send "${email.subject}": RESEND_API_KEY is not configured. Email not delivered.`,
      );
      return;
    }
    logger.info(`[email:dev] to=${email.to} subject="${email.subject}"\n${email.text}`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [email.to],
      subject: email.subject,
      text: email.text,
    }),
  });

  if (!response.ok) {
    // The body can echo request contents, so only the status is logged.
    logger.error(`Resend rejected "${email.subject}" with status ${response.status}`);
    throw new Error(`Email delivery failed with status ${response.status}`);
  }
}

/**
 * Origins allowed to make credentialed requests. The app is served
 * same-origin in production, so the configured base URL is always trusted;
 * TRUSTED_ORIGINS adds anything else (e.g. the Vite dev server).
 */
export function resolveTrustedOrigins(env: Env): string[] {
  const origins = new Set<string>([env.BETTER_AUTH_URL, ...env.TRUSTED_ORIGINS]);
  if (env.NODE_ENV !== "production") {
    origins.add("http://localhost:5173");
    origins.add("http://127.0.0.1:5173");
  }
  return [...origins];
}

const consoleLogger: AuthLogger = {
  info: (message) => {
    console.log(message);
  },
  warn: (message) => {
    console.warn(message);
  },
  error: (message) => {
    console.error(message);
  },
};

export interface CreateAuthOptions {
  db: Database;
  env: Env;
  logger?: AuthLogger;
}

/**
 * Builds the better-auth instance over the existing Drizzle schema.
 *
 * Only the four better-auth-managed tables are handed to the adapter; the
 * application tables stay invisible to it. Google is registered only when
 * both credentials are present, so a misconfigured deployment simply has no
 * social provider rather than a broken one.
 */
export function createAuth({ db, env, logger = consoleLogger }: CreateAuthOptions) {
  const secureCookies = env.NODE_ENV === "production";

  return betterAuth({
    appName: "blw",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: resolveTrustedOrigins(env),

    database: drizzleAdapter(db, {
      provider: "pg",
      // Explicit map rather than the whole schema: better-auth should only
      // ever reach the tables it owns.
      schema: { user, session, account, verification },
    }),

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
      // v1 ships without a verification gate; users can still verify to
      // unlock password reset flows that depend on a confirmed address.
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user: recipient, url }) => {
        await deliverEmail(env, logger, {
          to: recipient.email,
          subject: "Reset your password",
          text: [
            "We received a request to reset your password.",
            "",
            `Open this link to choose a new one: ${url}`,
            "",
            "The link expires in one hour. If you did not ask for this, you can ignore this email.",
          ].join("\n"),
        });
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user: recipient, url }) => {
        await deliverEmail(env, logger, {
          to: recipient.email,
          subject: "Confirm your email address",
          text: [
            `Welcome${recipient.name ? `, ${recipient.name}` : ""}.`,
            "",
            `Confirm your email address here: ${url}`,
            "",
            "If you did not create an account, you can ignore this email.",
          ].join("\n"),
        });
      },
    },

    socialProviders: isGoogleEnabled(env)
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID as string,
            clientSecret: env.GOOGLE_CLIENT_SECRET as string,
          },
        }
      : {},

    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },

    advanced: {
      useSecureCookies: secureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies,
        path: "/",
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Awaited<ReturnType<Auth["api"]["getSession"]>>;
export type AuthUser = NonNullable<AuthSession>["user"];
