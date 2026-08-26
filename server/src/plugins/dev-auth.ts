import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyBaseLogger, FastifyInstance, FastifyRequest } from "fastify";
import type { Auth } from "../auth.js";
import type { Env } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Dev-only, loopback-only auto-authentication.
 *
 * Purpose: running the app on your own machine should not require signing in
 * every time the dev database is reset. Nothing here is a production
 * convenience — the whole feature is a no-op unless ALL of the following hold:
 *
 *   1. `NODE_ENV === "development"` — strict equality on purpose. A
 *      `!== "production"` check would also swallow the test environment and
 *      quietly weaken every auth assertion in the suite; the guard is written
 *      so `NODE_ENV=test` keeps real auth semantics.
 *   2. The request arrived on a loopback socket (127.0.0.1 / ::1). The address
 *      is read from the RAW socket, never from `request.ip` or
 *      `X-Forwarded-For` — a forwarding header is attacker-controlled and must
 *      never be able to switch this on.
 *   3. `DEV_AUTO_AUTH` is not set to "0" (the escape hatch for exercising the
 *      real sign-in flow locally).
 *   4. The request does not already carry a valid session — a real signed-in
 *      user in development is left completely alone.
 *
 * On top of those runtime guards the hook is not even installed outside
 * development (see `registerDevAutoAuth`), so in production and in the test
 * environment there is no code on the request path at all.
 *
 * The dev user's credential is a per-machine random secret kept in the
 * gitignored `.data/` directory (see `DEV_SECRET_FILE`), never a literal in
 * this file: the dev server binds 0.0.0.0, so a committed password would be a
 * working LAN-reachable login for anyone who has read the repository.
 */

/**
 * Fixed identity every bypassed request resolves to. `.local` rather than a
 * bare `@localhost`: better-auth validates the address, and a single-label
 * domain is rejected outright.
 */
export const DEV_BYPASS_EMAIL = "dev-bypass@localhost.local";
const DEV_BYPASS_NAME = "Dev Bypass";

/**
 * Where the dev user's credential lives: a machine-local file under the
 * server's gitignored data directory, alongside the PGlite dev database
 * (`server/.data/pglite`). Resolved exactly the way `db/index.ts` resolves
 * that one — `src/plugins/` and `src/db/` sit at the same depth, and so do
 * their compiled `dist/` counterparts, so `../../.data` is `server/.data`
 * whether the code runs through tsx or from `dist/`.
 *
 * It must NOT be a constant in this file. The dev API binds 0.0.0.0, and
 * `/api/auth/sign-in/email` is reachable from the LAN: a committed password
 * would let anyone who has read the repo sign in as the dev identity through
 * the ordinary sign-in endpoint, entirely bypassing the loopback check below.
 * A per-machine random secret that never leaves `.data/` closes that.
 */
export const DEV_SECRET_FILE = path.resolve(__dirname, "../../.data/dev-auth-secret");

/** 32 random bytes, hex encoded — comfortably inside better-auth's length limits. */
function generateDevSecret(): string {
  return randomBytes(32).toString("hex");
}

/** Reads the secret back, tightening the file's mode if it ever loosened. */
function readDevSecret(file: string): string | null {
  let contents: string;
  try {
    contents = readFileSync(file, "utf8");
  } catch {
    return null;
  }

  const secret = contents.trim();
  if (secret.length < 32) return null;

  try {
    if ((statSync(file).mode & 0o777) !== 0o600) chmodSync(file, 0o600);
  } catch {
    // Best effort: an unreadable mode is not a reason to refuse to boot.
  }
  return secret;
}

/**
 * The machine-local dev credential, generated on first need and reused on
 * every later boot. Written 0600 with an exclusive create, so two processes
 * starting at once converge on whichever one won rather than overwriting each
 * other's secret.
 */
export function loadOrCreateDevSecret(file: string = DEV_SECRET_FILE): string {
  const existing = readDevSecret(file);
  if (existing) return existing;

  mkdirSync(path.dirname(file), { recursive: true });
  const secret = generateDevSecret();
  try {
    writeFileSync(file, `${secret}\n`, { mode: 0o600, flag: "wx" });
  } catch {
    // Something is already at that path. Either another process won the
    // create race — in which case its secret is the one true secret, and
    // overwriting it would invalidate the account it just provisioned — or
    // the file is unusable (empty, truncated), in which case it is not a
    // credential at all and replacing it is the only way out.
    const raced = readDevSecret(file);
    if (raced) return raced;
    writeFileSync(file, `${secret}\n`, { mode: 0o600 });
  }
  // `mode:` only applies on create, and is filtered through the process
  // umask even then; make it explicit either way.
  chmodSync(file, 0o600);
  return secret;
}

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * True only for the machine's own loopback interface. `::ffff:127.0.0.1` is
 * the IPv4-mapped form Node reports on a dual-stack listener.
 */
export function isLoopbackAddress(address: string | undefined | null): boolean {
  if (!address) return false;
  return LOOPBACK_ADDRESSES.has(address.trim().toLowerCase());
}

/** The `DEV_AUTO_AUTH=0` escape hatch, read per request so it can be flipped. */
export function isDevAutoAuthDisabled(source: NodeJS.ProcessEnv = process.env): boolean {
  return source.DEV_AUTO_AUTH === "0";
}

/** `name=value` pairs from a Set-Cookie list, in `Cookie:` header form. */
function toCookieHeader(setCookie: readonly string[]): string {
  return setCookie
    .map((value) => value.split(";", 1)[0] ?? "")
    .filter((pair) => pair.length > 0)
    .join("; ");
}

/**
 * Drops any better-auth session cookie the caller sent while keeping every
 * other cookie (OAuth state cookies, for instance, matter mid-flow). We only
 * get here when the incoming session was absent or invalid, and leaving a
 * stale `session_token` next to the injected one would make cookie parsing
 * order decide who the caller is.
 */
function withoutSessionCookies(cookieHeader: string | undefined): string {
  if (!cookieHeader) return "";
  return cookieHeader
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => {
      const name = (pair.split("=", 1)[0] ?? "").toLowerCase();
      return !name.endsWith("session_token") && !name.endsWith("session_data");
    })
    .join("; ");
}

/**
 * Signs the dev user up. Returns null when the account already exists (or the
 * caller lost the provisioning race) — every failure here is recoverable by
 * signing in instead.
 */
async function trySignUp(auth: Auth, secret: string): Promise<string | null> {
  try {
    const created = await auth.api.signUpEmail({
      body: { email: DEV_BYPASS_EMAIL, password: secret, name: DEV_BYPASS_NAME },
      asResponse: true,
    });
    return toCookieHeader(created.headers.getSetCookie()) || null;
  } catch {
    return null;
  }
}

/** Signs the dev user in. Null means "no such user, or the secret no longer matches". */
async function trySignIn(auth: Auth, secret: string): Promise<string | null> {
  try {
    const signedIn = await auth.api.signInEmail({
      body: { email: DEV_BYPASS_EMAIL, password: secret },
      asResponse: true,
    });
    return toCookieHeader(signedIn.headers.getSetCookie()) || null;
  } catch {
    return null;
  }
}

/**
 * Provisions the dev user if needed and returns a `Cookie:` header carrying a
 * freshly minted session for it.
 *
 * Sign-up is attempted first so the account is created exactly the way a real
 * sign-up would create it (user row + credential account row) — no
 * hand-written rows that could drift from better-auth's expectations. A second
 * process racing the first loses on the `user.email` unique index; that is
 * caught here and turned into a plain sign-in, so concurrent first requests
 * converge on one account instead of erroring.
 *
 * The awkward corner is a credential mismatch: the dev database still holds
 * the dev user, but the secret that was used to create it is gone (the
 * `.data/dev-auth-secret` file was deleted, or the DB was copied from another
 * machine). Sign-up fails on the unique email, sign-in fails on the password,
 * and the developer would be stuck with a permanently broken bypass and no
 * explanation. So: if the row exists and the persisted secret does not open
 * it, the stale dev user is deleted (better-auth removes its session and
 * account rows; the schema's ON DELETE CASCADE takes the dev user's app data
 * with it) and re-provisioned under the current secret, with one warning line
 * saying exactly that happened.
 */
async function mintDevSessionCookie(
  auth: Auth,
  secret: string,
  log: FastifyBaseLogger,
): Promise<string | null> {
  const provisioned = await trySignUp(auth, secret);
  if (provisioned) return provisioned;

  const signedIn = await trySignIn(auth, secret);
  if (signedIn) return signedIn;

  // Neither worked. Only a genuine credential mismatch is recoverable here —
  // if there is no dev user at all, something else is wrong and blowing rows
  // away would be the wrong move.
  const ctx = await auth.$context;
  const stale = await ctx.internalAdapter.findUserByEmail(DEV_BYPASS_EMAIL);
  if (!stale) return null;

  log.warn(
    `dev auto-auth: the local dev-auth secret does not match the stored credential for ${DEV_BYPASS_EMAIL} (the secret file at ${DEV_SECRET_FILE} was probably deleted or the dev database came from another machine). Deleting and re-provisioning that user — its dev-only data has been reset.`,
  );
  await ctx.internalAdapter.deleteUser(stale.user.id);

  return (await trySignUp(auth, secret)) ?? (await trySignIn(auth, secret));
}

export interface RegisterDevAutoAuthOptions {
  auth: Auth;
  env: Env;
}

/**
 * Installs the bypass — and only in development.
 *
 * It runs as a root-scope `onRequest` hook, i.e. one central place ahead of
 * both `requireAuth` and the `/api/auth/*` handler. Because the session is
 * injected as a real cookie on the incoming request, everything downstream
 * resolves it through the normal better-auth path: protected routes see
 * `request.user`, and `/api/auth/get-session` reports the dev user too, so the
 * client needs no changes whatsoever.
 *
 * Signing out in development therefore just lands you back as the dev user:
 * sign-out revokes the injected session, the cached cookie fails its next
 * validation, and the following request mints a fresh one. That is the
 * intended (and documented) behaviour — use `DEV_AUTO_AUTH=0` to exercise the
 * real sign-in flow.
 */
export function registerDevAutoAuth(
  app: FastifyInstance,
  { auth, env }: RegisterDevAutoAuthOptions,
): void {
  // Strict equality: "test" and "production" must both fall through here so
  // the hook below never exists outside a developer's machine.
  if (env.NODE_ENV !== "development") return;

  let cachedCookie: string | null = null;
  let inFlight: Promise<string | null> | null = null;

  /**
   * Reading/creating the secret touches the filesystem, so it can fail (a
   * read-only checkout, say). A broken bypass must degrade to "you are not
   * signed in", never to a 500 on every request.
   */
  const mint = async (): Promise<string | null> => {
    try {
      return await mintDevSessionCookie(auth, loadOrCreateDevSecret(), app.log);
    } catch (error) {
      app.log.warn(
        { err: error },
        `dev auto-auth could not read or create the local dev secret at ${DEV_SECRET_FILE}`,
      );
      return null;
    }
  };

  const devSessionCookie = async (): Promise<string | null> => {
    if (cachedCookie) {
      const stillValid = await auth.api.getSession({
        headers: new Headers({ cookie: cachedCookie }),
      });
      if (stillValid) return cachedCookie;
      cachedCookie = null;
    }

    // Single-flight: a burst of first requests provisions once, not N times.
    // The secret is read (and generated, the very first time) inside the
    // single-flight promise, so booting in development touches no files until
    // a loopback request actually needs the dev identity.
    inFlight ??= mint();
    const pending = inFlight;
    try {
      cachedCookie = await pending;
    } finally {
      if (inFlight === pending) inFlight = null;
    }
    return cachedCookie;
  };

  app.addHook("onRequest", async (request: FastifyRequest) => {
    // Static assets and the SPA shell never read a session.
    if (!request.url.startsWith("/api/")) return;
    if (isDevAutoAuthDisabled()) return;

    // Raw socket address only. `request.ip` and X-Forwarded-For are derived
    // from headers the caller controls and must not reach this decision.
    if (!isLoopbackAddress(request.raw.socket?.remoteAddress)) return;

    const existing = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (existing) return;

    const cookie = await devSessionCookie();
    if (!cookie) {
      request.log.warn("dev auto-auth could not provision the local dev user");
      return;
    }

    const carried = withoutSessionCookies(request.headers.cookie);
    request.headers.cookie = carried ? `${carried}; ${cookie}` : cookie;
  });

  app.log.warn(
    `dev auto-auth is ON: unauthenticated loopback requests are served as ${DEV_BYPASS_EMAIL}, whose credential is the machine-local secret at ${DEV_SECRET_FILE}. Set DEV_AUTO_AUTH=0 to require sign-in.`,
  );
}
