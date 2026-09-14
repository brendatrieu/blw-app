import { afterEach, describe, expect, it } from "vitest";
import { usageContextSchema } from "@blw/shared";
import {
  activeBabyAgeMonths,
  babyAgeBucket,
  babyCountBucket,
  buildUsageContext,
  currentUsageContext,
  platformFromUserAgent,
  readEnvironment,
  resetUsageAccountContext,
  setUsageAccountContext,
  usageAccountContext,
} from "./context.js";

afterEach(() => {
  resetUsageAccountContext();
});

describe("babyAgeBucket — six buckets is all a birth date ever becomes", () => {
  it.each([
    [0, "pre6"],
    [5, "pre6"],
    [6, "6-8"],
    [8, "6-8"],
    [9, "9-11"],
    [11, "9-11"],
    [12, "12-17"],
    [17, "12-17"],
    [18, "18+"],
    [48, "18+"],
  ])("%s months -> %s", (months, bucket) => {
    expect(babyAgeBucket(months)).toBe(bucket);
  });

  it("says 'none' for an account with no baby, and for anything nonsensical", () => {
    expect(babyAgeBucket(null)).toBe("none");
    expect(babyAgeBucket(undefined)).toBe("none");
    expect(babyAgeBucket(Number.NaN)).toBe("none");
  });
});

describe("babyCountBucket", () => {
  it.each([
    [0, "0"],
    [1, "1"],
    [2, "2+"],
    [5, "2+"],
    [-1, "0"],
  ])("%s babies -> %s", (count, bucket) => {
    expect(babyCountBucket(count)).toBe(bucket);
  });
});

describe("platformFromUserAgent — a device CLASS, never the device", () => {
  it("recognises the four classes without keeping a single UA string", () => {
    expect(platformFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("ios");
    expect(platformFromUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("ios");
    expect(platformFromUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("android");
    expect(platformFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("desktop");
    expect(platformFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("desktop");
    expect(platformFromUserAgent("Mozilla/5.0 (X11; CrOS x86_64)")).toBe("desktop");
    expect(platformFromUserAgent("")).toBe("other");
  });

  it("reads an iPadOS 13+ 'Macintosh' with touch points as the iPad it is", () => {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.0 Safari/605.1.15";
    expect(platformFromUserAgent(ua, 5)).toBe("ios");
    expect(platformFromUserAgent(ua, 0)).toBe("desktop");
  });
});

describe("activeBabyAgeMonths", () => {
  it("is null with no baby, and months otherwise", () => {
    expect(activeBabyAgeMonths(null)).toBeNull();
    expect(activeBabyAgeMonths(undefined)).toBeNull();
    expect(activeBabyAgeMonths({ birthDate: "2026-03-13" }, new Date("2026-09-13T12:00:00.000Z"))).toBe(6);
  });
});

describe("buildUsageContext", () => {
  it("assembles a context the shared schema accepts, all buckets and booleans", () => {
    const context = buildUsageContext({
      appVersion: "abc123def456",
      standalone: true,
      theme: "dark",
      platform: "android",
      online: false,
      account: { babyAgeMonths: 10, babyCount: 2, hasAiKey: true },
    });
    expect(() => usageContextSchema.parse(context)).not.toThrow();
    expect(context).toEqual({
      app_version: "abc123def456",
      standalone: true,
      theme: "dark",
      platform: "android",
      online: false,
      baby_age_bucket: "9-11",
      baby_count: "2+",
      has_ai_key: true,
    });
  });

  it("carries nothing that is not one of those eight keys", () => {
    const context = buildUsageContext({
      appVersion: "v",
      standalone: false,
      theme: "system",
      platform: "other",
      online: true,
      account: { babyAgeMonths: null, babyCount: 0, hasAiKey: false },
    });
    // No screen size, no timezone, no language, no user agent, no ids.
    expect(Object.keys(context).sort()).toEqual([
      "app_version",
      "baby_age_bucket",
      "baby_count",
      "has_ai_key",
      "online",
      "platform",
      "standalone",
      "theme",
    ]);
  });
});

describe("the published account context", () => {
  it("takes partial updates, and forgets everything on sign-out", () => {
    setUsageAccountContext({ babyCount: 2 });
    expect(usageAccountContext()).toEqual({ babyAgeMonths: null, babyCount: 2, hasAiKey: false });
    setUsageAccountContext({ babyAgeMonths: 7, hasAiKey: true });
    expect(usageAccountContext()).toEqual({ babyAgeMonths: 7, babyCount: 2, hasAiKey: true });
    resetUsageAccountContext();
    expect(usageAccountContext()).toEqual({ babyAgeMonths: null, babyCount: 0, hasAiKey: false });
  });
});

describe("readEnvironment / currentUsageContext outside a browser", () => {
  it("degrades to safe defaults rather than throwing", () => {
    expect(readEnvironment()).toEqual({ standalone: false, platform: "other", online: true });
  });

  it("still produces a schema-valid context, so a node-rendered call site cannot break", () => {
    setUsageAccountContext({ babyAgeMonths: 13, babyCount: 1, hasAiKey: false });
    const context = currentUsageContext();
    expect(() => usageContextSchema.parse(context)).not.toThrow();
    expect(context.baby_age_bucket).toBe("12-17");
    expect(context.theme).toBe("system");
  });
});
