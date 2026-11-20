import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ABOUT_GLOWS } from "../pages/AboutPage.js";
import { APP_GLOWS } from "../components/AppLayout.js";
import { glowScreens } from "./glows.js";

const count = (s: string, needle: string) => s.split(needle).length - 1;

describe("glowScreens (ledgers 1052, 1078)", () => {
  it("About's glows are byte-identical to before the extraction", () => {
    // sha256 of ABOUT_GLOWS as AboutPage.tsx built it inline at 463de35 (1394 chars).
    expect(ABOUT_GLOWS).toHaveLength(1394);
    expect(createHash("sha256").update(ABOUT_GLOWS).digest("hex")).toBe("b74c0f171ec9e42d205fa08919ec35ea90be76ef2dc17b6bac8eca70309a30a4");
  });

  it("draws one sea + one apricot per screen in the family's own tokens, cycling the places", () => {
    const glows = glowScreens("app", [{ sea: "50% 22%", apricot: "86% 82%" }, { sea: "6% 26%", apricot: "94% 82%" }], 3);
    expect(count(glows, "var(--color-app-glow-sea)")).toBe(3);
    expect(count(glows, "var(--color-app-glow-apricot)")).toBe(3);
    expect(glows).not.toContain("landing");
    // Sized to ONE screen (55% / 50% of its farthest corner), placed down the page.
    expect(glows).toContain("radial-gradient(circle calc(0.55 * hypot(50vw, 78svh)) at 50% 22svh, var(--color-app-glow-sea), transparent)");
    expect(glows).toContain("radial-gradient(circle calc(0.5 * hypot(94vw, 82svh)) at 94% 182svh, var(--color-app-glow-apricot), transparent)");
    expect(glows).toContain("at 50% 222svh, var(--color-app-glow-sea)");
  });

  it("the app ground: the round-15 places, 12 screens, tokens only, never fixed", () => {
    expect(count(APP_GLOWS, "var(--color-app-glow-sea)")).toBe(12);
    expect(count(APP_GLOWS, "var(--color-app-glow-apricot)")).toBe(12);
    expect(APP_GLOWS).not.toMatch(/rgba?\(|#[0-9a-f]{3,6}\b|fixed/i);
    expect(APP_GLOWS).toContain("at 50% 22svh, var(--color-app-glow-sea)");
    expect(APP_GLOWS).toContain("at 86% 82svh, var(--color-app-glow-apricot)");
    expect(APP_GLOWS).toContain("at 6% 126svh, var(--color-app-glow-sea)");
    expect(APP_GLOWS).toContain("at 94% 182svh, var(--color-app-glow-apricot)");
  });
});
