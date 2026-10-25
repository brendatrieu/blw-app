import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { markIosStandalone } from "./iosStandalone.js";

const fakeRoot = () => ({ dataset: {} as Record<string, string> }) as unknown as HTMLElement;

describe("markIosStandalone (ledger 892)", () => {
  it("sets data-ios-standalone only when navigator.standalone === true", () => {
    const root = fakeRoot();
    markIosStandalone({ standalone: true } as unknown as Navigator, root);
    expect(root.dataset).toEqual({ iosStandalone: "" });
  });

  it.each([
    ["an iOS Safari tab", { standalone: false }],
    ["desktop / Android (no property)", {}],
    ["a truthy non-boolean", { standalone: "true" }],
  ])("leaves <html> alone in %s", (_label, nav) => {
    const root = fakeRoot();
    markIosStandalone(nav as unknown as Navigator, root);
    expect(root.dataset).toEqual({});
  });
});

// Without the boot call the clearance never applies on the phone, and no other
// test would notice (892 verifier).
describe("boot (ledger 892)", () => {
  it("main.tsx calls markIosStandalone() at startup", () => {
    const main = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");
    expect(main).toMatch(/^markIosStandalone\(\);$/m);
  });
});
