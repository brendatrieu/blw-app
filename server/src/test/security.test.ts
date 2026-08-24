import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.js";

describe("security headers", () => {
  it("sets locked-down headers on /", async () => {
    const { app, close } = await createTestApp();

    const response = await app.inject({ method: "GET", url: "/" });

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()");
    expect(response.headers["content-security-policy"]).toBeTruthy();
    expect(response.headers["strict-transport-security"]).toBeUndefined();

    await close();
  });

  it("sets the same headers on /api/health", async () => {
    const { app, close } = await createTestApp();

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["content-security-policy"]).toBeTruthy();
    expect(response.headers["strict-transport-security"]).toBeUndefined();

    await close();
  });

  it("builds a CSP that locks scripts/frames/forms to same-origin", async () => {
    const { app, close } = await createTestApp();

    const response = await app.inject({ method: "GET", url: "/api/health" });
    const csp = response.headers["content-security-policy"] as string;

    for (const directive of [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "manifest-src 'self'",
      "worker-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ]) {
      expect(csp).toContain(directive);
    }

    await close();
  });
});
