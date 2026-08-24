#!/usr/bin/env node
// Parses the design tokens out of src/styles/index.css for both the light
// (default :root) and dark ([data-theme="dark"]) palettes, resolves any
// var(--x) indirection within the file, then checks a declared list of
// text/background pairs actually used by the app against WCAG AA
// (4.5:1 normal text, 3:1 large/UI text). Exits 1 and lists every failure
// if any pair falls short.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.join(__dirname, "..", "src", "styles", "index.css");
const css = readFileSync(cssPath, "utf8");

/** Finds `selector { ... }` and returns the text between the matching braces, or null. */
function extractBlock(source, selector) {
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
function parseDeclarations(blockText) {
  const map = new Map();
  const re = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(blockText))) {
    map.set(m[1], m[2].trim());
  }
  return map;
}

/** Resolves a token name to its literal value, following one or more `var(--x)` hops. */
function resolve(name, map, visited = new Set()) {
  if (visited.has(name)) throw new Error(`Circular token reference: ${name}`);
  visited.add(name);
  const raw = map.get(name);
  if (raw === undefined) throw new Error(`Token --${name} is not defined`);
  const varMatch = /^var\(--([\w-]+)\)$/.exec(raw);
  if (varMatch) return resolve(varMatch[1], map, visited);
  return raw;
}

const rootBlock = extractBlock(css, "\n:root {") ?? extractBlock(css, ":root {");
if (!rootBlock) {
  console.error("check-contrast: could not find a `:root { ... }` block in index.css");
  process.exit(1);
}
const rootVars = parseDeclarations(rootBlock);

const darkBlock = extractBlock(css, ':root[data-theme="dark"] {');
if (!darkBlock) {
  console.error('check-contrast: could not find a `:root[data-theme="dark"] { ... }` block in index.css');
  process.exit(1);
}
const darkOwnVars = parseDeclarations(darkBlock);
const darkVars = new Map([...rootVars, ...darkOwnVars]);

function tokenValue(name, mode) {
  return mode === "light" ? resolve(name, rootVars) : resolve(name, darkVars);
}

// ---- WCAG contrast math ----
function hexToRgb(hex) {
  const clean = hex.trim().replace("#", "");
  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;
  const int = parseInt(full, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}
function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
function contrastRatio(hexA, hexB) {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---- Declared pairs — every text/background (or icon/background,
// fill/contrast-text) combination the app actually renders. `min` defaults
// to 4.5 (normal text); pass 3 for large-text/UI-only pairs. ----
const PAIRS = [
  { name: "body text on page", fg: "color-text", bg: "color-bg" },
  { name: "body text on elevated surface", fg: "color-text", bg: "color-bg-elevated" },
  { name: "body text on inset surface", fg: "color-text", bg: "color-bg-inset" },
  { name: "muted text on page", fg: "color-text-muted", bg: "color-bg" },
  { name: "muted text on elevated surface", fg: "color-text-muted", bg: "color-bg-elevated" },
  { name: "primary link/text on page", fg: "color-primary", bg: "color-bg" },
  { name: "primary-contrast on primary fill (Button/Badge)", fg: "color-primary-contrast", bg: "color-primary" },
  { name: "primary-contrast on accent fill (Badge/CandidateCard)", fg: "color-primary-contrast", bg: "color-accent" },
  { name: "danger text on page", fg: "color-danger", bg: "color-bg" },
  { name: "primary-contrast on danger fill (Button/Badge)", fg: "color-primary-contrast", bg: "color-danger" },
  { name: "sunshine-deep on sunshine-soft (Badge)", fg: "color-sunshine-deep", bg: "color-sunshine-soft" },
  { name: "leaf-deep on leaf-soft (Badge)", fg: "color-leaf-deep", bg: "color-leaf-soft" },
  { name: "callout icon/text on callout bg", fg: "color-callout-icon", bg: "color-callout-bg" },
];

let failures = 0;
for (const mode of /** @type {const} */ (["light", "dark"])) {
  for (const pair of PAIRS) {
    const min = pair.min ?? 4.5;
    let fg;
    let bg;
    try {
      fg = tokenValue(pair.fg, mode);
      bg = tokenValue(pair.bg, mode);
    } catch (err) {
      console.error(`FAIL [${mode}] ${pair.name}: ${err.message}`);
      failures++;
      continue;
    }
    const ratio = contrastRatio(fg, bg);
    const pass = ratio >= min;
    if (!pass) failures++;
    console.log(
      `${pass ? "PASS" : "FAIL"} [${mode}] ${pair.name}: ${ratio.toFixed(2)}:1 (need ${min}:1) — --${pair.fg}=${fg} on --${pair.bg}=${bg}`,
    );
  }
}

if (failures > 0) {
  console.error(`\ncheck-contrast: ${failures} pair(s) below WCAG AA.`);
  process.exit(1);
}
console.log(`\ncheck-contrast: all ${PAIRS.length * 2} pairs pass WCAG AA.`);
