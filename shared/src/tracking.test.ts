import { describe, expect, it } from "vitest";
import { deriveAllergenStatus, unionAllergenStatus } from "./tracking.js";

// The full precedence table for the derived-ladder/manual-override union, in
// one place. The route (server/src/routes/meals.ts) and the AI baby-profile
// summary (server/src/ai/tools.ts) both call this function, so pinning it
// here pins both: any change to who wins fails right at the rule.
describe("unionAllergenStatus", () => {
  it("leaves every derived status alone when there is no override", () => {
    expect(unionAllergenStatus(0, false)).toEqual({ status: "not_started", overridden: false });
    expect(unionAllergenStatus(1, false)).toEqual({ status: "started", overridden: false });
    expect(unionAllergenStatus(2, false)).toEqual({ status: "started", overridden: false });
    expect(unionAllergenStatus(3, false)).toEqual({ status: "established", overridden: false });
    expect(unionAllergenStatus(9, false)).toEqual({ status: "established", overridden: false });
  });

  it("promotes to established — and flags it — when only the override says so", () => {
    expect(unionAllergenStatus(0, true)).toEqual({ status: "established", overridden: true });
    expect(unionAllergenStatus(1, true)).toEqual({ status: "established", overridden: true });
    expect(unionAllergenStatus(2, true)).toEqual({ status: "established", overridden: true });
  });

  it("lets real exposures win: a stray override on derived-established is not flagged", () => {
    expect(unionAllergenStatus(3, true)).toEqual({ status: "established", overridden: false });
    expect(unionAllergenStatus(50, true)).toEqual({ status: "established", overridden: false });
  });

  it("never downgrades what the meal log derived", () => {
    for (const exposures of [0, 1, 2, 3, 4, 10]) {
      for (const hasOverride of [false, true]) {
        const derived = deriveAllergenStatus(exposures);
        const { status } = unionAllergenStatus(exposures, hasOverride);
        const rank = { not_started: 0, started: 1, established: 2 } as const;
        expect(rank[status]).toBeGreaterThanOrEqual(rank[derived]);
      }
    }
  });

  it("only ever flags `overridden` on an established row", () => {
    for (const exposures of [0, 1, 2, 3, 10]) {
      for (const hasOverride of [false, true]) {
        const { status, overridden } = unionAllergenStatus(exposures, hasOverride);
        if (overridden) expect(status).toBe("established");
      }
    }
  });
});
