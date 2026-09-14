import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { ROUTE_PATTERNS } from "@blw/shared";
import { App } from "../../App.js";
import { UNMATCHED_ROUTE, toRoutePattern } from "./routes.js";

/**
 * A route is the one place a real id, slug or search term could ride into an
 * event on a URL, so `route` is a closed enum and this file is what keeps
 * that enum honest against the router it mirrors.
 */

/** The same depth-first walk App.test.ts uses — one idiom, one behaviour. */
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

/** App declares its catch-all as `*`; the enum spells the same thing `/*`. */
const appRoutePaths = collectRoutePaths((App as unknown as () => ReactNode)()).map((path) =>
  path === "*" ? UNMATCHED_ROUTE : path,
);

describe("ROUTE_PATTERNS mirrors the router", () => {
  it("is exactly App()'s route table, in the same order", () => {
    // Not a subset either way: a route the app has but the enum does not
    // would be reported as `/*` (a whole screen invisible in the data), and
    // an enum entry with no route is a pattern nothing can ever produce.
    expect(appRoutePaths).toEqual([...ROUTE_PATTERNS]);
  });

  it("carries /admin/metrics, declared last inside the layout (item 327)", () => {
    // The dashboard is a real screen and reports its own views like any
    // other — but only an admin's browser can ever produce this pattern,
    // since everyone else renders Not found there.
    expect(ROUTE_PATTERNS).toContain("/admin/metrics");
    expect(appRoutePaths.indexOf("/admin/metrics")).toBe(appRoutePaths.length - 2);
    expect(appRoutePaths[appRoutePaths.length - 1]).toBe(UNMATCHED_ROUTE);
  });
});

describe("toRoutePattern", () => {
  /** One real pathname per declared route — what a parent's URL bar holds. */
  const CASES: Array<[string, string]> = [
    ["/login", "/login"],
    ["/signup", "/signup"],
    ["/", "/"],
    ["/log-meal", "/log-meal"],
    ["/meals", "/meals"],
    ["/meals/6f1c0b1a-0000-4000-8000-000000000001", "/meals/:id"],
    ["/storage", "/storage"],
    ["/storage/add", "/storage/add"],
    ["/storage/6f1c0b1a-0000-4000-8000-000000000002/edit", "/storage/:id/edit"],
    ["/storage/6f1c0b1a-0000-4000-8000-000000000002", "/storage/:id"],
    ["/pantry", "/pantry/*"],
    ["/pantry/add", "/pantry/*"],
    ["/fridge", "/fridge/*"],
    ["/fridge/abc/edit", "/fridge/*"],
    ["/foods", "/foods"],
    ["/foods/new", "/foods/new"],
    ["/foods/sweet-potato/edit", "/foods/:slug/edit"],
    ["/foods/sweet-potato", "/foods/:slug"],
    ["/recipes", "/recipes"],
    ["/recipes/new", "/recipes/new"],
    ["/recipes/6f1c0b1a-0000-4000-8000-000000000003/edit", "/recipes/:id/edit"],
    ["/recipes/6f1c0b1a-0000-4000-8000-000000000003", "/recipes/:id"],
    ["/log", "/log"],
    ["/babies/6f1c0b1a-0000-4000-8000-000000000004/allergens", "/babies/:id/allergens"],
    ["/babies/6f1c0b1a-0000-4000-8000-000000000004/allergens/peanut", "/babies/:id/allergens/:slug"],
    ["/favorites", "/favorites"],
    ["/safety", "/safety"],
    ["/safety/gagging-vs-choking", "/safety/:slug"],
    ["/symptom-check", "/symptom-check"],
    ["/chat", "/chat"],
    ["/chat/6f1c0b1a-0000-4000-8000-000000000005", "/chat/:threadId"],
    ["/settings", "/settings"],
    ["/more", "/more"],
    ["/admin/metrics", "/admin/metrics"],
  ];

  it("covers every route App declares (bar the catch-all, which has no pathname of its own)", () => {
    const covered = [...new Set(CASES.map(([, pattern]) => pattern))].sort();
    expect(covered).toEqual([...ROUTE_PATTERNS].filter((p) => p !== UNMATCHED_ROUTE).sort());
  });

  it.each(CASES)("maps %s to %s", (pathname, pattern) => {
    expect(toRoutePattern(pathname)).toBe(pattern);
  });

  it("resolves the specific route ahead of the parameterised one it shadows", () => {
    // The two pairs App.tsx orders by hand, for exactly this reason.
    expect(toRoutePattern("/foods/new")).toBe("/foods/new");
    expect(toRoutePattern("/recipes/new")).toBe("/recipes/new");
    expect(toRoutePattern("/storage/add")).toBe("/storage/add");
  });

  it("turns anything it does not recognise into the catch-all, never into itself", () => {
    for (const pathname of ["/nope", "/foods/a/b/c", "/admin", "/admin/metrics/secret", "", "/settings/secret"]) {
      expect(toRoutePattern(pathname)).toBe(UNMATCHED_ROUTE);
    }
  });

  it("never lets a real id or slug through in the answer", () => {
    const answers = CASES.map(([pathname]) => toRoutePattern(pathname));
    expect(answers.some((answer) => answer.includes("sweet-potato"))).toBe(false);
    expect(answers.some((answer) => answer.includes("6f1c0b1a"))).toBe(false);
  });
});
