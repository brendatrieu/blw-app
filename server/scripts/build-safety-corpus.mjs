#!/usr/bin/env node
// Generates server/src/ai/prompts/safety-corpus.ts from content/safety/*.mdx.
//
// The output is deliberately byte-stable across regenerations (sorted by
// `order`, no timestamps, no absolute paths) because it sits inside the BLW
// chat's cached system prompt — an incidental byte diff here would
// invalidate every user's prompt cache on the next deploy even when no
// article actually changed.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const safetyDir = path.resolve(__dirname, "../../content/safety");
const outFile = path.resolve(__dirname, "../src/ai/prompts/safety-corpus.ts");

// Same flat "key: value" frontmatter format the client parses in
// client/src/features/safety/content.ts (not real YAML, just simple lines).
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const REQUIRED_FIELDS = ["slug", "title", "order"];

function parseArticle(fileName, raw) {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) {
    throw new Error(`Safety article "${fileName}" is missing --- frontmatter.`);
  }
  const [, frontmatter, body] = match;

  const fields = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim();
    fields[key] = value;
  }

  for (const field of REQUIRED_FIELDS) {
    if (!fields[field]) {
      throw new Error(`Safety article "${fileName}" is missing "${field}" in its frontmatter.`);
    }
  }

  const order = Number(fields.order);
  if (!Number.isFinite(order)) {
    throw new Error(`Safety article "${fileName}" has a non-numeric "order".`);
  }

  return { slug: fields.slug, title: fields.title, order, body: body.trim() };
}

const files = readdirSync(safetyDir).filter((name) => name.endsWith(".mdx"));
if (files.length === 0) {
  throw new Error(`No .mdx files found in ${safetyDir}`);
}

const articles = files
  .map((fileName) => parseArticle(fileName, readFileSync(path.join(safetyDir, fileName), "utf8")))
  .sort((a, b) => a.order - b.order);

const seenSlugs = new Set();
for (const article of articles) {
  if (seenSlugs.has(article.slug)) {
    throw new Error(`Duplicate safety article slug: "${article.slug}"`);
  }
  seenSlugs.add(article.slug);
}

const corpus = articles.map((a) => `## [${a.slug}] ${a.title}\n\n${a.body}`).join("\n\n---\n\n");

const output = `// GENERATED FILE — do not edit by hand.
//
// Produced by \`server/scripts/build-safety-corpus.mjs\` from every article in
// \`content/safety/*.mdx\` (frontmatter stripped to a "## [slug] Title"
// header, articles separated by "---", sorted by their \`order\` field). This
// is the entire safety library, shipped verbatim inside the BLW chat's
// cached system prompt so the ask-anything feature never needs retrieval at
// this corpus size.
//
// Regenerate with \`pnpm --filter @blw/server run prebuild:corpus\` after
// editing any safety article, and commit the result. The output is sorted
// and carries no timestamps or absolute paths so an unrelated content edit
// never touches this file's bytes — which would otherwise invalidate every
// user's prompt cache on the next deploy.

export const SAFETY_CORPUS: string = ${JSON.stringify(corpus)};
`;

writeFileSync(outFile, output);
console.log(`Wrote ${path.relative(process.cwd(), outFile)} (${articles.length} articles, ${corpus.length} chars).`);
