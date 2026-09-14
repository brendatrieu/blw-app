import { describe, expect, it } from "vitest";
import { DEFAULT_SHARE_USAGE_DATA } from "@blw/shared";
import {
  isBrowserOptedOut,
  isOptOutSignal,
  isUsageSharingAllowed,
  readBrowserSignals,
  resolvePreference,
} from "./consent.js";

describe("isUsageSharingAllowed — the truth table", () => {
  const CASES: Array<[boolean | undefined, boolean, boolean, boolean]> = [
    // preference,  DNT,   GPC,   allowed
    [true, false, false, true],
    [false, false, false, false],
    [undefined, false, false, false],
    [true, true, false, false],
    [true, false, true, false],
    [true, true, true, false],
    [false, true, false, false],
    [undefined, true, false, false],
    [undefined, false, true, false],
  ];

  it.each(CASES)(
    "preference=%s dnt=%s gpc=%s -> %s",
    (preference, doNotTrack, globalPrivacyControl, allowed) => {
      expect(isUsageSharingAllowed({ preference, doNotTrack, globalPrivacyControl })).toBe(allowed);
    },
  );

  it("treats an unresolved preference as not-yet-permission, never as yes", () => {
    // The whole reason `track()` buffers: an event built before the answer
    // arrives must not be sent on the assumption that it will be yes.
    expect(isUsageSharingAllowed({ preference: undefined, doNotTrack: false, globalPrivacyControl: false })).toBe(false);
  });

  it("lets either browser signal veto a preference that says yes", () => {
    expect(isBrowserOptedOut({ doNotTrack: true, globalPrivacyControl: false })).toBe(true);
    expect(isBrowserOptedOut({ doNotTrack: false, globalPrivacyControl: true })).toBe(true);
    expect(isBrowserOptedOut({ doNotTrack: false, globalPrivacyControl: false })).toBe(false);
  });
});

describe("isOptOutSignal — the spellings a browser uses", () => {
  it("accepts every shape of 'yes, opt me out'", () => {
    for (const value of ["1", 1, true, "yes"]) expect(isOptOutSignal(value)).toBe(true);
  });

  it("rejects everything else, including the explicit 'no'", () => {
    for (const value of ["0", 0, false, "no", null, undefined, "unspecified", ""]) {
      expect(isOptOutSignal(value)).toBe(false);
    }
  });
});

describe("readBrowserSignals", () => {
  it("reads navigator.doNotTrack, the legacy window flag, and GPC", () => {
    expect(readBrowserSignals({ navigator: { doNotTrack: "1" } })).toEqual({
      doNotTrack: true,
      globalPrivacyControl: false,
    });
    expect(readBrowserSignals({ doNotTrack: "1", navigator: {} })).toEqual({
      doNotTrack: true,
      globalPrivacyControl: false,
    });
    expect(readBrowserSignals({ navigator: { msDoNotTrack: "1" } })).toEqual({
      doNotTrack: true,
      globalPrivacyControl: false,
    });
    expect(readBrowserSignals({ navigator: { globalPrivacyControl: true } })).toEqual({
      doNotTrack: false,
      globalPrivacyControl: true,
    });
  });

  it("says no-signal where there is no browser at all, and never throws", () => {
    expect(readBrowserSignals(undefined)).toEqual({ doNotTrack: false, globalPrivacyControl: false });
    expect(readBrowserSignals({})).toEqual({ doNotTrack: false, globalPrivacyControl: false });
  });
});

describe("resolvePreference — the account's answer, from the query", () => {
  it("waits while the query is in flight", () => {
    expect(resolvePreference({ status: "pending", shareUsageData: undefined, unauthenticated: false })).toBeUndefined();
  });

  it("takes the stored value once it resolves, both ways", () => {
    expect(resolvePreference({ status: "success", shareUsageData: true, unauthenticated: false })).toBe(true);
    expect(resolvePreference({ status: "success", shareUsageData: false, unauthenticated: false })).toBe(false);
  });

  it("falls back to the shipped default for an account with no row", () => {
    expect(resolvePreference({ status: "success", shareUsageData: undefined, unauthenticated: false })).toBe(
      DEFAULT_SHARE_USAGE_DATA,
    );
  });

  it("measures signed-out visitors under the default — /login and /signup are the funnel", () => {
    // A 401 is not a failure to read the preference; it is the fact that
    // there is no account yet to have one.
    expect(resolvePreference({ status: "error", shareUsageData: undefined, unauthenticated: true })).toBe(
      DEFAULT_SHARE_USAGE_DATA,
    );
  });

  it("says NO when the preference genuinely could not be read", () => {
    // A 500 on /api/preferences is not a licence to assume yes: the parent
    // may be someone who switched sharing off.
    expect(resolvePreference({ status: "error", shareUsageData: undefined, unauthenticated: false })).toBe(false);
  });
});
