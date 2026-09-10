import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { App, legacyFridgePath } from "./App.js";
import { fridgeKeys } from "./features/fridge/hooks.js";

/**
 * Item 287: the one wildcard `<Route path="/pantry/*">` in App hands its
 * location to this function, so pinning the function pins what the redirect
 * does. (The `<Navigate>` itself only moves on a real effect loop, which the
 * node-env renderToString suite doesn't have.)
 */
describe("legacyFridgePath", () => {
  const at = (pathname: string, search = "", hash = "") => legacyFridgePath({ pathname, search, hash });

  it("maps every old /pantry route onto its /fridge twin", () => {
    expect(at("/pantry")).toBe("/fridge");
    expect(at("/pantry/add")).toBe("/fridge/add");
    expect(at("/pantry/abc-123")).toBe("/fridge/abc-123");
    expect(at("/pantry/abc-123/edit")).toBe("/fridge/abc-123/edit");
  });

  it("carries the query string and hash across", () => {
    expect(at("/pantry/add", "?food=oat", "#form")).toBe("/fridge/add?food=oat#form");
  });

  it("only rewrites the leading segment, never the word elsewhere in a path", () => {
    expect(at("/foods/pantry-staple")).toBe("/foods/pantry-staple");
    expect(at("/pantryville")).toBe("/pantryville");
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

describe("App route wiring (item 287 — the legacy redirect is mounted, not just defined)", () => {
  it("mounts a /pantry/* splat route that hands old links to the fridge", () => {
    // App() returns its element tree without rendering (no hooks at the top
    // level), so the <Route> elements and their `path` props are walkable.
    const paths = collectRoutePaths((App as unknown as () => ReactNode)());
    expect(paths).toContain("/pantry/*");
    expect(paths).toContain("/fridge");
    expect(paths.some((p) => p.startsWith("/pantry") && p !== "/pantry/*")).toBe(false);
  });
});

describe("fridge query keys survive offline persistence", () => {
  it("start with the 'fridge' prefix that main.tsx persists", () => {
    expect(fridgeKeys.list("active")[0]).toBe("fridge");
    const main = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
    expect(main).toMatch(/PERSISTED_QUERY_KEY_PREFIXES[\s\S]*"fridge"/);
    expect(main).not.toMatch(/PERSISTED_QUERY_KEY_PREFIXES[\s\S]{0,400}"pantry"/);
  });
});
