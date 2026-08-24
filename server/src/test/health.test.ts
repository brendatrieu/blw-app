import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.js";

describe("GET /api/health", () => {
  it("returns status ok", async () => {
    const { app, close } = await createTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });

    await close();
  });
});
