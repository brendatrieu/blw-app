import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { FastifyInstance } from "fastify";
import { buildApp, type BuildAppOptions } from "../app.js";
import type { AuthLogger } from "../auth.js";
import type { Env } from "../config.js";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, "../../drizzle");

/** Origin every test request claims, matching `testEnv.BETTER_AUTH_URL`. */
export const TEST_ORIGIN = "http://localhost:3000";

/** Dev email logger writes verification links to stdout; tests do not need them. */
const silentLogger: AuthLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

export function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    PORT: 0,
    NODE_ENV: "test",
    DATABASE_URL: undefined,
    BETTER_AUTH_SECRET: "test-secret-that-is-long-enough-for-hmac-0123456789",
    BETTER_AUTH_URL: TEST_ORIGIN,
    TRUSTED_ORIGINS: [],
    GOOGLE_CLIENT_ID: undefined,
    GOOGLE_CLIENT_SECRET: undefined,
    RESEND_API_KEY: undefined,
    EMAIL_FROM: "test@example.com",
    KEY_ENCRYPTION_SECRET: "test-key-encryption-secret-0123456789-abcdef",
    AUTH_RATE_LIMIT_MAX: 10,
    GLOBAL_RATE_LIMIT_MAX: 300,
    AI_RATE_LIMIT_MAX: 20,
    AI_KEY_RATE_LIMIT_MAX: 5,
    ...overrides,
  };
}

/**
 * Fresh in-memory Postgres per call. PGlite with no data directory keeps the
 * whole database in memory, so tests never touch server/.data and never see
 * each other's rows.
 */
export async function createTestDb(): Promise<{ db: Database; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { db, close: () => client.close() };
}

/**
 * A running app wired to an isolated database. Each instance also gets its
 * own rate-limit counters, so one test's 429 experiment cannot spill into
 * the next test.
 */
export async function createTestApp(
  envOverrides: Partial<Env> = {},
  // Passthrough for buildApp's other injection points (currently the AI key
  // verifier, so key-validation tests never touch the network).
  appOverrides: Omit<BuildAppOptions, "env" | "db" | "authLogger"> = {},
): Promise<{ app: FastifyInstance; db: Database; close: () => Promise<void> }> {
  const { db, close } = await createTestDb();
  const app = buildApp({ ...appOverrides, env: testEnv(envOverrides), db, authLogger: silentLogger });
  await app.ready();
  return {
    app,
    db,
    close: async () => {
      await app.close();
      await close();
    },
  };
}

/** Collects the cookie pairs from a Set-Cookie response header. */
export function cookieHeader(setCookie: string | string[] | undefined): string {
  const values = setCookie === undefined ? [] : Array.isArray(setCookie) ? setCookie : [setCookie];
  return values
    .map((value) => value.split(";", 1)[0] ?? "")
    .filter((pair) => pair.length > 0)
    .join("; ");
}

export interface TestUser {
  email: string;
  password: string;
  cookie: string;
}

let userCounter = 0;

/** Signs a brand new user up and returns the session cookie for that user. */
export async function signUpUser(app: FastifyInstance, name = "Test Parent"): Promise<TestUser> {
  userCounter += 1;
  const email = `user${userCounter}-${Date.now()}@example.com`;
  const password = "correct-horse-battery-staple";

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { origin: TEST_ORIGIN },
    payload: { email, password, name },
  });

  if (response.statusCode !== 200) {
    throw new Error(`sign-up failed (${response.statusCode}): ${response.body}`);
  }

  const cookie = cookieHeader(response.headers["set-cookie"] as string | string[] | undefined);
  if (!cookie) {
    throw new Error("sign-up did not set a session cookie");
  }

  return { email, password, cookie };
}
