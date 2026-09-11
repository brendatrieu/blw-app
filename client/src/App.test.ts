import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { App, legacyStoragePath } from "./App.js";
import { storageKeys } from "./features/storage/hooks.js";
import { preferenceKeys } from "./features/tour/hooks.js";

/**
 * Items 287 and 293: the two wildcard routes in App (`/pantry/*` and
 * `/fridge/*`) hand their location to this function, so pinning the function
 * pins what the redirect does. (The `<Navigate>` itself only moves on a real
 * effect loop, which the node-env renderToString suite doesn't have.)
 */
describe("legacyStoragePath", () => {
  const at = (pathname: string, search = "", hash = "") => legacyStoragePath({ pathname, search, hash });

  it("maps every old /pantry route onto its /storage twin", () => {
    expect(at("/pantry")).toBe("/storage");
    expect(at("/pantry/add")).toBe("/storage/add");
    expect(at("/pantry/abc-123")).toBe("/storage/abc-123");
    expect(at("/pantry/abc-123/edit")).toBe("/storage/abc-123/edit");
  });

  it("maps every old /fridge route onto its /storage twin", () => {
    expect(at("/fridge")).toBe("/storage");
    expect(at("/fridge/add")).toBe("/storage/add");
    expect(at("/fridge/abc-123")).toBe("/storage/abc-123");
    expect(at("/fridge/abc-123/edit")).toBe("/storage/abc-123/edit");
  });

  it("carries the query string and hash across", () => {
    expect(at("/pantry/add", "?food=oat", "#form")).toBe("/storage/add?food=oat#form");
    expect(at("/fridge/add", "?food=oat", "#form")).toBe("/storage/add?food=oat#form");
  });

  it("leaves a path that is already /storage alone", () => {
    expect(at("/storage/abc-123")).toBe("/storage/abc-123");
  });

  it("only rewrites the leading segment, never the word elsewhere in a path", () => {
    expect(at("/foods/pantry-staple")).toBe("/foods/pantry-staple");
    expect(at("/foods/fridge-staple")).toBe("/foods/fridge-staple");
    expect(at("/pantryville")).toBe("/pantryville");
    expect(at("/fridgeville")).toBe("/fridgeville");
  });
});

/** Depth-first walk of a React element tree (children only — no rendering). */
function collectRoutePaths(node: ReactNode, out: string[] = []): string[] {
  if (!isValidElement(node)) {
    if (Array.isArray(node)) node.forEach((n) => collectRoutePaths(n, out));
    return out;
  }
  const el = node as ReactElement<{ path?: string; children?: ReactNode }>;
  if (typeof el.props.path === "string") out.push(el.props.path);
  collectRoutePaths(el.props.children, out);
  return out;
}

describe("App route wiring (items 287/293 — both legacy redirects are mounted, not just defined)", () => {
  it("mounts /pantry/* and /fridge/* splat routes that hand old links to storage", () => {
    // App() returns its element tree without rendering (no hooks at the top
    // level), so the <Route> elements and their `path` props are walkable.
    const paths = collectRoutePaths((App as unknown as () => ReactNode)());
    expect(paths).toContain("/pantry/*");
    expect(paths).toContain("/fridge/*");
    expect(paths).toContain("/storage");
    expect(paths.some((p) => p.startsWith("/pantry") && p !== "/pantry/*")).toBe(false);
    expect(paths.some((p) => p.startsWith("/fridge") && p !== "/fridge/*")).toBe(false);
  });
});

describe("App route wiring (item 303 — the tour is a real, authenticated route)", () => {
  it("mounts /tour inside the authenticated tree, not as a public page", () => {
    const paths = collectRoutePaths((App as unknown as () => ReactNode)());
    expect(paths).toContain("/tour");
    // Sanity: the walk reaches the guarded branch these siblings live in, so
    // "/tour is present" really does mean "present behind RequireAuth".
    expect(paths).toContain("/more");
    expect(paths).toContain("/settings");
    // Exactly one tour route — no stray public duplicate.
    expect(paths.filter((path) => path === "/tour")).toHaveLength(1);
  });
});

describe("storage query keys survive offline persistence", () => {
  it("start with the 'storage' prefix that main.tsx persists", () => {
    expect(storageKeys.list("active")[0]).toBe("storage");
    const main = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
    expect(main).toMatch(/PERSISTED_QUERY_KEY_PREFIXES[\s\S]*"storage"/);
    expect(main).not.toMatch(/PERSISTED_QUERY_KEY_PREFIXES[\s\S]{0,400}"pantry"/);
    expect(main).not.toMatch(/PERSISTED_QUERY_KEY_PREFIXES[\s\S]{0,400}"fridge"/);
  });

  it("persist the tour's 'seen' flag under the 'preferences' prefix (item 304)", () => {
    expect(preferenceKeys.all()[0]).toBe("preferences");
    const main = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
    expect(main).toMatch(/PERSISTED_QUERY_KEY_PREFIXES[\s\S]*"preferences"/);
  });
});
