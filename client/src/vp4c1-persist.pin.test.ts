// Verifier p4-c1 pin (drop into client/src/): SPEC §4.4 "Plan reads are cached" —
// main.tsx persists the ["plan", …] reads, never the Copy sheet's dry run.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planKeys } from "./features/plan/hooks.js";

describe("verifier p4-c1 pin: the meal plan survives offline persistence", () => {
  it("main.tsx persists the 'plan' prefix the plan reads use, and not 'planCopyCheck'", () => {
    expect(planKeys.range("baby-1", "2026-10-12", "2026-10-18")[0]).toBe("plan");
    const main = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
    const block = /PERSISTED_QUERY_KEY_PREFIXES = new Set\(\[([\s\S]*?)\]\)/.exec(main)?.[1] ?? "";
    const set = block.replace(/\/\/[^\n]*/g, "");
    expect(set).toContain('"plan"');
    expect(set).not.toContain('"planCopyCheck"');
  });
});
