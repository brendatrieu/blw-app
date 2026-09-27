import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Item 567: the app is US English. Seeds, safety articles, AI prompts and UI
// copy were generated with British spellings ("centre" in every band of a
// recipe). This scans every source file whose text can reach a user — code
// comments stripped, tests skipped — for a small list of British forms.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const ROOTS = ["server/db/seeds", "server/src", "shared/src", "client/src", "content"];
// Single files outside those trees that users read: the page shell and the
// PWA manifest's name and description (built from vite.config.ts).
const FILES = ["client/index.html", "client/vite.config.ts"];

const BRITISH =
  /\b(centres?|centred|flavour\w*|colour\w*|savour\w*|favour(?:s|ed|ing|ite\w*)?|behaviour\w*|recognis\w*|organis(?:e|ed|es|ing|ation\w*)|apologis\w*|realis(?:e|ed|es|ing)|emphasis(?:e|ed|es|ing)|analys(?:e|ed|ing)|fibres?|grey|mould\w*|yoghurts?|programmes?|travelling|cosy|aluminium|jewellery|practis(?:e|ed|es|ing)|licence|defence|catalogue\w*|oesophag\w*|paediatr\w*|anaemi\w*|diarrhoea|mums?)\b/gi;

// Code identifiers, never rendered: the chart geometry's local `centre`.
const ALLOWED = new Set(["client/src/components/charts/helpers.ts:centre"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "test" || name === "dist") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mdx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

function britishSpellings(): string[] {
  const hits: string[] = [];
  const files = [...ROOTS.flatMap((root) => walk(path.join(repoRoot, root))), ...FILES.map((f) => path.join(repoRoot, f))];
  for (const file of files) {
    const rel = path.relative(repoRoot, file);
    const text = file.endsWith(".mdx") ? readFileSync(file, "utf8") : stripComments(readFileSync(file, "utf8"));
    for (const [word] of text.matchAll(BRITISH)) {
      if (!ALLOWED.has(`${rel}:${word}`)) hits.push(`${rel}: ${word}`);
    }
  }
  return hits;
}

describe("US spelling in user-visible text (item 567)", () => {
  it("has no British spellings in seeds, safety articles, prompts or UI copy", () => {
    expect(britishSpellings()).toEqual([]);
  });

  it("guard the guard: catches a British form in text and ignores it in a comment", () => {
    const sample = "// the centre of it\nconst s = 'set to 165°F in the centre';";
    expect(stripComments(sample).match(BRITISH)).toEqual(["centre"]);
  });
});
