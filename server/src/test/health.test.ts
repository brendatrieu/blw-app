import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";

describe("GET /api/health", () => {
  it("returns status ok", async () => {
    const app = buildApp({
      env: { PORT: 0, NODE_ENV: "test", DATABASE_URL: undefined },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });

    await app.close();
  });
});
