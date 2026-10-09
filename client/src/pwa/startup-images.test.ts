// Item 772: iPhone launch screens. Every apple-touch-startup-image link must
// point at a PNG whose pixel size matches its media query exactly (iOS shows
// nothing otherwise), each size needs a light and a dark image, and the
// manifest's launch background (Android) must stay the app's --color-bg.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url));
const html = read("index.html").toString();
const links = [
  ...html.matchAll(/<link rel="apple-touch-startup-image" href="\/([^"]+)" media="([^"]+)"/g),
].map(([, href = "", media = ""]) => ({ href, media }));
const num = (media: string, feature: string) =>
  Number(media.match(new RegExp(`${feature}: (\\d+)`))?.[1]);

describe("iPhone launch screens (item 772)", () => {
  it("links a light and a dark image for every size", () => {
    expect(links.length).toBeGreaterThanOrEqual(22);
    const sizes = (scheme: string) =>
      links
        .filter((l) => l.media.includes(`prefers-color-scheme: ${scheme}`))
        .map((l) => l.media.replace(scheme, ""));
    expect(sizes("dark")).toEqual(sizes("light"));
    expect(sizes("light").length * 2).toBe(links.length);
  });

  it("each link is portrait and points at its own scheme's image (item 778)", () => {
    for (const { href, media } of links) {
      expect(media, href).toContain("(orientation: portrait)");
      const scheme = media.match(/prefers-color-scheme: (light|dark)/)?.[1];
      expect(href, media).toMatch(new RegExp(`^startup/${scheme}-\\d+x\\d+\\.png$`));
    }
  });

  it("each image's pixel size matches its media query", () => {
    for (const { href, media } of links) {
      const png = read(`public/${href}`);
      const dpr = num(media, "-webkit-device-pixel-ratio");
      // PNG IHDR: width and height are big-endian uint32 at bytes 16 and 20.
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], href).toEqual([
        num(media, "device-width") * dpr,
        num(media, "device-height") * dpr,
      ]);
    }
  });

  it("the manifest launch background is the app background", () => {
    const bg = read("src/styles/index.css")
      .toString()
      .match(/--color-bg:\s*(#[0-9a-f]{6})/i)?.[1];
    const config = read("vite.config.ts").toString();
    expect(config).toContain(`background_color: "${bg}"`);
    expect(config).toContain(`theme_color: "${bg}"`);
  });
});
