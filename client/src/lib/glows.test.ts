import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ABOUT_GLOWS } from "../pages/AboutPage.js";
import { APP_GLOW_PLACES } from "../components/AppLayout.js";
import { glowScreens, glowScreensFor, glowTiles, watchGlowScreens } from "./glows.js";

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
    // The app's sea glow carries its flat-centre stop (ledger 1083, index.css --app-glow-sea-flat); apricot and the landing do not.
    expect(glows).toContain("radial-gradient(circle calc(0.55 * hypot(50vw, 78svh)) at 50% 22svh, var(--color-app-glow-sea) var(--app-glow-sea-flat), transparent)");
    expect(count(glows, "var(--app-glow-sea-flat)")).toBe(3);
    expect(glowScreens("landing", [{ sea: "50% 22%", apricot: "86% 82%" }], 1)).not.toContain("flat");
    expect(glows).toContain("radial-gradient(circle calc(0.5 * hypot(94vw, 82svh)) at 94% 182svh, var(--color-app-glow-apricot), transparent)");
    expect(glows).toContain("at 50% 222svh, var(--color-app-glow-sea)");
  });

  it("the app ground: the round-15 places, tokens only, never fixed", () => {
    const ground = glowTiles("app", APP_GLOW_PLACES, 12);
    expect(count(ground.backgroundImage, "var(--color-app-glow-sea)")).toBe(12);
    expect(count(ground.backgroundImage, "var(--color-app-glow-apricot)")).toBe(12);
    expect(Object.values(ground).join(" ")).not.toMatch(/rgba?\(|#[0-9a-f]{3,6}\b|fixed|landing/i);
    expect(ground.backgroundPosition).toContain("0 calc(22svh - calc(0.55 * hypot(50vw, 78svh)))");
    expect(ground.backgroundPosition).toContain("0 calc(82svh - calc(0.5 * hypot(86vw, 82svh)))");
    expect(ground.backgroundPosition).toContain("0 calc(126svh - calc(0.55 * hypot(94vw, 74svh)))");
    expect(ground.backgroundPosition).toContain("0 calc(182svh - calc(0.5 * hypot(94vw, 82svh)))");
  });
});

describe("glowTiles: the app ground for a page of any length (ledger 1078, verify c1)", () => {
  const places = [{ sea: "50% 22%", apricot: "86% 82%" }, { sea: "6% 26%", apricot: "94% 82%" }];
  const layers = (list: string) => list.split(/,\s*(?=radial-gradient|0 calc|100% calc)/);
  it("draws glowScreens' circles, each in its own no-repeat tile just its circle's height", () => {
    const tiles = glowTiles("app", places, 3);
    const images = layers(tiles.backgroundImage);
    const sizes = layers(tiles.backgroundSize);
    const positions = layers(tiles.backgroundPosition);
    expect(images).toHaveLength(6);
    expect(sizes).toHaveLength(6);
    expect(positions).toHaveLength(6);
    expect(tiles.backgroundRepeat).toBe("no-repeat");
    // The same circle as glowScreens draws at 50% 22svh, centred in a tile 2r tall whose top is 22svh - r.
    const r = "calc(0.55 * hypot(50vw, 78svh))";
    expect(images[0]).toBe(`radial-gradient(circle ${r} at 50% 50%, var(--color-app-glow-sea) var(--app-glow-sea-flat), transparent)`);
    expect(sizes[0]).toBe(`100% calc(2 * ${r})`);
    expect(positions[0]).toBe(`0 calc(22svh - ${r})`);
    expect(glowScreens("app", places, 3)).toContain(`radial-gradient(circle ${r} at 50% 22svh, var(--color-app-glow-sea) var(--app-glow-sea-flat), transparent)`);
    // Third screen: the first place again, 200svh down.
    expect(positions[4]).toBe(`0 calc(222svh - ${r})`);
    expect(images[5]).toBe("radial-gradient(circle calc(0.5 * hypot(86vw, 82svh)) at 86% 50%, var(--color-app-glow-apricot), transparent)");
    expect(positions[5]).toBe("0 calc(282svh - calc(0.5 * hypot(86vw, 82svh)))");
  });
  it("covers every screen the page reaches, plus the next (its sea glow reaches up into the last)", () => {
    expect(glowScreensFor(844 * 21.4, 844)).toBe(23); // Recipes at 390x844 (verify c1)
    expect(glowScreensFor(568 * 33.9, 568)).toBe(35); // Recipes at 320x568
    expect(glowScreensFor(844, 844)).toBe(2);
    expect(glowScreensFor(845, 844)).toBe(3);
    // Not measured yet / no svh: the first screen and its neighbour.
    expect(glowScreensFor(5000, 0)).toBe(2);
    expect(glowScreensFor(Number.NaN, 844)).toBe(2);
  });
  it("watchGlowScreens counts from the ground's height in the probe's 100svh, on every resize of either", () => {
    const observed: unknown[] = [];
    let fire = () => {};
    let disconnected = false;
    class FakeResizeObserver {
      constructor(callback: () => void) {
        fire = callback;
      }
      observe(el: unknown) {
        observed.push(el);
      }
      disconnect() {
        disconnected = true;
      }
    }
    const saved = globalThis.ResizeObserver;
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    try {
      const page = { height: 844 * 5.5 };
      const ground = { getBoundingClientRect: () => page };
      const probe = { getBoundingClientRect: () => ({ height: 844 }) };
      const counts: number[] = [];
      const stop = watchGlowScreens(ground as unknown as Element, probe as unknown as Element, (n) => counts.push(n));
      expect(observed).toEqual([ground, probe]);
      fire();
      page.height = 844 * 30.2;
      fire();
      expect(counts).toEqual([7, 32]);
      stop();
      expect(disconnected).toBe(true);
    } finally {
      globalThis.ResizeObserver = saved;
    }
  });
  it("without a ResizeObserver it does nothing", () => {
    const saved = globalThis.ResizeObserver;
    // @ts-expect-error: an engine without ResizeObserver
    delete globalThis.ResizeObserver;
    try {
      const calls: number[] = [];
      watchGlowScreens({} as Element, {} as Element, (n) => calls.push(n))();
      expect(calls).toEqual([]);
    } finally {
      globalThis.ResizeObserver = saved;
    }
  });
});
