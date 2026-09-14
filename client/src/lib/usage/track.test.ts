import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UsageEventEnvelope } from "@blw/shared";
import type { QueueStorage, SendOutcome } from "./queue.js";
import {
  USAGE_PENDING_MAX,
  USAGE_SESSION_IDLE_MS,
  configureUsageQueue,
  currentRoutePattern,
  discardUsage,
  flushUsage,
  fromRouteFor,
  isTrackingAllowed,
  pendingUsageCount,
  recordRouteChange,
  resetUsage,
  setUsageConsent,
  shouldStartSession,
  track,
} from "./track.js";

/**
 * `track()` is the door consent is enforced at, so this suite is mostly
 * about what does NOT happen: nothing sent before the account's preference
 * is known, nothing kept once it comes back "off", and nothing at all while
 * the browser is asking not to be tracked.
 */

let sent: UsageEventEnvelope[][] = [];
let stored: UsageEventEnvelope[] = [];
let cleared = 0;

function harness(outcome: SendOutcome = "sent") {
  const storage: QueueStorage = {
    read: async () => [...stored],
    write: async (rows) => {
      stored = [...rows];
    },
    clear: async () => {
      stored = [];
      cleared += 1;
    },
  };
  configureUsageQueue({
    storage,
    send: async (batch) => {
      sent.push([...batch]);
      return outcome;
    },
  });
}

/** Names of everything that reached the transport, in order. */
async function sentNames(): Promise<string[]> {
  await flushUsage();
  return sent.flat().map((event) => event.name);
}

beforeEach(() => {
  sent = [];
  stored = [];
  cleared = 0;
  resetUsage();
  harness();
});

afterEach(() => {
  resetUsage();
  vi.unstubAllGlobals();
});

describe("shouldStartSession", () => {
  it("starts one at boot, and again only after a long enough gap", () => {
    expect(shouldStartSession(null, 1_000)).toBe(true);
    expect(shouldStartSession(1_000, 1_000 + USAGE_SESSION_IDLE_MS - 1)).toBe(false);
    expect(shouldStartSession(1_000, 1_000 + USAGE_SESSION_IDLE_MS)).toBe(true);
  });
});

describe("buffering until the preference resolves", () => {
  it("holds events in memory — no request, no storage — while the answer is unknown", async () => {
    track("pwa_launch", { display: "browser" }, { pathname: null });
    expect(isTrackingAllowed()).toBe(false);
    // session_started rides in front of the first event.
    expect(pendingUsageCount()).toBe(2);
    expect(sent).toEqual([]);
    expect(stored).toEqual([]);
  });

  it("releases the buffer the moment the answer is yes, oldest first", async () => {
    track("pwa_launch", { display: "browser" }, { pathname: null });
    track("screen_viewed", { route_pattern: "/", from_route: null }, { pathname: "/" });
    setUsageConsent(true);
    expect(pendingUsageCount()).toBe(0);
    expect(await sentNames()).toEqual(["session_started", "pwa_launch", "screen_viewed"]);
  });

  it("DROPS the buffer when the answer is no, and wipes what a previous session stored", async () => {
    stored = [];
    track("pwa_launch", { display: "browser" }, { pathname: null });
    expect(pendingUsageCount()).toBe(2);

    setUsageConsent(false);
    expect(pendingUsageCount()).toBe(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(cleared).toBeGreaterThan(0);
    expect(await sentNames()).toEqual([]);
  });

  it("stops sending entirely once sharing is switched off mid-session", async () => {
    setUsageConsent(true);
    track("screen_viewed", { route_pattern: "/", from_route: null }, { pathname: "/" });
    await flushUsage();
    const before = sent.flat().length;

    setUsageConsent(false);
    track("screen_viewed", { route_pattern: "/more", from_route: "/" }, { pathname: "/more" });
    await flushUsage();
    expect(sent.flat().length).toBe(before);
  });

  it("bounds the buffer, keeping the most recent events", () => {
    for (let i = 0; i < USAGE_PENDING_MAX + 25; i += 1) {
      track("symptom_check_started", {}, { pathname: null });
    }
    expect(pendingUsageCount()).toBe(USAGE_PENDING_MAX);
  });
});

describe("Do Not Track / Global Privacy Control", () => {
  it("builds nothing at all — not even a buffered copy — while the browser says no", () => {
    vi.stubGlobal("navigator", { doNotTrack: "1" });
    track("pwa_launch", { display: "browser" }, { pathname: null });
    expect(pendingUsageCount()).toBe(0);
  });

  it("overrides an account preference that says yes", async () => {
    vi.stubGlobal("navigator", { globalPrivacyControl: true });
    setUsageConsent(true);
    expect(isTrackingAllowed()).toBe(false);
    track("pwa_launch", { display: "browser" }, { pathname: null });
    expect(await sentNames()).toEqual([]);
  });
});

describe("sessions", () => {
  it("puts exactly one session_started in front of a burst of activity", async () => {
    setUsageConsent(true);
    const now = new Date("2026-09-13T10:00:00.000Z");
    track("screen_viewed", { route_pattern: "/", from_route: null }, { pathname: "/", now });
    track("screen_viewed", { route_pattern: "/more", from_route: "/" }, { pathname: "/more", now });
    expect(await sentNames()).toEqual(["session_started", "screen_viewed", "screen_viewed"]);
  });

  it("starts a new one after 30 minutes idle", async () => {
    setUsageConsent(true);
    const start = new Date("2026-09-13T10:00:00.000Z");
    track("screen_viewed", { route_pattern: "/", from_route: null }, { pathname: "/", now: start });
    const later = new Date(start.getTime() + USAGE_SESSION_IDLE_MS + 1);
    track("screen_viewed", { route_pattern: "/", from_route: null }, { pathname: "/", now: later });
    expect(await sentNames()).toEqual(["session_started", "screen_viewed", "session_started", "screen_viewed"]);
  });

  it("never recurses: a session_started of its own does not trigger another", async () => {
    setUsageConsent(true);
    track("session_started", {}, { pathname: null });
    expect(await sentNames()).toEqual(["session_started"]);
  });
});

describe("navigation", () => {
  it("remembers where the parent came from, including two visits to the same pattern", () => {
    expect(currentRoutePattern()).toBeNull();
    expect(recordRouteChange("/foods")).toBeNull();
    expect(recordRouteChange("/foods/:slug")).toBe("/foods");
    expect(recordRouteChange("/foods/:slug")).toBe("/foods/:slug");
    expect(currentRoutePattern()).toBe("/foods/:slug");
  });

  it("answers from_route the same way whichever effect ran first", () => {
    recordRouteChange("/safety");
    // A page's own effect runs BEFORE the provider's, so the arrival is not
    // recorded yet...
    expect(fromRouteFor("/safety/:slug")).toBe("/safety");
    recordRouteChange("/safety/:slug");
    // ...and once it is, the answer is unchanged.
    expect(fromRouteFor("/safety/:slug")).toBe("/safety");
  });
});

describe("flush and discard", () => {
  it("flushes nothing while consent is unresolved or denied", async () => {
    track("pwa_launch", { display: "browser" }, { pathname: null });
    await flushUsage();
    expect(sent).toEqual([]);
  });

  it("discard empties both the buffer and the persisted queue", async () => {
    setUsageConsent(true);
    track("pwa_launch", { display: "browser" }, { pathname: null });
    await discardUsage();
    await flushUsage();
    expect(sent).toEqual([]);
    expect(stored).toEqual([]);
  });

  it("never throws out of track(), whatever the transport does", () => {
    configureUsageQueue({
      storage: {
        read: async () => {
          throw new Error("no idb");
        },
        write: async () => {
          throw new Error("quota");
        },
        clear: async () => {
          throw new Error("nope");
        },
      },
      send: async () => {
        throw new Error("blocked");
      },
    });
    setUsageConsent(true);
    expect(() => track("pwa_launch", { display: "browser" }, { pathname: null })).not.toThrow();
  });
});
