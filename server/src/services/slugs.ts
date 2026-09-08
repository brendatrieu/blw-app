// Slugs for rows a parent creates. Shared by custom foods and custom recipes
// so both mint their URLs the same way: a readable base from what the parent
// typed, plus a random suffix, retried against the unique index rather than
// pre-checked (a SELECT-then-INSERT still races).

import { randomBytes } from "node:crypto";

const SLUG_SUFFIX_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const SLUG_SUFFIX_LENGTH = 6;
const SLUG_BASE_MAX = 48;

/** Attempts before giving up on finding a free slug. Six base36 characters
 * make a collision vanishingly unlikely; this is the seatbelt, not the plan. */
export const SLUG_ATTEMPTS = 5;

/**
 * `Roasted Kūmara!` -> `roasted-kumara`. Diacritics are decomposed and their
 * marks dropped so an accented name keeps its letters instead of losing
 * them; a name written in a non-Latin script legitimately slugifies to the
 * empty string, and `buildCandidateSlug` falls back for it.
 */
export function slugifyName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_BASE_MAX)
    .replace(/-+$/g, "");
}

/** Six random base36 characters, so two parents' "Banana bread" coexist. */
function randomSlugSuffix(): string {
  let suffix = "";
  for (const byte of randomBytes(SLUG_SUFFIX_LENGTH)) {
    suffix += SLUG_SUFFIX_ALPHABET[byte % SLUG_SUFFIX_ALPHABET.length];
  }
  return suffix;
}

/** `name-a1b2c3`. A name with nothing slugifiable falls back to `<fallback>-…`. */
export function buildCandidateSlug(name: string, fallback: string): string {
  const base = slugifyName(name) || fallback;
  return `${base}-${randomSlugSuffix()}`;
}

/** Postgres' unique_violation, however the driver in use wraps it. */
export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown; cause?: { code?: unknown } })?.code ?? (error as { cause?: { code?: unknown } })?.cause?.code;
  if (code === "23505") return true;
  return error instanceof Error && /duplicate key value|unique constraint/i.test(error.message);
}
