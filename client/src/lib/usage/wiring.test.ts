// The call sites that have no mutation hook of their own: the survey's first
// change, a Learn article mounting, the top-level crash guard, and the API
// helper's failure counter. Driven as plain functions against the same
// hook-store harness the rest of the suite uses.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => {
  const store = {
    states: [] as unknown[],
    i: 0,
    refs: [] as { current: unknown }[],
    r: 0,
    effects: [] as (() => void)[],
    params: {} as Record<string, string | undefined>,
  };
  return {
    store,
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
      return [store.states[i], (v: unknown) => {
        store.states[i] = typeof v === "function" ? (v as (p: unknown) => unknown)(store.states[i]) : v;
      }];
    },
    useRef: (init: unknown) => {
      const i = store.r++;
      if (!(i in store.refs)) store.refs[i] = { current: init };
      return store.refs[i];
    },
    useEffect: (effect: () => void) => {
      store.effects.push(effect);
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useState: h.useState,
    useRef: h.useRef,
    useEffect: h.useEffect,
    useMemo: (fn: () => unknown) => fn(),
    useCallback: (fn: unknown) => fn,
  };
});

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useParams: () => h.store.params, Navigate: () => null };
});

const tracked: Array<[string, Record<string, unknown>]> = [];
vi.mock("./track.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, track: (...args: unknown[]) => tracked.push(args as [string, Record<string, unknown>]) };
});

import { ErrorBoundary } from "../../components/ErrorBoundary.js";
import { SymptomSurveyForm } from "../../features/symptom/components/SymptomSurveyForm.js";
import { SafetyArticlePage } from "../../pages/SafetyArticlePage.js";
import { apiGet } from "../api.js";
import { resetUsage, setUsageConsent } from "./track.js";

interface Rendered {
  type: unknown;
  props: { children?: unknown; onChange?: () => void; [key: string]: unknown };
}

function reset() {
  h.store.states = [];
  h.store.i = 0;
  h.store.refs = [];
  h.store.r = 0;
  h.store.effects = [];
  h.store.params = {};
  tracked.length = 0;
}

beforeEach(() => {
  reset();
  resetUsage();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetUsage();
});

describe("symptom_check_started", () => {
  function renderSurvey(): Rendered {
    h.store.i = 0;
    h.store.r = 0;
    return (SymptomSurveyForm as unknown as (props: unknown) => Rendered)({
      onSubmit: () => {},
      isPending: false,
      errorMessage: null,
    });
  }

  it("fires on the first change anywhere in the survey, and only once", () => {
    // One handler on the FORM: React's change event bubbles, so every
    // checkbox, select and textarea in here is covered — including ones
    // added later.
    const form = renderSurvey();
    expect(typeof form.props.onChange).toBe("function");

    form.props.onChange!();
    form.props.onChange!();
    renderSurvey().props.onChange!();
    expect(tracked).toEqual([["symptom_check_started", {}]]);
  });

  it("sends nothing about what was selected — completion is a symptom_checks row", () => {
    renderSurvey().props.onChange!();
    expect(tracked[0]![1]).toEqual({});
  });
});

describe("article_viewed", () => {
  function renderArticle(slug: string | undefined) {
    h.store.i = 0;
    h.store.r = 0;
    h.store.effects = [];
    h.store.params = { slug };
    (SafetyArticlePage as unknown as (props: unknown) => unknown)({});
    for (const effect of h.store.effects) effect();
  }

  it("reports a real article by slug, with where the parent came from", () => {
    renderArticle("gagging-vs-choking");
    expect(tracked).toEqual([["article_viewed", { article: "gagging-vs-choking", from_route: null }]]);
  });

  it("reports a mounted article once, not once per render", () => {
    renderArticle("unsafe-foods");
    renderArticle("unsafe-foods");
    expect(tracked).toHaveLength(1);
  });

  it("says NOTHING for a slug that is not a real article — a URL is not a closed set", () => {
    renderArticle("../../etc/passwd");
    renderArticle(undefined);
    expect(tracked).toEqual([]);
  });
});

describe("client_error from the top-level crash guard", () => {
  it("counts a render crash against its route, and keeps the error on the console", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const boundary = new ErrorBoundary({ children: null });
    boundary.componentDidCatch(new Error("Cannot read properties of undefined"));

    expect(tracked).toEqual([["client_error", { route_pattern: "/*", kind: "render_crash", status: "none" }]]);
    // The message a crash carries can be anything that was on screen, so it
    // goes exactly one place: this device's console.
    expect(logged).toHaveBeenCalledOnce();
    expect(JSON.stringify(tracked)).not.toContain("Cannot read properties");
  });
});

describe("client_error from the API helper", () => {
  it("counts a 5xx with its status bucket", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 503, statusText: "", json: async () => ({ error: "x" }) }));
    await expect(apiGet("/api/babies")).rejects.toThrow();
    expect(tracked).toEqual([["client_error", { route_pattern: "/*", kind: "api_5xx", status: "503" }]]);
  });

  it("counts a request that never happened as api_network", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(apiGet("/api/babies")).rejects.toThrow();
    expect(tracked).toEqual([["client_error", { route_pattern: "/*", kind: "api_network", status: "none" }]]);
  });

  it("says nothing about a 4xx — 'not signed in' and 'not found' are correct answers", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 401, statusText: "", json: async () => ({ error: "x" }) }));
    await expect(apiGet("/api/preferences")).rejects.toThrow();
    expect(tracked).toEqual([]);
  });

  it("never reports the usage endpoint's own failures — that would spin", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 500, statusText: "", json: async () => ({}) }));
    await expect(apiGet("/api/usage")).rejects.toThrow();
    expect(tracked).toEqual([]);
  });
});

describe("the provider's place in the tree", () => {
  const main = readFileSync(new URL("../../main.tsx", import.meta.url), "utf8");

  it("sits INSIDE BrowserRouter, so /login and /signup are measured too", () => {
    // Outside the router it could not read a location; inside AppLayout it
    // would never see the signup funnel at all.
    expect(main).toMatch(/<BrowserRouter>[\s\S]*<UsageProvider>[\s\S]*<App \/>[\s\S]*<\/UsageProvider>[\s\S]*<\/BrowserRouter>/);
  });

  it("does not persist the usage queue through the react-query cache", () => {
    // The queue owns its own IndexedDB key and its own replay rules.
    const block = /PERSISTED_QUERY_KEY_PREFIXES = new Set\(\[([\s\S]*?)\]\)/.exec(main)?.[1] ?? "";
    expect(block).not.toBe("");
    expect(block).not.toContain("usage");
  });
});

describe("consent is the gate, not the call sites", () => {
  it("means an instrumented call site sends nothing at all until the preference resolves", async () => {
    // Every test above asserts what `track` was ASKED to record. This one
    // asserts the other half: asking is not sending.
    vi.unstubAllGlobals();
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return { ok: true, status: 204, json: async () => ({}) };
    });
    setUsageConsent(undefined);
    expect(calls.filter((url) => url.includes("/api/usage"))).toEqual([]);
  });
});
