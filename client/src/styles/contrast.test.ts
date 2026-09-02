import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Automated WCAG AA gate for the design tokens in `./index.css`.
 *
 * Parses both the light (bare `:root`) and dark (`:root[data-theme="dark"]`)
 * token blocks straight out of the real CSS file (no hand-copied values to
 * drift out of sync), resolves `var(--x)` indirection, composites the
 * translucent chip tints (`rgba(...)`) over both grounds, and asserts every
 * pairing the app actually renders. A failure here means a real pixel in
 * the app — in one theme, at least — is below AA, not a lint nitpick.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.join(__dirname, "index.css");
const css = readFileSync(cssPath, "utf8");

// ---------------------------------------------------------------------------
// CSS token parsing
// ---------------------------------------------------------------------------

/** Finds `selector { ... }` and returns the text between the matching braces, or null. */
function extractBlock(source: string, selector: string): string | null {
  const start = source.indexOf(selector);
  if (start === -1) return null;
  const openBrace = source.indexOf("{", start);
  if (openBrace === -1) return null;
  let depth = 0;
  for (let i = openBrace; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(openBrace + 1, i);
    }
  }
  return null;
}

/** Parses `--name: value;` declarations (top-level only) out of a block's text into a Map. */
function parseDeclarations(blockText: string): Map<string, string> {
  const map = new Map<string, string>();
  // Values may themselves contain commas/parens (rgba(...)) but not semicolons.
  const re = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blockText))) {
    map.set(m[1]!, m[2]!.trim());
  }
  return map;
}

const rootBlock = extractBlock(css, "\n:root {") ?? extractBlock(css, ":root {");
if (!rootBlock) throw new Error("contrast.test: could not find a `:root { ... }` block in index.css");
const rootVars = parseDeclarations(rootBlock);

const darkBlock = extractBlock(css, ':root[data-theme="dark"] {');
if (!darkBlock) throw new Error('contrast.test: could not find a `:root[data-theme="dark"] { ... }` block in index.css');
const darkVars = new Map([...rootVars, ...parseDeclarations(darkBlock)]);

type Mode = "light" | "dark";

/** Resolves a token name to its literal value, following one or more `var(--x)` hops. */
function resolve(name: string, mode: Mode, visited = new Set<string>()): string {
  if (visited.has(name)) throw new Error(`Circular token reference: ${name}`);
  visited.add(name);
  const map = mode === "light" ? rootVars : darkVars;
  const raw = map.get(name);
  if (raw === undefined) throw new Error(`Token --${name} is not defined in ${mode} mode`);
  const varMatch = /^var\(--([\w-]+)\)$/.exec(raw);
  if (varMatch) return resolve(varMatch[1]!, mode, visited);
  return raw;
}

// ---------------------------------------------------------------------------
// Color math
// ---------------------------------------------------------------------------

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(value: string): Rgba {
  const v = value.trim();
  const rgbaMatch = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(v);
  if (rgbaMatch) {
    return {
      r: Number(rgbaMatch[1]),
      g: Number(rgbaMatch[2]),
      b: Number(rgbaMatch[3]),
      a: rgbaMatch[4] !== undefined ? Number(rgbaMatch[4]) : 1,
    };
  }
  const clean = v.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const int = parseInt(full, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255, a: 1 };
}

/** Alpha-composites `fg` (possibly translucent) over an opaque `bg`, returning an opaque color. */
function compositeOver(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance({ r, g, b }: Rgba): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrastRatio(a: Rgba, b: Rgba): number {
  const lA = relativeLuminance(a);
  const lB = relativeLuminance(b);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Resolves a token to a fully opaque color, compositing over `groundToken` if it carries alpha. */
function opaqueColorOf(token: string, mode: Mode, groundToken: string): Rgba {
  const raw = parseColor(resolve(token, mode));
  if (raw.a >= 1) return raw;
  const ground = parseColor(resolve(groundToken, mode));
  return compositeOver(raw, ground);
}

function ratioOf(fgToken: string, bgToken: string, mode: Mode): number {
  const bg = parseColor(resolve(bgToken, mode));
  const fg = opaqueColorOf(fgToken, mode, bgToken);
  return contrastRatio(fg, bg);
}

// ---------------------------------------------------------------------------
// Declared pairings — every text/background (or icon/fill, non-text UI)
// combination the app actually renders. `min` defaults to 4.5 (normal
// text); pass 3 for large-text/UI-only pairs (focus rings, dots).
// ---------------------------------------------------------------------------

interface Pair {
  name: string;
  fg: string;
  bg: string;
  min?: number;
}

const GROUNDS = ["color-bg", "color-bg-elevated"] as const;

const BASE_PAIRS: Pair[] = [
  { name: "body text on page", fg: "color-text", bg: "color-bg" },
  { name: "body text on elevated surface", fg: "color-text", bg: "color-bg-elevated" },
  { name: "body text on inset surface", fg: "color-text", bg: "color-bg-inset" },
  { name: "muted text on page", fg: "color-text-muted", bg: "color-bg" },
  { name: "muted text on elevated surface", fg: "color-text-muted", bg: "color-bg-elevated" },

  // CTA fill (Button/Badge/SegmentedControl/nav pill/Done bar) — fixed
  // black-on-peach in both modes.
  { name: "primary-contrast on primary fill (CTA)", fg: "color-primary-contrast", bg: "color-primary" },
  { name: "primary-contrast on primary-hover fill", fg: "color-primary-contrast", bg: "color-primary-hover" },
  { name: "primary-contrast on primary-active fill", fg: "color-primary-contrast", bg: "color-primary-active" },

  // Interactive text accent — links, active nav label, focus-adjacent text.
  { name: "accent link/text on page", fg: "color-accent", bg: "color-bg" },
  { name: "accent link/text on elevated surface", fg: "color-accent", bg: "color-bg-elevated" },

  // Focus ring — non-text UI, 3:1 against both grounds it can appear over.
  { name: "focus ring vs page", fg: "color-accent", bg: "color-bg", min: 3 },
  { name: "focus ring vs elevated surface", fg: "color-accent", bg: "color-bg-elevated", min: 3 },

  // Danger — both a standalone text color and (paired with -contrast) a fill.
  { name: "danger text on page", fg: "color-danger", bg: "color-bg" },
  { name: "danger text on elevated surface", fg: "color-danger", bg: "color-bg-elevated" },
  { name: "danger-contrast on danger fill (Button/Badge)", fg: "color-danger-contrast", bg: "color-danger" },

  // Callout / disclaimer banner.
  { name: "callout icon/text on callout bg", fg: "color-callout-icon", bg: "color-callout-bg" },
];

const CHIP_TONES = [
  { name: "primary", text: "color-primary-soft-text", tint: "color-primary-soft" },
  { name: "caution", text: "color-caution-soft-text", tint: "color-caution-soft" },
  { name: "success", text: "color-success-soft-text", tint: "color-success-soft" },
  { name: "neutral", text: "color-neutral-soft-text", tint: "color-neutral-soft" },
  { name: "danger", text: "color-danger-soft-text", tint: "color-danger-soft" },
];

// Chip text is checked against the tint COMPOSITED over each ground it can
// sit on (cards render on both `color-bg` and `color-bg-elevated`).
const CHIP_PAIRS: Pair[] = CHIP_TONES.flatMap((tone) =>
  GROUNDS.map((ground) => ({
    name: `${tone.name} chip text on ${tone.tint} over ${ground}`,
    fg: tone.text,
    bg: tone.tint,
    _ground: ground,
  })),
).map((p) => p as Pair & { _ground: string });

const failures: { mode: Mode; pair: Pair; ratio: number }[] = [];

for (const mode of ["light", "dark"] as const) {
  for (const pair of BASE_PAIRS) {
    const ratio = ratioOf(pair.fg, pair.bg, mode);
    if (ratio < (pair.min ?? 4.5)) failures.push({ mode, pair, ratio });
  }
  for (const pair of CHIP_PAIRS as (Pair & { _ground: string })[]) {
    const bg = parseColor(resolve(pair._ground, mode));
    const tint = parseColor(resolve(pair.bg, mode));
    const compositedTint = tint.a < 1 ? compositeOver(tint, bg) : tint;
    const fg = opaqueColorOf(pair.fg, mode, pair._ground);
    const ratio = contrastRatio(fg, compositedTint);
    if (ratio < (pair.min ?? 4.5)) failures.push({ mode, pair, ratio });
  }
}

describe("design token contrast (WCAG AA)", () => {
  it("passes every declared pairing in both themes", () => {
    if (failures.length > 0) {
      const report = failures
        .map(({ mode, pair, ratio }) => `  [${mode}] ${pair.name}: ${ratio.toFixed(2)}:1 (need ${pair.min ?? 4.5}:1)`)
        .join("\n");
      throw new Error(`${failures.length} pairing(s) below WCAG AA:\n${report}`);
    }
    expect(failures).toHaveLength(0);
  });

  // One assertion per pairing too, so a regression's failure output points
  // straight at the specific pairing instead of just a count.
  for (const mode of ["light", "dark"] as const) {
    for (const pair of BASE_PAIRS) {
      it(`[${mode}] ${pair.name} >= ${pair.min ?? 4.5}:1`, () => {
        expect(ratioOf(pair.fg, pair.bg, mode)).toBeGreaterThanOrEqual(pair.min ?? 4.5);
      });
    }
    for (const pair of CHIP_PAIRS as (Pair & { _ground: string })[]) {
      it(`[${mode}] ${pair.name} >= ${pair.min ?? 4.5}:1`, () => {
        const bg = parseColor(resolve(pair._ground, mode));
        const tint = parseColor(resolve(pair.bg, mode));
        const compositedTint = tint.a < 1 ? compositeOver(tint, bg) : tint;
        const fg = opaqueColorOf(pair.fg, mode, pair._ground);
        expect(contrastRatio(fg, compositedTint)).toBeGreaterThanOrEqual(pair.min ?? 4.5);
      });
    }
  }
});

describe("dark-mode block parity", () => {
  // OS-dark users without a manual override get the @media block, the
  // toggle path gets [data-theme="dark"] — the gate above only reads the
  // latter, so this pin keeps the two from silently drifting apart.
  it("the prefers-color-scheme dark block declares exactly what the data-theme dark block declares", () => {
    const mediaStart = css.indexOf("@media (prefers-color-scheme: dark)");
    expect(mediaStart).toBeGreaterThan(-1);
    const mediaRoot = extractBlock(css.slice(mediaStart), ':root:not([data-theme="light"]) {');
    expect(mediaRoot).toBeTruthy();
    const declarations = (block: string) =>
      Object.fromEntries(
        [...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2]!.trim()]),
      );
    expect(declarations(mediaRoot!)).toEqual(declarations(darkBlock!));
  });
});
