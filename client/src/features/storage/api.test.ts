import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The storage API client is the ONLY caller of these routes, and a stale
// path would fail silently at runtime (404s) — every gate stayed green when
// a verifier reverted one to /api/fridge. Pin the paths at the source.
describe("storage api paths", () => {
  const source = readFileSync(new URL("./api.ts", import.meta.url), "utf8");

  it("targets /api/storage and never the renamed-away /api/fridge or /api/pantry", () => {
    expect(source).toContain("/api/storage");
    expect(source).not.toContain("/api/fridge");
    expect(source).not.toContain("/api/pantry");
  });

  it("keeps every storage route the client relies on", () => {
    for (const path of ['/api/storage', '/api/storage/', '/api/storage?view=']) expect(source).toContain(path);
  });
});
