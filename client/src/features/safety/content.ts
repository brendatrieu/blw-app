// The 8 safety MDX articles live in `content/safety/` at the repo root (the
// single source of truth — also compiled into the AI system prompt at build
// time, per the plan). We glob them in as raw strings so they land inside the
// JS chunks and precache for full offline reading; no network fetch, and no
// MDX compiler is needed since the frontmatter here is a handful of flat
// `key: value` lines, not real YAML.

export interface SafetyArticle {
  slug: string;
  title: string;
  order: number;
  summary: string;
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const REQUIRED_FIELDS = ["slug", "title", "order", "summary"] as const;
type FrontmatterField = (typeof REQUIRED_FIELDS)[number];

function parseArticle(sourcePath: string, raw: string): SafetyArticle {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) {
    throw new Error(`Safety article "${sourcePath}" is missing --- frontmatter.`);
  }
  const [, frontmatter = "", body = ""] = match;

  const fields: Partial<Record<FrontmatterField, string>> = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim();
    if ((REQUIRED_FIELDS as readonly string[]).includes(key)) {
      fields[key as FrontmatterField] = value;
    }
  }

  for (const field of REQUIRED_FIELDS) {
    if (!fields[field]) {
      throw new Error(`Safety article "${sourcePath}" is missing "${field}" in its frontmatter.`);
    }
  }

  const order = Number(fields.order);
  if (!Number.isFinite(order)) {
    throw new Error(`Safety article "${sourcePath}" has a non-numeric "order".`);
  }

  return {
    slug: fields.slug!,
    title: fields.title!,
    order,
    summary: fields.summary!,
    body: body.trim(),
  };
}

// `query: "?raw", import: "default", eager: true` bundles each file's text
// straight into this chunk at build time — no dynamic import, no runtime
// fetch, so the whole library reads offline the moment the app shell is
// cached.
const rawModules = import.meta.glob("../../../../content/safety/*.mdx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const safetyArticles: SafetyArticle[] = Object.entries(rawModules)
  .map(([sourcePath, raw]) => parseArticle(sourcePath, raw))
  .sort((a, b) => a.order - b.order);

const bySlug = new Map(safetyArticles.map((article) => [article.slug, article]));
if (bySlug.size !== safetyArticles.length) {
  throw new Error("Duplicate slug found among safety articles.");
}

export function getSafetyArticle(slug: string): SafetyArticle | undefined {
  return bySlug.get(slug);
}
