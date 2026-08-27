import { describe, expect, it } from "vitest";
import {
  isCatalogRoute,
  isNetworkOnlyRoute,
  isMealPostRoute,
  isUserDataRoute,
} from "./route-matchers.js";

const ORIGIN = "https://150.230.179.103.sslip.io";

function args(href: string, origin = ORIGIN) {
  const url = new URL(href);
  return { url, sameOrigin: url.origin === origin };
}

describe("isMealPostRoute", () => {
  it("matches a meal POST url", () => {
    expect(isMealPostRoute(args(`${ORIGIN}/api/babies/abc-123/meals`))).toBe(true);
  });

  it("matches with trailing query string", () => {
    expect(isMealPostRoute(args(`${ORIGIN}/api/babies/abc-123/meals?limit=1`))).toBe(true);
  });

  it("rejects a cross-origin url with the same path", () => {
    expect(isMealPostRoute(args("https://evil.example.com/api/babies/abc-123/meals"))).toBe(
      false,
    );
  });

  it("rejects unrelated api paths", () => {
    expect(isMealPostRoute(args(`${ORIGIN}/api/babies/abc-123`))).toBe(false);
  });
});

describe("isCatalogRoute", () => {
  it("matches /api/foods", () => {
    expect(isCatalogRoute(args(`${ORIGIN}/api/foods`))).toBe(true);
  });

  it("matches /api/foods/x", () => {
    expect(isCatalogRoute(args(`${ORIGIN}/api/foods/x`))).toBe(true);
  });

  it("matches /api/recipes/y", () => {
    expect(isCatalogRoute(args(`${ORIGIN}/api/recipes/y`))).toBe(true);
  });

  it("does not match /api/health", () => {
    expect(isCatalogRoute(args(`${ORIGIN}/api/health`))).toBe(false);
  });

  it("rejects cross-origin urls", () => {
    expect(isCatalogRoute(args("https://evil.example.com/api/foods"))).toBe(false);
  });
});

describe("isUserDataRoute", () => {
  it("matches /api/babies", () => {
    expect(isUserDataRoute(args(`${ORIGIN}/api/babies`))).toBe(true);
  });

  it("matches /api/pantry", () => {
    expect(isUserDataRoute(args(`${ORIGIN}/api/pantry`))).toBe(true);
  });

  it("matches /api/favorites", () => {
    expect(isUserDataRoute(args(`${ORIGIN}/api/favorites`))).toBe(true);
  });

  it("does not match /api/foods", () => {
    expect(isUserDataRoute(args(`${ORIGIN}/api/foods`))).toBe(false);
  });

  it("rejects cross-origin urls", () => {
    expect(isUserDataRoute(args("https://evil.example.com/api/babies"))).toBe(false);
  });
});

describe("isNetworkOnlyRoute", () => {
  it("matches /api/auth/*", () => {
    expect(isNetworkOnlyRoute(args(`${ORIGIN}/api/auth/sign-in`))).toBe(true);
  });

  it("matches /api/ai/*", () => {
    expect(isNetworkOnlyRoute(args(`${ORIGIN}/api/ai/chat`))).toBe(true);
  });

  it("matches /api/account/*", () => {
    expect(isNetworkOnlyRoute(args(`${ORIGIN}/api/account/settings`))).toBe(true);
  });

  it("does not match /api/foods", () => {
    expect(isNetworkOnlyRoute(args(`${ORIGIN}/api/foods`))).toBe(false);
  });

  it("rejects cross-origin urls", () => {
    expect(isNetworkOnlyRoute(args("https://evil.example.com/api/auth/sign-in"))).toBe(false);
  });
});
