// Ledger 957 (verifier B c1, N1): the delete question's read is parsed with
// the shared schema, so a malformed answer fails (and the question falls back
// to "This cannot be undone.") instead of reaching it as undefined counts.
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ body: undefined as unknown, paths: [] as string[] }));

vi.mock("../../lib/api.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api.js")>()),
  apiGet: async (path: string) => {
    h.paths.push(path);
    return h.body;
  },
}));

const { fetchRecipePlanCount } = await import("./api.js");

describe("fetchRecipePlanCount", () => {
  it("returns the parsed counts and rejects a body without them", async () => {
    h.body = { plannedMealCount: 2, mealCount: 1, storageCount: 0, extra: "dropped" };
    await expect(fetchRecipePlanCount("a/b")).resolves.toEqual({ plannedMealCount: 2, mealCount: 1, storageCount: 0 });
    expect(h.paths).toEqual(["/api/recipes/a%2Fb/plan-count"]);

    // An older server's answer (937: plan count only) is not this shape.
    h.body = { plannedMealCount: 2 };
    await expect(fetchRecipePlanCount("x")).rejects.toThrow();
  });
});
