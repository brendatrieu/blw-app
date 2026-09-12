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

describe("App route wiring (item 310 — the tour is a modal, not a route)", () => {
  it("mounts no /tour route at all, so an old link falls through to Not found", () => {
    const paths = collectRoutePaths((App as unknown as () => ReactNode)());
    // Sanity: the walk reaches the guarded branch the tour used to live in.
    expect(paths).toContain("/more");
    expect(paths).toContain("/settings");
    expect(paths.some((path) => path.startsWith("/tour"))).toBe(false);
    // The catch-all is what an old /tour bookmark now lands on.
    expect(paths).toContain("*");
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

  it("deliberately do NOT persist the tour's 'seen' flag (item 311)", () => {
    // A restored `["preferences"]` entry makes the query read "success" off
    // the cache on a cold start, and v1's gate re-ran the tour for parents
    // who had already finished it. The prefix must stay out of the set.
    expect(preferenceKeys.all()[0]).toBe("preferences");
    const main = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
    const block = /PERSISTED_QUERY_KEY_PREFIXES = new Set\(\[([\s\S]*?)\]\)/.exec(main)?.[1] ?? "";
    // Comments in the set explain the absence; the entries are what counts.
    const set = block.replace(/\/\/[^\n]*/g, "");
    expect(block).not.toBe("");
    expect(set).toContain('"storage"');
    expect(set).not.toContain('"preferences"');
  });
});

describe("the app's user-facing name (item 308)", () => {
  const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

  it("is 'Little Meals' in the browser tab and on an iOS home screen", () => {
    const html = read("../index.html");
    expect(html).toContain("<title>Little Meals</title>");
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Little Meals" />');
    expect(html).not.toContain("blw-app");
  });

  it("is 'Little Meals' in the installed PWA's manifest", () => {
    const config = read("../vite.config.ts");
    const manifest = /manifest: \{([\s\S]*?)\n {6}\}/.exec(config)?.[1] ?? "";
    expect(manifest).not.toBe("");
    expect(manifest).toContain('name: "Little Meals"');
    expect(manifest).toContain('short_name: "Little Meals"');
    expect(manifest).not.toContain("blw-app");
  });

  it("leaves the package/workspace identifiers alone — only what a parent reads is renamed", () => {
    // The repo, the packages and the API are still @blw/*; renaming those
    // would be a rename of the codebase, not of the product.
    expect(read("../package.json")).toContain('"name": "@blw/client"');
  });
});
