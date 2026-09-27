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

// Item 569: British VOCABULARY, not spelling — words a US parent reads as
// foreign or, for the emergency lines, as wrong. Curated, whole-word only:
// "hob" never fires on "hobby", "bin" is not listed, bare "mince" (a US verb:
// "mince the garlic"), "cooker" ("slow cooker"), "crisps" ("until the skin
// crisps") and "stone" alone ("stone fruit") are left out on purpose. The UK
// emergency numbers count wherever they appear ("999 in the UK", "(999)",
// "tel:111", and the EU's 112); the few files that use 999 as a form limit or
// sort key are allowed below (per file: a new "call 999" in one of those six
// files would slip through — they are forms, a sort and a chart). Noun
// "mince" is left out with the verb, so "the ground beef" wording relies on
// the "minced beef"/"beef mince"/"the mince" forms. Ids are blanked before matching (see `stripIds`), so a
// hyphenated word in prose ("porridge-like") is still caught.
const BRITISH_VOCAB =
  /\b(napp(?:y|ies)|minced (?:beef|lamb|pork|turkey|chicken|meat)|(?:beef|lamb|pork|turkey|chicken) mince|the mince|courgettes?|aubergines?|prawns?|spring onions?|wholemeal|plain flour|self-raising|stock cubes?|baking trays?|hobs?|cling ?film|kitchen roll|biscuits?|porridges?|passata|jumbo oats|store-cupboard|cupboard|blitz(?:ed|ing)?|tinned|(?:lined|baking|cake|loaf|roasting) tins?|being sick|straight away|adrenaline|NHS|A&E|GPs?|health visitors?|UK|999|111|a tin of|tins of|fresh coriander|coriander leaves|under the grill|grill pan|sweets|(?:off|from|remove) the stone|stoned|open-frozen|free-flow|jumbo|112)\b/gi;

// Case-sensitive: "Veg" as a label is British shorthand; the `veg` category key
// is lowercase and blanked with the other ids anyway.
const BRITISH_CASED = /\bVeg\b/g;

// Code identifiers, never rendered: the chart geometry's local `centre`, and
// 999 used as a form limit, a sort key or a chart constant.
const ALLOWED = new Set([
  "client/src/components/charts/helpers.ts:centre",
  "client/src/components/charts/helpers.ts:999",
  "server/src/services/allergens.ts:999",
  "shared/src/storage.ts:999",
  "client/src/features/storage/components/EditStorageItemForm.tsx:999",
  "client/src/features/storage/components/AddStorageItemForm.tsx:999",
  "client/src/features/tracking/components/LogFoodForm.tsx:999",
]);

/** Blank what is an id rather than prose: slug/key/value/id/category string
 * values, mdx frontmatter slugs, and snake_case tokens (prose never has an
 * underscore). Ids must never change, so the guard must never demand it. */
function stripIds(src: string): string {
  return src
    // Only id-shaped values (no spaces): a `value:` that holds prose stays checked.
    .replace(/\b(?:slug|foodSlug|recipeSlug|key|value|id|category|storageCategory)\s*:\s*(['"`])[a-z0-9][a-z0-9_-]*\1/g, "")
    // mdx frontmatter only (the block between the opening --- lines).
    .replace(/^---\n[\s\S]*?\n---\n/, (front) => front.replace(/^slug:.*$/gm, ""))
    .replace(/\b[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+\b/g, "");
}

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
    const raw = readFileSync(file, "utf8");
    // In mdx, `_word_` is italics, not a snake_case id: read underscores as spaces.
    const text = stripIds(file.endsWith(".mdx") ? raw.replace(/_/g, " ") : stripComments(raw));
    for (const [word] of [...text.matchAll(BRITISH), ...text.matchAll(BRITISH_VOCAB), ...text.matchAll(BRITISH_CASED)]) {
      if (!ALLOWED.has(`${rel}:${word}`)) hits.push(`${rel}: ${word}`);
    }
  }
  return hits;
}

describe("US spelling in user-visible text (item 567)", () => {
  it("has no British spellings or vocabulary in seeds, safety articles, prompts or UI copy", () => {
    expect(britishSpellings()).toEqual([]);
  });

  it("guard the guard: catches a British form in text and ignores it in a comment", () => {
    const sample = "// the centre of it\nconst s = 'set to 165°F in the centre';";
    expect(stripComments(sample).match(BRITISH)).toEqual(["centre"]);
  });

  it("guard the guard: vocabulary matches whole words, hyphenated prose included", () => {
    const hits = stripIds(
      "a nappy, Nappy-area rash, the minced beef, porridge-like, call emergency services (999), NHS 111 on the hob, href=tel:999, remove the stone, open-frozen",
    ).match(BRITISH_VOCAB);
    expect(hits).toEqual([
      "nappy", "Nappy", "minced beef", "porridge", "999", "NHS", "111", "hob", "999", "remove the stone", "open-frozen",
    ]);
    const clean = stripIds(
      "a hobby, binding, tint, mince the garlic, minced garlic, slow cooker, until the skin crisps, stone fruit, porridge_overnight_oats, slug: 'apple-cinnamon-tahini-porridge', muffin tin, ground coriander, Veggies",
    );
    expect(clean.match(BRITISH_VOCAB)).toBeNull();
    expect(clean.match(BRITISH_CASED)).toBeNull();
    expect("{ label: \"Veg\" }".match(BRITISH_CASED)).toEqual(["Veg"]);
  });
});
