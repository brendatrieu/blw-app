import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { TEST_ORIGIN, createTestApp } from "./helpers.js";
import {
  DEV_BYPASS_EMAIL,
  DEV_SECRET_FILE,
  isLoopbackAddress,
  loadOrCreateDevSecret,
} from "../plugins/dev-auth.js";
import { user } from "../db/schema.js";

/**
 * The dev-only loopback auth bypass.
 *
 * The point of this file is the negative space: the bypass must be invisible
 * under NODE_ENV=production, invisible under NODE_ENV=test (which is what the
 * rest of the suite runs as — every existing auth assertion there is a further
 * proof of that), invisible to a non-loopback caller, invisible when the
 * escape hatch is set, and impossible to trigger with a forged forwarding
 * header.
 *
 * The other half is the credential: it must be a per-machine secret on disk
 * under the gitignored `.data/`, never a literal in the committed source,
 * because the dev server binds 0.0.0.0 and `/api/auth/sign-in/email` is
 * therefore reachable from the LAN.
 */

const LOOPBACK = "127.0.0.1";
const REMOTE = "203.0.113.7";

/** A protected route: 200 means the caller was resolved to some user. */
const PROTECTED_URL = "/api/babies";

afterEach(() => {
  delete process.env.DEV_AUTO_AUTH;
});

describe("isLoopbackAddress", () => {
  it("accepts only the loopback forms", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
  });

  it("rejects everything else, including near-misses", () => {
    for (const address of [
      undefined,
      null,
      "",
      "203.0.113.7",
      "10.0.0.1",
      "192.168.1.10",
      "127.0.0.1.evil.com",
      "0.0.0.0",
      "::",
      "2001:db8::1",
    ]) {
      expect(isLoopbackAddress(address)).toBe(false);
    }
  });
});

describe("dev auto-auth is inert outside development", () => {
  it("still 401s in production for a loopback request with no cookie", async () => {
    const { app, close } = await createTestApp({ NODE_ENV: "production" });

    const response = await app.inject({
      method: "GET",
      url: PROTECTED_URL,
      remoteAddress: LOOPBACK,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });

    const session = await app.inject({
      method: "GET",
      url: "/api/auth/get-session",
      headers: { origin: TEST_ORIGIN },
      remoteAddress: LOOPBACK,
    });
    expect(session.body === "" || session.json() === null).toBe(true);

    await close();
  });

  it("still 401s in the test environment for a loopback request with no cookie", async () => {
    // NODE_ENV=test is the default for the whole suite: this asserts the
    // guard is strict equality on "development", not `!== "production"`.
    const { app, close } = await createTestApp();

    const response = await app.inject({
      method: "GET",
      url: PROTECTED_URL,
      remoteAddress: LOOPBACK,
    });

    expect(response.statusCode).toBe(401);

    await close();
  });

  it("provisions no dev user in the test environment", async () => {
    const { app, db, close } = await createTestApp();

    await app.inject({ method: "GET", url: PROTECTED_URL, remoteAddress: LOOPBACK });

    const rows = await db.select().from(user).where(eq(user.email, DEV_BYPASS_EMAIL));
    expect(rows).toHaveLength(0);

    await close();
  });
});

describe("dev auto-auth in development", () => {
  it("serves an unauthenticated loopback request as the dev user", async () => {
    const { app, db, close } = await createTestApp({ NODE_ENV: "development" });

    const response = await app.inject({
      method: "GET",
      url: PROTECTED_URL,
      remoteAddress: LOOPBACK,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);

    const rows = await db.select().from(user).where(eq(user.email, DEV_BYPASS_EMAIL));
    expect(rows).toHaveLength(1);

    await close();
  });

  it("reflects the dev user on /api/auth/get-session so the client needs no changes", async () => {
    const { app, close } = await createTestApp({ NODE_ENV: "development" });

    const session = await app.inject({
      method: "GET",
      url: "/api/auth/get-session",
      headers: { origin: TEST_ORIGIN },
      remoteAddress: LOOPBACK,
    });

    expect(session.statusCode).toBe(200);
    expect(session.json<{ user: { email: string } }>().user.email).toBe(DEV_BYPASS_EMAIL);

    await close();
  });

  it("keeps writes on the one dev identity across requests", async () => {
    const { app, db, close } = await createTestApp({ NODE_ENV: "development" });

    const created = await app.inject({
      method: "POST",
      url: PROTECTED_URL,
      remoteAddress: LOOPBACK,
      payload: { name: "Pip", birthDate: "2025-03-04", notes: null },
    });
    expect(created.statusCode).toBe(201);

    const listed = await app.inject({
      method: "GET",
      url: PROTECTED_URL,
      remoteAddress: LOOPBACK,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json<{ name: string }[]>().map((row) => row.name)).toEqual(["Pip"]);

    const rows = await db.select().from(user).where(eq(user.email, DEV_BYPASS_EMAIL));
    expect(rows).toHaveLength(1);

    await close();
  });

  it("provisions the dev user once under concurrent first requests", async () => {
    const { app, db, close } = await createTestApp({ NODE_ENV: "development" });

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        app.inject({ method: "GET", url: PROTECTED_URL, remoteAddress: LOOPBACK }),
      ),
    );

    for (const response of responses) {
      expect(response.statusCode).toBe(200);
    }

    const rows = await db.select().from(user).where(eq(user.email, DEV_BYPASS_EMAIL));
    expect(rows).toHaveLength(1);

    await close();
  });

  it("lands you back as the dev user after signing out", async () => {
    const { app, close } = await createTestApp({ NODE_ENV: "development" });

    const first = await app.inject({ method: "GET", url: PROTECTED_URL, remoteAddress: LOOPBACK });
    expect(first.statusCode).toBe(200);

    await app.inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: { origin: TEST_ORIGIN },
      remoteAddress: LOOPBACK,
      payload: {},
    });

    const after = await app.inject({ method: "GET", url: PROTECTED_URL, remoteAddress: LOOPBACK });
    expect(after.statusCode).toBe(200);

    await close();
  });

  it("does not touch a request that already carries a real session", async () => {
    const { app, close } = await createTestApp({ NODE_ENV: "development" });

    const signUp = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { origin: TEST_ORIGIN },
      remoteAddress: LOOPBACK,
      payload: {
        email: "real-user@example.com",
        password: "correct-horse-battery-staple",
        name: "Real User",
      },
    });
    expect(signUp.statusCode).toBe(200);

    const cookie = (
      Array.isArray(signUp.headers["set-cookie"])
        ? signUp.headers["set-cookie"]
        : [signUp.headers["set-cookie"] as string]
    )
      .filter(Boolean)
      .map((value) => value.split(";", 1)[0])
      .join("; ");

    const session = await app.inject({
      method: "GET",
      url: "/api/auth/get-session",
      headers: { cookie, origin: TEST_ORIGIN },
      remoteAddress: LOOPBACK,
    });

    expect(session.json<{ user: { email: string } }>().user.email).toBe("real-user@example.com");

    await close();
  });
});

describe("dev auto-auth refuses anything but a loopback socket", () => {
  it("401s a non-loopback caller in development", async () => {
    const { app, db, close } = await createTestApp({ NODE_ENV: "development" });

    const response = await app.inject({
      method: "GET",
      url: PROTECTED_URL,
      remoteAddress: REMOTE,
    });

    expect(response.statusCode).toBe(401);

    const rows = await db.select().from(user).where(eq(user.email, DEV_BYPASS_EMAIL));
    expect(rows).toHaveLength(0);

    await close();
  });

  it("ignores an X-Forwarded-For claiming loopback from a remote socket", async () => {
    const { app, close } = await createTestApp({ NODE_ENV: "development" });

    for (const headers of [
      { "x-forwarded-for": "127.0.0.1" },
      { "x-forwarded-for": "127.0.0.1, 203.0.113.7" },
      { "x-real-ip": "127.0.0.1" },
      { "x-forwarded-for": "::1" },
    ]) {
      const response = await app.inject({
        method: "GET",
        url: PROTECTED_URL,
        headers,
        remoteAddress: REMOTE,
      });
      expect(response.statusCode).toBe(401);
    }

    const session = await app.inject({
      method: "GET",
      url: "/api/auth/get-session",
      headers: { origin: TEST_ORIGIN, "x-forwarded-for": "127.0.0.1" },
      remoteAddress: REMOTE,
    });
    expect(session.body === "" || session.json() === null).toBe(true);

    await close();
  });
});

describe("DEV_AUTO_AUTH=0", () => {
  it("disables the bypass in development", async () => {
    process.env.DEV_AUTO_AUTH = "0";
    const { app, db, close } = await createTestApp({ NODE_ENV: "development" });

    const response = await app.inject({
      method: "GET",
      url: PROTECTED_URL,
      remoteAddress: LOOPBACK,
    });

    expect(response.statusCode).toBe(401);

    const rows = await db.select().from(user).where(eq(user.email, DEV_BYPASS_EMAIL));
    expect(rows).toHaveLength(0);

    await close();
  });

  it("is off only for the exact value 0", async () => {
    process.env.DEV_AUTO_AUTH = "1";
    const { app, close } = await createTestApp({ NODE_ENV: "development" });

    const response = await app.inject({
      method: "GET",
      url: PROTECTED_URL,
      remoteAddress: LOOPBACK,
    });

    expect(response.statusCode).toBe(200);

    await close();
  });
});

// ---------------------------------------------------------------------------
// The dev credential itself
// ---------------------------------------------------------------------------

const scratchDirs: string[] = [];

/** A throwaway directory that does not exist yet inside it — mkdir -p is under test. */
function scratchSecretPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "blw-dev-secret-"));
  scratchDirs.push(dir);
  return path.join(dir, "nested", "dev-auth-secret");
}

afterEach(() => {
  while (scratchDirs.length > 0) {
    rmSync(scratchDirs.pop() as string, { recursive: true, force: true });
  }
});

describe("the dev credential is a machine-local secret, not a committed literal", () => {
  it("lives under the gitignored .data dir, beside the PGlite dev database", () => {
    // Same resolution as db/index.ts's `../../.data/pglite`: server/.data.
    expect(DEV_SECRET_FILE.endsWith(path.join("server", ".data", "dev-auth-secret"))).toBe(true);
  });

  it("ships no password literal in the committed source", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../plugins/dev-auth.ts", import.meta.url)),
      "utf8",
    );
    // Any `password: "..."` / `password = "..."` here would be a credential
    // anyone who has read the repo could use against the LAN-bound dev API.
    expect(source).not.toMatch(/password\s*[:=]\s*["'`]/);
    expect(source).not.toContain("DEV_BYPASS_PASSWORD");
  });

  it("generates a 0600 file on first use and reuses it afterwards", () => {
    const file = scratchSecretPath();

    const first = loadOrCreateDevSecret(file);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(file, "utf8").trim()).toBe(first);

    // Second call must read, not regenerate.
    expect(loadOrCreateDevSecret(file)).toBe(first);
  });

  it("gives different machines different secrets", () => {
    expect(loadOrCreateDevSecret(scratchSecretPath())).not.toBe(
      loadOrCreateDevSecret(scratchSecretPath()),
    );
  });

  it("tightens the mode of an existing secret file that loosened", () => {
    const file = scratchSecretPath();
    const secret = loadOrCreateDevSecret(file);
    chmodSync(file, 0o644);

    expect(loadOrCreateDevSecret(file)).toBe(secret);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("replaces a truncated or empty secret file instead of trusting it", () => {
    const file = scratchSecretPath();
    loadOrCreateDevSecret(file);
    writeFileSync(file, "   \n");

    const replaced = loadOrCreateDevSecret(file);
    expect(replaced).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(file, "utf8").trim()).toBe(replaced);
  });
});

describe("the persisted secret survives a restart", () => {
  it("reuses the same on-disk secret across two app builds", async () => {
    const first = await createTestApp({ NODE_ENV: "development" });
    const firstResponse = await first.app.inject({
      method: "GET",
      url: PROTECTED_URL,
      remoteAddress: LOOPBACK,
    });
    expect(firstResponse.statusCode).toBe(200);

    // Provisioning must have gone through the persisted secret.
    const afterFirstBoot = readFileSync(DEV_SECRET_FILE, "utf8").trim();
    expect(afterFirstBoot).toMatch(/^[0-9a-f]{64}$/);
    expect(statSync(DEV_SECRET_FILE).mode & 0o777).toBe(0o600);
    await first.close();

    // A second boot (fresh database, same .data dir) must not mint a new one.
    const second = await createTestApp({ NODE_ENV: "development" });
    const secondResponse = await second.app.inject({
      method: "GET",
      url: PROTECTED_URL,
      remoteAddress: LOOPBACK,
    });
    expect(secondResponse.statusCode).toBe(200);
    expect(readFileSync(DEV_SECRET_FILE, "utf8").trim()).toBe(afterFirstBoot);

    await second.close();
  });
});

describe("credential mismatch between the secret file and the dev database", () => {
  it("deletes the stale dev user, re-provisions, and says so in the log", async () => {
    const { app, db, close } = await createTestApp({ NODE_ENV: "development" });

    // Seed the dev-user row under a DIFFERENT credential — what a developer is
    // left with after deleting .data/dev-auth-secret but keeping the database.
    // Signed up from a remote socket so the bypass hook does not fire first.
    const seeded = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { origin: TEST_ORIGIN },
      remoteAddress: REMOTE,
      payload: {
        email: DEV_BYPASS_EMAIL,
        password: "a-secret-this-machine-no-longer-has",
        name: "Stale Dev",
      },
    });
    expect(seeded.statusCode).toBe(200);

    const before = await db.select().from(user).where(eq(user.email, DEV_BYPASS_EMAIL));
    expect(before).toHaveLength(1);
    const staleId = before[0]?.id;

    const warn = vi.spyOn(app.log, "warn");

    const response = await app.inject({
      method: "GET",
      url: PROTECTED_URL,
      remoteAddress: LOOPBACK,
    });
    expect(response.statusCode).toBe(200);

    // Recovered by re-provisioning, not by leaving a second row behind.
    const after = await db.select().from(user).where(eq(user.email, DEV_BYPASS_EMAIL));
    expect(after).toHaveLength(1);
    expect(after[0]?.id).not.toBe(staleId);

    // One clear line explaining what happened and that data was reset.
    const messages = warn.mock.calls.map((call) => call.map(String).join(" "));
    expect(messages.some((message) => /does not match the stored credential/.test(message))).toBe(
      true,
    );
    expect(messages.some((message) => /data has been reset/.test(message))).toBe(true);
    warn.mockRestore();

    // And the recovered session is a real, usable one.
    const session = await app.inject({
      method: "GET",
      url: "/api/auth/get-session",
      headers: { origin: TEST_ORIGIN },
      remoteAddress: LOOPBACK,
    });
    expect(session.json<{ user: { email: string } }>().user.email).toBe(DEV_BYPASS_EMAIL);

    await close();
  });

  it("leaves a real user with a real session alone when the dev row is healthy", async () => {
    const { app, db, close } = await createTestApp({ NODE_ENV: "development" });

    const first = await app.inject({ method: "GET", url: PROTECTED_URL, remoteAddress: LOOPBACK });
    expect(first.statusCode).toBe(200);

    const created = await db.select().from(user).where(eq(user.email, DEV_BYPASS_EMAIL));
    expect(created).toHaveLength(1);
    const devId = created[0]?.id;

    // No mismatch, so nothing is deleted and the identity is stable.
    const again = await app.inject({ method: "GET", url: PROTECTED_URL, remoteAddress: LOOPBACK });
    expect(again.statusCode).toBe(200);

    const stillThere = await db.select().from(user).where(eq(user.email, DEV_BYPASS_EMAIL));
    expect(stillThere).toHaveLength(1);
    expect(stillThere[0]?.id).toBe(devId);

    await close();
  });
});
