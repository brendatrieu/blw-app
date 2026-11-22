import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHART_RAMP_STEPS, RAMP_INK_THRESHOLD } from "../components/charts/helpers.js";

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
  /** A lower floor in LIGHT only: an owner's deliberate pick below `min`,
   * documented where it is set and listed in OWNER_EXCEPTIONS below. Dark
   * keeps `min`. */
  lightMin?: number;
}

/** The floor a pairing is held to in a mode. */
const minFor = (pair: Pair, mode: Mode) => (mode === "light" ? pair.lightMin : undefined) ?? pair.min ?? 4.5;

const GROUNDS = ["color-bg", "color-bg-elevated"] as const;

const BASE_PAIRS: Pair[] = [
  { name: "body text on page", fg: "color-text", bg: "color-bg" },
  { name: "body text on elevated surface", fg: "color-text", bg: "color-bg-elevated" },
  { name: "body text on inset surface", fg: "color-text", bg: "color-bg-inset" },
  { name: "muted text on page", fg: "color-text-muted", bg: "color-bg" },
  { name: "muted text on elevated surface", fg: "color-text-muted", bg: "color-bg-elevated" },
  // Inset surfaces (SegmentedControl track, Menu, EmptyState) carry muted text too.
  { name: "muted text on inset surface", fg: "color-text-muted", bg: "color-bg-inset" },

  // CTA fill (Button/Badge/SegmentedControl/Done bar) — black on sky blue
  // in both modes (item 670, superseding item 639's deep dark fill).
  { name: "primary-contrast on primary fill (CTA)", fg: "color-primary-contrast", bg: "color-primary" },
  { name: "primary-contrast on primary-hover fill", fg: "color-primary-contrast", bg: "color-primary-hover" },
  { name: "primary-contrast on primary-active fill", fg: "color-primary-contrast", bg: "color-primary-active" },
  // Selected / on states (item 644): filter and option chips, the age tabs,
  // the SegmentedControl segment — black on the pastel sky in both modes.
  { name: "selected-contrast on selected fill (chips, segments, age tabs)", fg: "color-selected-contrast", bg: "color-selected" },
  // The tonal Button (storage CTA): black on mint in both modes (item 670).
  { name: "success-contrast on success fill (tonal Button)", fg: "color-success-contrast", bg: "color-success" },

  // ---- Apricot identity (items 634/635/640) ----
  // Active bottom-nav pill: ink icon on the apricot fill.
  { name: "apricot ink on apricot fill (active nav pill)", fg: "color-apricot-ink", bg: "color-apricot" },
  // Apricot text goes on page/elevated only; it is 4.12:1 on inset, so it
  // never goes there. The bottom nav is page-colored since item 687, so its
  // labels and icons are gated on color-bg.
  { name: "apricot text on page (Home greeting item 679, active nav label item 687)", fg: "color-apricot-text", bg: "color-bg" },
  { name: "apricot text on elevated surface", fg: "color-apricot-text", bg: "color-bg-elevated" },
  { name: "inactive nav label on the page-colored nav (item 687)", fg: "color-text-muted", bg: "color-bg" },
  { name: "inactive nav icon on the page-colored nav (item 687)", fg: "color-text-muted", bg: "color-bg", min: 3 },
  // The pill is decorative (label color and weight carry the state): dark is
  // 1.37:1 on the page, up from 1.24:1 on the old elevated nav. Light is the
  // owner's tint since ledger 1115 (round-1 pick B, 2026-11-21: was the solid
  // #f7b48a), 1.27:1: held there, not dropped.
  { name: "active nav pill against the page-colored nav (item 687)", fg: "color-apricot", bg: "color-bg", min: 1.3, lightMin: 1.25 },
  // Rating stars (filled and the empty outline), the recipe-list heart, the
  // ring's due segments: graphics, 3:1 on page/elevated in dark. Light is the
  // owner's lighter orange: shade 2 #f29d66 (ledger 1123, 2026-11-21, picked
  // on the phone over 1115's shade 1 #ec8a4f, 2.42 / 2.53:1; both after the
  // #e1732e "comes across darker on the phone"), 2.06 / 2.15:1 (1.93 on the
  // glass card, batch 1113): a deliberate exception, as every one of them has
  // its value in text or aria beside it (StarRating's radios and "Rated N
  // stars", the ★ summary's sr-only line, the heart's card name, the ring's
  // "N due for a serve" line). Held at that shade: a still lighter one fails here.
  { name: "apricot graphic (stars, heart) on page", fg: "color-apricot-graphic", bg: "color-bg", min: 3, lightMin: 2.05 },
  { name: "apricot graphic (stars, heart) on elevated surface", fg: "color-apricot-graphic", bg: "color-bg-elevated", min: 3, lightMin: 2.1 },
  // Item 653: the filter-count dot is a graphic fill (gated as a state mark
  // by the two pairs above) carrying its number in graphic-ink.
  { name: "filter-count number (graphic-ink) on apricot graphic dot", fg: "color-apricot-graphic-ink", bg: "color-apricot-graphic" },
  // Favorited heart pill: body text on the soft chip, and the heart glyph in
  // apricot text (the graphic shade is 2.55:1 there in light) at 3:1.
  { name: "body text on apricot soft chip (Favorited pill)", fg: "color-text", bg: "color-apricot-soft" },
  { name: "apricot text heart on apricot soft chip", fg: "color-apricot-text", bg: "color-apricot-soft", min: 3 },
  // Slim inner-page header (items 654/655): the "Mila · 8 mo" baby chip's
  // ink label on the soft chip, the avatar initial in ink on the apricot
  // disc, and the gear (kebab color) on the header, which is page-colored
  // since item 679.
  { name: "header baby chip label on apricot soft chip", fg: "color-text", bg: "color-apricot-soft" },
  { name: "header baby chip avatar initial (avatar ink on avatar disc)", fg: "color-avatar-ink", bg: "color-avatar" },
  // Item 675: the disc must stand apart from the chip it sits on (dark was
  // #3a2a20 on #3a2a20, 1.00:1). Decorative, so no 3:1 — light is 1.44:1.
  { name: "header baby chip avatar disc against the apricot soft chip", fg: "color-avatar", bg: "color-apricot-soft", min: 1.4 },
  { name: "header gear icon on the page-colored header", fg: "color-icon", bg: "color-bg", min: 3 },

  // Card kebab (⋮) icon — non-text UI on every ground a card menu sits on
  // (inset is its hover fill) (item 641).
  { name: "kebab icon on page", fg: "color-icon", bg: "color-bg", min: 3 },
  { name: "kebab icon on elevated surface", fg: "color-icon", bg: "color-bg-elevated", min: 3 },
  { name: "kebab icon on inset (hover)", fg: "color-icon", bg: "color-bg-inset", min: 3 },

  // Interactive text accent — links, active nav label, focus-adjacent text.
  { name: "accent link/text on page", fg: "color-accent", bg: "color-bg" },
  { name: "accent link/text on elevated surface", fg: "color-accent", bg: "color-bg-elevated" },
  // Copy to…'s Keep it / Replace it (ledger 904, CD-Copy-Per-Day): the picked
  // half is the accent fill with the elevated surface's color as its text.
  { name: "elevated text on accent fill (Copy's picked Keep it / Replace it)", fg: "color-bg-elevated", bg: "color-accent" },
  // The More tab's "Update available" row: its Reload sits on inset (ledger 790).
  { name: "accent text on inset surface (More update row)", fg: "color-accent", bg: "color-bg-inset" },
  // Ledger 1017: today's outline (an inset ring, non-text 3:1) in both
  // strips, on every fill its day can wear and the page around the strip;
  // a picked Copy day is the meal chips' soft apricot with the text colour
  // and its check (currentColor). The Meal Plan's picked day keeps ink on
  // apricot. Ledger 1115: the Meal Plan's ring is --color-plan-today (light a
  // lighter sea, dark the accent); the Copy sheet's stays the accent.
  { name: "today outline on the Meal Plan strip (ledger 1017)", fg: "color-plan-today", bg: "color-bg-elevated", min: 3 },
  { name: "today outline vs the page (ledger 1017)", fg: "color-plan-today", bg: "color-bg", min: 3 },
  { name: "today outline on the Meal Plan's picked apricot day (ledger 1017)", fg: "color-plan-today", bg: "color-apricot", min: 3 },
  { name: "today outline on an unpicked Copy day (ledger 1017)", fg: "color-accent", bg: "color-bg-inset", min: 3 },
  { name: "today outline on a picked Copy day (ledger 1017)", fg: "color-accent", bg: "color-apricot-soft", min: 3 },
  { name: "picked Copy day number on the soft apricot (ledger 1017)", fg: "color-text", bg: "color-apricot-soft" },
  { name: "picked Copy day check on the soft apricot (ledger 1017)", fg: "color-text", bg: "color-apricot-soft", min: 3 },
  { name: "picked Meal Plan day number, ink on apricot (ledger 1017)", fg: "color-apricot-ink", bg: "color-apricot" },
  { name: "Copy sheet From line, muted on elevated (ledger 1017)", fg: "color-text-muted", bg: "color-bg-elevated" },

  // Focus ring — non-text UI, 3:1 against both grounds it can appear over.
  { name: "focus ring vs page", fg: "color-accent", bg: "color-bg", min: 3 },
  { name: "focus ring vs elevated surface", fg: "color-accent", bg: "color-bg-elevated", min: 3 },

  // Danger — both a standalone text color and (paired with -contrast) a fill.
  { name: "danger text on page", fg: "color-danger", bg: "color-bg" },
  { name: "danger text on elevated surface", fg: "color-danger", bg: "color-bg-elevated" },
  { name: "danger-contrast on danger fill (Button)", fg: "color-danger-contrast", bg: "color-danger" },

  // Callout / disclaimer banner.
  { name: "callout icon/text on callout bg", fg: "color-callout-icon", bg: "color-callout-bg" },
  // Choking notes callout (item 667): the red title (and its triangle icon,
  // same color, so 4.5 covers the 3:1 graphic floor) and the ink body.
  { name: "choking callout title/icon on callout tint", fg: "color-danger-callout-text", bg: "color-danger-callout-bg" },
  { name: "choking callout body (ink) on callout tint", fg: "color-text", bg: "color-danger-callout-bg" },

  // ---- Chart palette (item 326) ----
  // Chart marks are non-text UI, so the floor is 3:1 — except the
  // near-surface end of an ORDINAL ramp, which the dataviz method floors at
  // 2:1 on purpose: "least" is allowed to recede toward the surface. That
  // relaxation is legal only because every ramp chart also ships a legend, a
  // direct label per bar and a screen-reader table, so no value is ever
  // carried by the fill alone. Charts render inside `Card`
  // (--color-bg-elevated) but are gated against the page ground too, so
  // moving one out of a card can never quietly drop it below the floor.
  { name: "chart series mark on page", fg: "chart-1", bg: "color-bg", min: 3 },
  { name: "chart series mark on elevated surface", fg: "chart-1", bg: "color-bg-elevated", min: 3 },
  // The funnel's lightest cohort step (ramp-2 — ramp-1 is the heat table's
  // "near zero" fill and is read through its label, never on its own).
  { name: "funnel's lightest cohort bar on page", fg: "chart-ramp-2", bg: "color-bg", min: 2 },
  { name: "funnel's lightest cohort bar on elevated surface", fg: "chart-ramp-2", bg: "color-bg-elevated", min: 2 },
  // Severity slices: the lightest (monitor at home) at the ordinal floor,
  // the rest as ordinary marks.
  { name: "severity 1 slice on page", fg: "chart-sev-1", bg: "color-bg", min: 2 },
  { name: "severity 1 slice on elevated surface", fg: "chart-sev-1", bg: "color-bg-elevated", min: 2 },
  { name: "severity 2 slice on page", fg: "chart-sev-2", bg: "color-bg", min: 3 },
  { name: "severity 2 slice on elevated surface", fg: "chart-sev-2", bg: "color-bg-elevated", min: 3 },
  { name: "severity 3 slice on page", fg: "chart-sev-3", bg: "color-bg", min: 3 },
  { name: "severity 3 slice on elevated surface", fg: "chart-sev-3", bg: "color-bg-elevated", min: 3 },
  { name: "severity 4 slice on page", fg: "chart-sev-4", bg: "color-bg", min: 3 },
  { name: "severity 4 slice on elevated surface", fg: "chart-sev-4", bg: "color-bg-elevated", min: 3 },
];

/**
 * Retention cells print their value INSIDE the fill — the one place text
 * wears a chart color — so which ink each ramp step takes is a contrast
 * decision, not a style one. The threshold is imported rather than restated:
 * moving it in `helpers.ts` moves these pairings with it, so the renderer
 * and this gate cannot drift apart.
 */
const RAMP_INK_PAIRS: Pair[] = CHART_RAMP_STEPS.map((step) => ({
  name: `retention cell label on ramp step ${step}`,
  fg: step < RAMP_INK_THRESHOLD ? "chart-ramp-ink-low" : "chart-ramp-ink-high",
  bg: `chart-ramp-${step}`,
}));

BASE_PAIRS.push(...RAMP_INK_PAIRS);

const CHIP_TONES = [
  { name: "primary", text: "color-primary-soft-text", tint: "color-primary-soft" },
  // Also the "Use soon" badge's clock icon (item 671), which draws in the text color.
  { name: "caution", text: "color-caution-soft-text", tint: "color-caution-soft" },
  { name: "success", text: "color-success-soft-text", tint: "color-success-soft" },
  { name: "neutral", text: "color-neutral-soft-text", tint: "color-neutral-soft" },
  { name: "danger", text: "color-danger-soft-text", tint: "color-danger-soft" },
  // Button `danger-quiet` hover: `--color-danger` text on the danger tint.
  { name: "danger quiet-hover", text: "color-danger", tint: "color-danger-soft" },
  // Item 636: the allergen pill (Badge tone "allergen", MultiCombobox markers).
  { name: "allergen", text: "color-allergen-soft-text", tint: "color-allergen-soft" },
  // Item 647: RecipePicker's outline "Custom" marker (muted text, no fill)
  // on a selected listbox row, which is tinted primary-soft.
  { name: "primary outline-marker", text: "color-text-muted", tint: "color-primary-soft" },
  // Ledger 894: the emoji button while its grid is open — the accent icon on
  // a primary-soft circle (form page and sheet). An icon, but held to 4.5.
  { name: "primary emoji-button open icon", text: "color-accent", tint: "color-primary-soft" },
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
    if (ratio < minFor(pair, mode)) failures.push({ mode, pair, ratio });
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
        .map(({ mode, pair, ratio }) => `  [${mode}] ${pair.name}: ${ratio.toFixed(2)}:1 (need ${minFor(pair, mode)}:1)`)
        .join("\n");
      throw new Error(`${failures.length} pairing(s) below WCAG AA:\n${report}`);
    }
    expect(failures).toHaveLength(0);
  });

  // One assertion per pairing too, so a regression's failure output points
  // straight at the specific pairing instead of just a count.
  for (const mode of ["light", "dark"] as const) {
    for (const pair of BASE_PAIRS) {
      it(`[${mode}] ${pair.name} >= ${minFor(pair, mode)}:1`, () => {
        expect(ratioOf(pair.fg, pair.bg, mode)).toBeGreaterThanOrEqual(minFor(pair, mode));
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

// ---------------------------------------------------------------------------
// Dark-mode state contrast (items 644, 645). Non-text UI, so 3:1. Gated in
// DARK ONLY: light keeps its long-standing pastel-on-white states (~1.3-1.6:1,
// carried by position, shape and the thumb) because the owner ruled light
// unchanged; dark is where the deep CTA fill had dropped these to 1.4-1.9:1.
// ---------------------------------------------------------------------------

/** Confetti swatches, read from the renderer so a new particle color is gated
 * the moment it is added (the tonal-hover idiom below). */
const celebrationSource = readFileSync(new URL("../components/ui/Celebration.tsx", import.meta.url), "utf8");
const PARTICLE_TOKENS = [
  ...(celebrationSource.match(/const PARTICLE_COLORS = \[([^\]]*)\]/)?.[1] ?? "").matchAll(/var\(--([\w-]+)\)/g),
].map((m) => m[1]!);

const DARK_STATE_PAIRS: Pair[] = [
  // Selected chips sit on the page (Foods/Recipes sticky bar, forms) and on
  // cards/sheets; the Switch thumb is --color-bg-elevated on the on track.
  { name: "selected fill vs page (selected chip)", fg: "color-selected", bg: "color-bg", min: 3 },
  { name: "selected fill vs elevated (chip on a card, Switch thumb on the on track)", fg: "color-selected", bg: "color-bg-elevated", min: 3 },
  // SegmentedControl / age tabs: the selected segment on its inset track;
  // the Switch: on track vs the off track (also inset).
  { name: "selected fill vs inset (segment on its track, Switch on vs off)", fg: "color-selected", bg: "color-bg-inset", min: 3 },
  ...PARTICLE_TOKENS.flatMap((token) =>
    GROUNDS.map((ground) => ({ name: `confetti --${token} vs ${ground}`, fg: token, bg: ground, min: 3 })),
  ),
];

describe("owner exceptions (ledger 1115, 1123)", () => {
  // The only pairings held below their floor, and in light only: a new one
  // has to be added here on purpose, with its reason where it is set.
  const OWNER_EXCEPTIONS = [
    "active nav pill against the page-colored nav (item 687)",
    "apricot graphic (stars, heart) on page",
    "apricot graphic (stars, heart) on elevated surface",
  ];
  it("lists every pairing with a light-only floor, each one below its own min", () => {
    const relaxed = BASE_PAIRS.filter((pair) => pair.lightMin !== undefined);
    expect(relaxed.map((pair) => pair.name)).toEqual(OWNER_EXCEPTIONS);
    for (const pair of relaxed) expect(pair.lightMin!).toBeLessThan(pair.min ?? 4.5);
  });
  it("the chip pairs and every other gate never take one", () => {
    expect((CHIP_PAIRS as Pair[]).some((pair) => pair.lightMin !== undefined)).toBe(false);
  });
});

describe("dark-mode selected / on states and confetti (items 644, 645)", () => {
  it("reads the three confetti swatches from Celebration.tsx", () => {
    expect(PARTICLE_TOKENS).toEqual(["color-selected", "color-caution", "color-mint"]);
  });
  for (const pair of DARK_STATE_PAIRS) {
    it(`[dark] ${pair.name} >= ${pair.min}:1`, () => {
      expect(ratioOf(pair.fg, pair.bg, "dark")).toBeGreaterThanOrEqual(pair.min!);
    });
  }
});

describe("chip tone rows", () => {
  // Each row must test its own family's tint: a row pointing at another
  // family's tint checks a pairing that never renders and leaves its own
  // tint unguarded (the danger row once read allergen-soft).
  for (const tone of CHIP_TONES) {
    it(`${tone.name} is checked on its own tint`, () => {
      expect(tone.tint).toBe(`color-${tone.name.split(" ")[0]}-soft`);
    });
  }
});

describe("tonal Button hover (success fill darkened with black)", () => {
  // Button.tsx: hover:bg-[color-mix(in_srgb,var(--color-success),#000000_N%)]
  // — not a token, so the pair list can't see it. Read N from the source so
  // a heavier mix can't slip past this check.
  const buttonSource = readFileSync(new URL("../components/ui/Button.tsx", import.meta.url), "utf8");
  const mixMatch = buttonSource.match(/color-mix\(in_srgb,var\(--color-success\),#000000_(\d+)%\)/);
  const mixPercent = Number(mixMatch?.[1]);
  it("finds the tonal hover mix in Button.tsx", () => {
    expect(Number.isFinite(mixPercent)).toBe(true);
  });
  for (const mode of ["light", "dark"] as const) {
    it(`[${mode}] success-contrast on the darkened success hover >= 4.5:1`, () => {
      const fill = parseColor(resolve("color-success", mode));
      const hover = compositeOver({ r: 0, g: 0, b: 0, a: mixPercent / 100 }, fill);
      const ink = parseColor(resolve("color-success-contrast", mode));
      expect(contrastRatio(ink, hover)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("Direction A token values (items 634, 636, 639, 641, 644, 645, 653, 667, 670, 675)", () => {
  // The owner approved exact hexes; the gate above only proves they pass,
  // so pin the values themselves (item 670: buttons identical in both modes).
  const EXPECTED: Record<string, { light: string; dark: string }> = {
    "color-primary": { light: "#b4d4e6", dark: "#b4d4e6" },
    "color-primary-hover": { light: "#a3c8de", dark: "#a3c8de" },
    "color-primary-active": { light: "#8fbad4", dark: "#8fbad4" },
    "color-primary-contrast": { light: "#000000", dark: "#000000" },
    "color-success": { light: "#cde9da", dark: "#cde9da" },
    "color-success-contrast": { light: "#000000", dark: "#000000" },
    // Ledger 1115 (owner's colour picks 2026-11-21): light pill/picked-day tint and the lighter graphic orange.
    "color-apricot": { light: "#fbd9c2", dark: "#3a2a20" },
    "color-apricot-ink": { light: "#3d1a06", dark: "#f7b48a" },
    "color-apricot-text": { light: "#b9571a", dark: "#f7b48a" },
    // Ledger 1123: shade 2 in light (was 1115's #ec8a4f); dark unchanged.
    "color-apricot-graphic": { light: "#f29d66", dark: "#f7b48a" },
    // Ledger 1115: the Meal Plan's today ring (its width below), dark = the accent as before.
    "color-plan-today": { light: "#4d82a4", dark: "#b4d4e6" },
    "color-apricot-soft": { light: "#fde3d1", dark: "#3a2a20" },
    "color-apricot-graphic-ink": { light: "#3d1a06", dark: "#3d1a06" },
    // Item 675: the baby-chip avatar is the light mockup's disc in both modes.
    "color-avatar": { light: "#f7b48a", dark: "#f7b48a" },
    "color-avatar-ink": { light: "#3d1a06", dark: "#3d1a06" },
    "color-allergen-soft": { light: "#f2e3f5", dark: "#3b2541" },
    "color-allergen-soft-text": { light: "#642a6e", dark: "#f2e3f5" },
    "color-icon": { light: "#3f4a56", dark: "#b8c2cc" },
    // Items 644/645: light identical to the old primary / success swatches.
    "color-selected": { light: "#b4d4e6", dark: "#b4d4e6" },
    "color-selected-contrast": { light: "#000000", dark: "#000000" },
    "color-mint": { light: "#cde9da", dark: "#cde9da" },
    // Use soon chip, dark as A-Home-Dark (warm, not grey).
    "color-caution-soft": { light: "rgba(255, 236, 195, 0.9)", dark: "#3a3115" },
    "color-caution-soft-text": { light: "#6b4f10", dark: "#ffe3a3" },
    // Choking notes callout (A-Salmon light; dark is our proposal, no dark board).
    "color-danger-callout-bg": { light: "#fdeeec", dark: "#33201e" },
    "color-danger-callout-border": { light: "#f3cdc8", dark: "#5a2e2a" },
    "color-danger-callout-text": { light: "#8f1f18", dark: "#ffb4ab" },
  };
  for (const [token, { light, dark }] of Object.entries(EXPECTED)) {
    it(`--${token} is ${light} light / ${dark} dark`, () => {
      expect(resolve(token, "light")).toBe(light);
      expect(resolve(token, "dark")).toBe(dark);
    });
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

describe("landing (ledger 1040)", () => {
  // The signed-out landing: the page colour with a sea and an apricot glow
  // placed per slide. The words sit where the glows have faded (pixel-measured
  // >= 4.5:1 over them in the headless check); here each ink is gated over the
  // bare page and over each glow at half its strength.
  const PAIRS: Omit<Pair, "bg">[] = [
    { name: "name and headlines", fg: "color-text" },
    { name: "lines, disclaimer and 'Already have an account?'", fg: "color-landing-muted" },
    { name: "tagline, About and Sign in", fg: "color-accent" },
    { name: "current dot", fg: "color-accent", min: 3 },
    { name: "other dots", fg: "color-landing-dot", min: 3 },
  ];
  const half = (token: string, mode: Mode) => {
    const glow = parseColor(resolve(token, mode));
    return { ...glow, a: glow.a / 2 };
  };
  for (const mode of ["light", "dark"] as const) {
    const bg = parseColor(resolve("color-bg", mode));
    const sea = compositeOver(half("color-landing-glow-sea", mode), bg);
    const apricot = compositeOver(half("color-landing-glow-apricot", mode), bg);
    const grounds = { page: bg, sea, apricot };
    for (const [where, ground] of Object.entries(grounds)) {
      for (const pair of PAIRS) {
        it(`[${mode}] ${pair.name} over the ${where} glow >= ${pair.min ?? 4.5}:1`, () => {
          expect(contrastRatio(parseColor(resolve(pair.fg, mode)), ground)).toBeGreaterThanOrEqual(pair.min ?? 4.5);
        });
      }
    }
    it(`[${mode}] "Create an account" on its accent pill >= 4.5:1`, () => {
      expect(ratioOf("color-bg-elevated", "color-accent", mode)).toBeGreaterThanOrEqual(4.5);
    });
    // The glows are translucent tints, faint in dark, so the page colour shows through.
    it(`[${mode}] the glows are translucent`, () => {
      for (const token of ["color-landing-glow-sea", "color-landing-glow-apricot"]) {
        const { a } = parseColor(resolve(token, mode));
        expect(a).toBeGreaterThan(0);
        expect(a).toBeLessThanOrEqual(mode === "light" ? 0.7 : 0.2);
      }
    });
  }

  // Ledger 1054: the dark logo shadow is a plain one like light's, no sea halo
  // (the dark-block parity pin above keeps the OS-dark block on the same value).
  it("[dark] the logo shadow has no sea-coloured layer (ledger 1054)", () => {
    const shadow = resolve("shadow-landing-icon", "dark");
    expect(shadow).toBe("0 0 0 1px #28313c, 0 16px 36px rgba(0, 0, 0, 0.45)");
    expect(shadow).not.toContain("180, 212, 230");
  });
});

describe("About in the landing look (ledger 1052)", () => {
  // About's header and disclaimer sit on the page and its glows, the header
  // right at the sea glow's middle: gated at FULL glow strength. The cards'
  // ink sits on the frosted glass over the page or over either glow at full
  // strength (the blur only spreads it).
  const ON_GROUND: Omit<Pair, "bg">[] = [
    { name: "name", fg: "color-text" },
    { name: "tagline and Sign in", fg: "color-accent" },
    { name: "'Already have an account?' and disclaimer", fg: "color-landing-muted" },
  ];
  for (const mode of ["light", "dark"] as const) {
    const bg = parseColor(resolve("color-bg", mode));
    const glass = parseColor(resolve("color-glass", mode));
    const grounds = {
      page: bg,
      sea: compositeOver(parseColor(resolve("color-landing-glow-sea", mode)), bg),
      apricot: compositeOver(parseColor(resolve("color-landing-glow-apricot", mode)), bg),
    };
    for (const [where, ground] of Object.entries(grounds)) {
      for (const pair of ON_GROUND) {
        it(`[${mode}] ${pair.name} over the ${where} glow at full strength >= 4.5:1`, () => {
          expect(contrastRatio(parseColor(resolve(pair.fg, mode)), ground)).toBeGreaterThanOrEqual(4.5);
        });
      }
      it(`[${mode}] card text on the glass over the ${where} glow >= 4.5:1`, () => {
        expect(contrastRatio(parseColor(resolve("color-text", mode)), compositeOver(glass, ground))).toBeGreaterThanOrEqual(4.5);
      });
    }
    it(`[${mode}] the glass is translucent`, () => {
      expect(glass.a).toBeGreaterThan(0);
      expect(glass.a).toBeLessThan(1);
    });
  }
});

describe("food plates (items 657, 658)", () => {
  // The tinted discs are decorative (aria-hidden, the food's name is always
  // text beside them), so the tints carry no 3:1 graphics gate. The one plate
  // that carries text is the "+N" overflow count: ink on the neutral plate.
  const PLATE_PAIRS: Pair[] = [{ name: '"+N" count on the neutral plate', fg: "color-text", bg: "color-plate-neutral" }];
  for (const mode of ["light", "dark"] as const) {
    for (const pair of PLATE_PAIRS) {
      it(`[${mode}] ${pair.name} >= ${pair.min ?? 4.5}:1`, () => {
        expect(ratioOf(pair.fg, pair.bg, mode)).toBeGreaterThanOrEqual(pair.min ?? 4.5);
      });
    }
  }

  // Light: mockup values (A-Home / A-Salmon). Dark: the owner's Plates-Dark board
  // (item 717); neutral unchanged, so the "+N" gate above is unaffected.
  const EXPECTED: Record<string, { light: string; dark: string }> = {
    "color-plate-veg": { light: "#dcefe2", dark: "#1d4a33" },
    "color-plate-protein": { light: "#fbe3d2", dark: "#5a2a22" },
    "color-plate-legume": { light: "#f1e9dc", dark: "#3e3529" },
    "color-plate-dairy": { light: "#fdf0c4", dark: "#45491b" },
    "color-plate-fruit": { light: "#fde4e1", dark: "#4e1f3a" },
    "color-plate-grain": { light: "#f7e7c8", dark: "#5b3a10" },
    "color-plate-neutral": { light: "#efe9e1", dark: "#2a3542" },
  };
  for (const [token, { light, dark }] of Object.entries(EXPECTED)) {
    it(`--${token} is ${light} light / ${dark} dark`, () => {
      expect(resolve(token, "light")).toBe(light);
      expect(resolve(token, "dark")).toBe(dark);
    });
  }
});

describe("Meal Plan today ring width (ledger 1115)", () => {
  it("is 1.5px light (owner's pick), 2px dark as before", () => {
    expect(resolve("plan-today-ring", "light")).toBe("1.5px");
    expect(resolve("plan-today-ring", "dark")).toBe("2px");
  });
});

describe("Home allergen ring segments (items 663, 697)", () => {
  // The ring is supplementary: the counts are always text beside it
  // ("3 established", "2 due for a serve", "3 started · 3 not started yet";
  // pinned in DashboardPage.test.ts), so its segments are exempt from the
  // 3:1 graphics gate and use the A-Home mockup's colors (owner, item 697).
  // Keep that text if the ring ever changes, or this exemption is wrong.
  // The due segments (item 747) are --color-apricot-graphic, pinned above;
  // the "N due for a serve" line names them whenever any are drawn.

  // Both modes are the A-Home / A-Home-Dark mockups exactly.
  const EXPECTED: Record<string, { light: string; dark: string }> = {
    "color-ring-established": { light: "#7cc6a0", dark: "#6cc29c" },
    "color-ring-started": { light: "#f2c66d", dark: "#e8b95c" },
    "color-ring-empty": { light: "#e8e2da", dark: "#2c3744" },
  };
  for (const [token, { light, dark }] of Object.entries(EXPECTED)) {
    it(`--${token} is ${light} light / ${dark} dark`, () => {
      expect(resolve(token, "light")).toBe(light);
      expect(resolve(token, "dark")).toBe(dark);
    });
  }
});

describe("app glass, round 15 (ledger 1077-1082)", () => {
  // The app's own glass, apart from About's (--color-glass*). Every AppLayout
  // page sits on the app glow (lib/glows.ts); cards are a translucent fill;
  // bars and popups are frosted. The pixel sampler (batch-1133 BUILD.md)
  // measures the real screens; these gates hold the tokens to the worst
  // case each surface can sit on.
  const TOKENS = [
    "color-app-glow-sea",
    "color-app-glow-top",
    "color-app-glow-apricot",
    "color-card-glass",
    "color-card-glass-border",
    "shadow-card-glass",
    "color-bar-glass",
    "color-bar-hairline",
    "color-app-solid",
    "color-apricot-text-glass",
    "color-text-muted-glass",
    "color-primary-soft-text-glass",
    "color-count-text",
  ];
  const mediaStart = css.indexOf("@media (prefers-color-scheme: dark)");
  const mediaRoot = parseDeclarations(extractBlock(css.slice(mediaStart), ':root:not([data-theme="light"]) {') ?? "");
  const dataThemeDark = parseDeclarations(darkBlock!);
  for (const token of TOKENS) {
    it(`--${token} is declared in :root and both dark blocks`, () => {
      expect(rootVars.has(token)).toBe(true);
      expect(mediaRoot.get(token)).toBe(`var(--_dark-${token.replace(/^color-/, "")})`);
      expect(dataThemeDark.get(token)).toBe(`var(--_dark-${token.replace(/^color-/, "")})`);
    });
  }
  it("the glass names never reuse About's (--color-glass*), so About's look cannot move", () => {
    for (const token of TOKENS) expect(token.startsWith("color-glass")).toBe(false);
  });

  const rgb = (token: string, mode: Mode) => parseColor(resolve(token, mode));
  // On-glass inks: the ground (.app-ground) and the popups (.app-frost) set these.
  const INKS: Omit<Pair, "bg">[] = [
    { name: "body text", fg: "color-text" },
    { name: "muted text", fg: "color-text-muted-glass" },
    { name: "apricot label (greeting, card labels, last day, active tab)", fg: "color-apricot-text-glass" },
    { name: "accent link", fg: "color-accent" },
    { name: "danger text", fg: "color-danger" },
    { name: "icon (gear, calendar, kebab)", fg: "color-icon", min: 3 },
  ];
  for (const mode of ["light", "dark"] as const) {
    const page = rgb("color-bg", mode);
    // Both modes at the glows' full centre (ledger 1093: dark at the
    // landing's .20/.14 clears every pairing there, so the half-strength
    // stand-in and the separate dark centre gates of the .40 glow are gone).
    const grounds = { page, sea: compositeOver(rgb("color-app-glow-sea", mode), page), apricot: compositeOver(rgb("color-app-glow-apricot", mode), page) };
    const scrim = compositeOver({ ...rgb("color-text", mode), a: 0.4 }, page); // Sheet/Dialog overlay, bg-[var(--color-text)]/40
    const surfaces: Record<string, Rgba> = { "popup over the dimmed page": compositeOver(rgb("color-bar-glass", mode), scrim) };
    for (const [where, ground] of Object.entries(grounds)) {
      surfaces[`bare ${where} ground`] = ground;
      surfaces[`card over the ${where} glow`] = compositeOver(rgb("color-card-glass", mode), ground);
      surfaces[`bar over the ${where} glow`] = compositeOver(rgb("color-bar-glass", mode), ground);
    }
    for (const [where, surface] of Object.entries(surfaces)) {
      for (const pair of INKS) {
        it(`[${mode}] ${pair.name} on the ${where} >= ${pair.min ?? 4.5}:1`, () => {
          expect(contrastRatio(rgb(pair.fg, mode), surface)).toBeGreaterThanOrEqual(pair.min ?? 4.5);
        });
      }
      // The Meal Plan strip's today outline (ledger 1017; its own token since 1115) on the frosted strip.
      if (where.startsWith("bar")) {
        it(`[${mode}] today outline on the ${where} >= 3:1`, () => {
          expect(contrastRatio(rgb("color-plan-today", mode), surface)).toBeGreaterThanOrEqual(3);
        });
      }
      // Chips: the tint composited over the surface, a muted ink in its
      // on-glass shade. The neutral chip (Storage card, Food log) and
      // RecipePicker's outline marker (a page form) never render in a popup.
      for (const tone of CHIP_TONES) {
        if (where.startsWith("bar")) continue;
        if (where.startsWith("popup") && (tone.name === "neutral" || tone.name === "primary outline-marker")) continue;
        const ink = tone.text === "color-text-muted" || tone.text === "color-primary-soft-text" ? `${tone.text}-glass` : tone.text;
        it(`[${mode}] ${tone.name} chip on the ${where} >= 4.5:1`, () => {
          const tint = rgb(tone.tint, mode);
          expect(contrastRatio(rgb(ink, mode), tint.a < 1 ? compositeOver(tint, surface) : tint)).toBeGreaterThanOrEqual(4.5);
        });
      }
      // Ledger 1143: the Food log row's "+N" (Badge tone count) on Home's
      // card, with headroom (on screen over the glow the neutral ink held 4.56).
      if (where.startsWith("card")) {
        it(`[${mode}] "+N" count chip on the ${where} >= 4.8:1`, () => {
          expect(contrastRatio(rgb("color-count-text", mode), compositeOver(rgb("color-neutral-soft", mode), surface))).toBeGreaterThanOrEqual(4.8);
        });
      }
    }
    // The chair's headroom (round 15 measured 4.67 header greeting / 4.84
    // Storage "1"): the light apricot label clears 5:1 on every glass.
    if (mode === "light") {
      for (const [where, surface] of Object.entries(surfaces)) {
        it(`[light] apricot label on the ${where} >= 5:1 (headroom)`, () => {
          expect(contrastRatio(rgb("color-apricot-text-glass", "light"), surface)).toBeGreaterThanOrEqual(5);
        });
      }
    }
    it(`[${mode}] the glass is translucent and the fallback near-opaque`, () => {
      for (const token of ["color-card-glass", "color-bar-glass"]) {
        expect(rgb(token, mode).a).toBeGreaterThan(0);
        expect(rgb(token, mode).a).toBeLessThan(1);
      }
      expect(rgb("color-app-solid", mode).a).toBeGreaterThanOrEqual(0.94);
      expect(rgb("color-app-solid", mode).a).toBeLessThan(1);
    });
  }

  // Round 15's approved values (owner 2026-11-20), pinned.
  const EXPECTED: Record<string, { light: string; dark: string }> = {
    // Dark: the landing's strength (ledger 1093, owner: round 15's dark glow "too busy").
    "color-app-glow-sea": { light: "rgba(180, 212, 230, 0.4)", dark: "rgba(180, 212, 230, 0.2)" },
    // Ledger 1090: the sea glow's colour at the top centre (390x844), the ground's even top row and the status bar's
    // (dark re-measured on the .20 glow, ledger 1093).
    "color-app-glow-top": { light: "#ecf2f4", dark: "#1f262d" },
    "color-app-glow-apricot": { light: "rgba(247, 180, 138, 0.28)", dark: "rgba(247, 180, 138, 0.14)" },
    "color-card-glass": { light: "rgba(255, 255, 255, 0.45)", dark: "rgba(30, 38, 48, 0.7)" },
    "color-card-glass-border": { light: "rgba(255, 255, 255, 0.6)", dark: "rgba(255, 255, 255, 0.08)" },
    "color-bar-glass": { light: "rgba(255, 255, 255, 0.78)", dark: "rgba(30, 38, 48, 0.85)" },
    "color-text-muted-glass": { light: "#5b6570", dark: "#aeb9c4" },
    "color-primary-soft-text-glass": { light: "#1c3e52", dark: "#c6e0ef" },
  };
  for (const [token, { light, dark }] of Object.entries(EXPECTED)) {
    it(`--${token} is ${light} light / ${dark} dark`, () => {
      expect(resolve(token, "light")).toBe(light);
      expect(resolve(token, "dark")).toBe(dark);
    });
  }
  it("dark: the app glow is the landing's dark glow (ledger 1093), the landing's tokens untouched", () => {
    expect(resolve("color-app-glow-sea", "dark")).toBe(resolve("color-landing-glow-sea", "dark"));
    expect(resolve("color-app-glow-apricot", "dark")).toBe(resolve("color-landing-glow-apricot", "dark"));
    expect(resolve("color-landing-glow-sea", "dark")).toBe("rgba(180, 212, 230, 0.2)");
    expect(resolve("color-landing-glow-apricot", "dark")).toBe("rgba(247, 180, 138, 0.14)");
    expect(css).not.toContain("glow-sea-flat"); // ledger 1101: no flat-centre cap
  });
  it("bars and popups blur 22px + saturate 140% in both modes", () => {
    expect(rootVars.get("bar-filter")).toMatch(/^blur\(22px\) saturate\(140%\)/);
  });
});
