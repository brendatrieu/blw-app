import { ageInMonths, usageContextSchema, type UsageContext } from "@blw/shared";
import { getStoredTheme } from "../../theme.js";

/**
 * The session context every event carries: eight buckets and booleans that
 * answer "on what" without a single join back to a user row, and without a
 * single value specific enough to identify a device.
 *
 * `baby_age_bucket` is the only field derived from anything a parent typed,
 * and six buckets is all it can ever carry. There is no screen size, no
 * timezone, no language, no user agent string and no id — each of which is a
 * fingerprint bit, and none of which any question in the plan needs.
 */

export type UsagePlatform = UsageContext["platform"];

/** Months since birth → the six-way bucket. `null` months means "no baby". */
export function babyAgeBucket(months: number | null | undefined): UsageContext["baby_age_bucket"] {
  if (months === null || months === undefined || !Number.isFinite(months)) return "none";
  if (months < 6) return "pre6";
  if (months < 9) return "6-8";
  if (months < 12) return "9-11";
  if (months < 18) return "12-17";
  return "18+";
}

/** Babies on the account: 0, 1, or "more than one". */
export function babyCountBucket(count: number): UsageContext["baby_count"] {
  if (!Number.isFinite(count) || count <= 0) return "0";
  return count === 1 ? "1" : "2+";
}

/**
 * The device CLASS, not the device.
 *
 * Four values, from the coarsest possible read of the user agent — enough to
 * answer "is the iOS install prompt worth building" and nothing like enough
 * to tell two parents apart. The full UA string is never sent.
 *
 * iPadOS 13+ reports itself as "Macintosh"; the touch-point count is what
 * separates a real Mac from an iPad pretending to be one.
 */
export function platformFromUserAgent(userAgent: string, maxTouchPoints = 0): UsagePlatform {
  const ua = userAgent ?? "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Windows|Macintosh|Linux|CrOS|X11/i.test(ua)) return "desktop";
  return "other";
}

/**
 * The facts only the running app knows — whose numbers come from queries
 * rather than from the browser. Published by `UsageProvider` on every change
 * so `track()` can build a context synchronously from anywhere, including
 * the top-level ErrorBoundary that sits outside every provider.
 */
export interface UsageAccountContext {
  /** Age in months of the ACTIVE baby, or null when there is none. */
  babyAgeMonths: number | null;
  babyCount: number;
  hasAiKey: boolean;
}

const account: UsageAccountContext = { babyAgeMonths: null, babyCount: 0, hasAiKey: false };

export function setUsageAccountContext(next: Partial<UsageAccountContext>): void {
  if (next.babyAgeMonths !== undefined) account.babyAgeMonths = next.babyAgeMonths;
  if (next.babyCount !== undefined) account.babyCount = next.babyCount;
  if (next.hasAiKey !== undefined) account.hasAiKey = next.hasAiKey;
}

/** Test/sign-out seam: forgets the account facts without touching consent. */
export function resetUsageAccountContext(): void {
  account.babyAgeMonths = null;
  account.babyCount = 0;
  account.hasAiKey = false;
}

export function usageAccountContext(): UsageAccountContext {
  return { ...account };
}

/** The active baby's age in months, or null — the one derivation from a birth date. */
export function activeBabyAgeMonths(baby: { birthDate: string } | null | undefined, now?: Date): number | null {
  if (!baby) return null;
  return ageInMonths(baby.birthDate, now);
}

/** The app version the bundle was built with (the deploy SHA, or `<version>-dev`). */
export function appVersion(): string {
  // `__APP_VERSION__` is a build-time define; the node test config supplies
  // its own value. The guard is for any context that has neither.
  try {
    return typeof __APP_VERSION__ === "string" && __APP_VERSION__.length > 0 ? __APP_VERSION__ : "unknown";
  } catch {
    return "unknown";
  }
}

export interface EnvironmentFacts {
  standalone: boolean;
  platform: UsagePlatform;
  online: boolean;
}

/** What the browser can say about itself. All three degrade to a safe default. */
export function readEnvironment(): EnvironmentFacts {
  if (typeof window === "undefined") {
    return { standalone: false, platform: "other", online: true };
  }
  let standalone = false;
  try {
    standalone =
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      // iOS Safari's own flag, which predates the media query.
      (window.navigator as { standalone?: boolean }).standalone === true;
  } catch {
    standalone = false;
  }
  const navigator = window.navigator as Navigator | undefined;
  return {
    standalone,
    platform: platformFromUserAgent(navigator?.userAgent ?? "", navigator?.maxTouchPoints ?? 0),
    online: navigator?.onLine !== false,
  };
}

export interface BuildContextInput extends EnvironmentFacts {
  appVersion: string;
  theme: UsageContext["theme"];
  account: UsageAccountContext;
}

/** Pure assembly, so every bucket boundary is pinned without a browser. */
export function buildUsageContext(input: BuildContextInput): UsageContext {
  return {
    app_version: input.appVersion,
    standalone: input.standalone,
    theme: input.theme,
    platform: input.platform,
    online: input.online,
    baby_age_bucket: babyAgeBucket(input.account.babyAgeMonths),
    baby_count: babyCountBucket(input.account.babyCount),
    has_ai_key: input.account.hasAiKey,
  };
}

/**
 * The context as it stands right now. Read fresh per event rather than
 * cached at boot: `online`, `theme` and `standalone` all change mid-session,
 * and a stale context is a wrong answer to "did this happen offline".
 */
export function currentUsageContext(): UsageContext {
  const environment = readEnvironment();
  const context = buildUsageContext({
    ...environment,
    appVersion: appVersion(),
    theme: readTheme(),
    account: usageAccountContext(),
  });
  // Cheap belt-and-braces: the schema is the contract, and a context that
  // somehow failed it would poison a whole batch at flush time instead of
  // failing here where the mistake is.
  return usageContextSchema.parse(context);
}

function readTheme(): UsageContext["theme"] {
  try {
    return getStoredTheme();
  } catch {
    return "system";
  }
}
