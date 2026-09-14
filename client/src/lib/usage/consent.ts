import { DEFAULT_SHARE_USAGE_DATA } from "@blw/shared";

/**
 * Whether this device may send usage events at all.
 *
 * Three inputs, and any one of them can say no:
 *
 *   * the account's own `shareUsageData` preference (the Settings switch);
 *   * Do Not Track, the old browser header;
 *   * Global Privacy Control, the one that has legal weight in some places.
 *
 * Honouring DNT/GPC is not required by the schema — there is nothing
 * personal in an event — but a parent who has told their browser "do not
 * track me" has made a request, and an app about their child's food is the
 * last place to argue with it.
 *
 * Everything here is pure and synchronous: the check runs before an event is
 * ever built, not after it is queued.
 */

export interface ConsentInput {
  /**
   * The account preference, or `undefined` while the preferences query has
   * not answered yet. Unresolved is NOT permission — the caller buffers.
   */
  preference: boolean | undefined;
  doNotTrack: boolean;
  globalPrivacyControl: boolean;
}

/** The rule, in one place. `undefined` preference → not allowed (yet). */
export function isUsageSharingAllowed({ preference, doNotTrack, globalPrivacyControl }: ConsentInput): boolean {
  if (doNotTrack || globalPrivacyControl) return false;
  return preference === true;
}

/**
 * Whether the browser itself has opted out, regardless of the account
 * preference. Drives the Settings switch's disabled state (a switch that
 * says "on" while the browser says "no" would be a lie).
 */
export function isBrowserOptedOut({ doNotTrack, globalPrivacyControl }: Omit<ConsentInput, "preference">): boolean {
  return doNotTrack || globalPrivacyControl;
}

/**
 * The many spellings of "1" a DNT signal arrives as. Chrome/Firefox send the
 * string `"1"`; some older stacks use `"yes"`, a number or a boolean.
 */
export function isOptOutSignal(value: unknown): boolean {
  return value === "1" || value === 1 || value === true || value === "yes";
}

interface OptOutGlobals {
  navigator?: { doNotTrack?: unknown; msDoNotTrack?: unknown; globalPrivacyControl?: unknown };
  doNotTrack?: unknown;
}

/** Reads both signals off `window`/`navigator`. Never throws, never assumes a browser. */
export function readBrowserSignals(scope: OptOutGlobals | undefined = globalThis as OptOutGlobals): {
  doNotTrack: boolean;
  globalPrivacyControl: boolean;
} {
  const nav = scope?.navigator;
  return {
    doNotTrack: isOptOutSignal(nav?.doNotTrack) || isOptOutSignal(scope?.doNotTrack) || isOptOutSignal(nav?.msDoNotTrack),
    globalPrivacyControl: isOptOutSignal(nav?.globalPrivacyControl),
  };
}

/**
 * The account preference as the `["preferences"]` query knows it.
 *
 * `pending` buffers. A 401 is not an error here but a fact: nobody is signed
 * in, so there is no stored preference to honour and `/login` + `/signup`
 * are measured under the shipped default (the server stores them with a null
 * `user_id`). Any OTHER error resolves to `false`: a preferences endpoint we
 * cannot read is not a licence to assume yes.
 */
export function resolvePreference(query: {
  status: "pending" | "error" | "success";
  shareUsageData: boolean | undefined;
  unauthenticated: boolean;
}): boolean | undefined {
  if (query.status === "pending") return undefined;
  if (query.status === "error") return query.unauthenticated ? DEFAULT_SHARE_USAGE_DATA : false;
  return query.shareUsageData ?? DEFAULT_SHARE_USAGE_DATA;
}
