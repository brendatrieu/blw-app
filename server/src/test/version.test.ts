import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.js";

describe("GET /api/version", () => {
  it("returns the configured build, uncached, without a login", async () => {
    const { app, close } = await createTestApp({ APP_VERSION: "abc123def456" });

    // No cookie: the client checks this before anyone has signed in.
    const response = await app.inject({ method: "GET", url: "/api/version" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ version: "abc123def456" });
    // A cached answer would hide the very deploy the client is looking for.
    expect(response.headers["cache-control"]).toBe("no-store");

    await close();
  });

  it("returns null when no build is configured (dev and test)", async () => {
    const { app, close } = await createTestApp();

    const response = await app.inject({ method: "GET", url: "/api/version" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ version: null });

    await close();
  });
});
