import { describe, expect, it } from "vitest";
import { QueryClient, QueryObserver, type Query } from "@tanstack/react-query";
import {
  CATALOG_VERSION_STORAGE_KEY,
  checkCatalogVersion,
  createCatalogVersionChecker,
  type CatalogVersionDeps,
} from "./catalogVersion.js";

type Predicate = (query: Pick<Query, "queryKey">) => boolean;

function makeDeps(opts: { body?: unknown; stored?: string | null; ok?: boolean } = {}) {
  const calls: string[] = [];
  const store = new Map<string, string>();
  if (opts.stored != null) store.set(CATALOG_VERSION_STORAGE_KEY, opts.stored);
  let predicate: Predicate | undefined;
  let cancelPredicate: Predicate | undefined;
  let clock = 0;
  const deps: CatalogVersionDeps = {
    fetchVersion: async () => {
      calls.push("fetch");
      return new Response(JSON.stringify(opts.body === undefined ? { version: "v2" } : opts.body), {
        status: opts.ok === false ? 503 : 200,
      });
    },
    deleteCatalogCache: async () => {
      // A later microtask, so an invalidate that did not wait would log first.
      await Promise.resolve();
      calls.push("deleteCatalogCache");
    },
    queryClient: {
      cancelQueries: async (filters?: { predicate?: Predicate }) => {
        cancelPredicate = filters?.predicate;
        await Promise.resolve();
        calls.push("cancelQueries");
      },
      invalidateQueries: async (filters?: { predicate?: Predicate }) => {
        predicate = filters?.predicate;
        await Promise.resolve();
        calls.push("invalidateQueries");
      },
    } as unknown as CatalogVersionDeps["queryClient"],
    storage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => {
        calls.push(`setItem:${value}`);
        store.set(key, value);
      },
    },
    now: () => clock,
  };
  return {
    deps,
    calls,
    store,
    predicate: () => predicate,
    cancelPredicate: () => cancelPredicate,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("checkCatalogVersion", () => {
  it("does nothing beyond the fetch when the version is unchanged", async () => {
    const t = makeDeps({ stored: "v2" });
    await checkCatalogVersion(t.deps);
    expect(t.calls).toEqual(["fetch"]);
  });

  it("on a new version clears the SW cache, then invalidates, then stores", async () => {
    const t = makeDeps({ stored: "v1" });
    await expect(checkCatalogVersion(t.deps)).resolves.toBe(true);
    expect(t.calls).toEqual(["fetch", "deleteCatalogCache", "cancelQueries", "invalidateQueries", "setItem:v2"]);
  });

  it("treats no stored version as new", async () => {
    const t = makeDeps();
    await checkCatalogVersion(t.deps);
    expect(t.calls).toEqual(["fetch", "deleteCatalogCache", "cancelQueries", "invalidateQueries", "setItem:v2"]);
  });

  it("is a no-op when the fetch rejects (offline)", async () => {
    const t = makeDeps();
    t.deps.fetchVersion = () => Promise.reject(new TypeError("Failed to fetch"));
    await expect(checkCatalogVersion(t.deps)).resolves.toBe(false);
    expect(t.calls).toEqual([]);
  });

  it("is a no-op on a non-2xx answer", async () => {
    const t = makeDeps({ ok: false });
    await expect(checkCatalogVersion(t.deps)).resolves.toBe(false);
    expect(t.calls).toEqual(["fetch"]);
  });

  it.each([{ version: null }, { version: "" }, { version: 7 }, {}, null, "v2"])(
    "is a no-op when the body is %j",
    async (body) => {
      const t = makeDeps({ body });
      await checkCatalogVersion(t.deps);
      expect(t.calls).toEqual(["fetch"]);
    },
  );

  it("is a no-op when the body is not JSON", async () => {
    const t = makeDeps();
    t.deps.fetchVersion = async () => new Response("<html>", { status: 200 });
    await checkCatalogVersion(t.deps);
    expect(t.store.size).toBe(0);
  });

  it("skips the cache delete without a Cache API", async () => {
    const t = makeDeps();
    t.deps.deleteCatalogCache = null;
    await checkCatalogVersion(t.deps);
    expect(t.calls).toEqual(["fetch", "cancelQueries", "invalidateQueries", "setItem:v2"]);
  });

  it("does not store the version when the cache delete fails, so it retries", async () => {
    const t = makeDeps({ stored: "v1" });
    t.deps.deleteCatalogCache = () => Promise.reject(new Error("quota"));
    await expect(checkCatalogVersion(t.deps)).rejects.toThrow();
    expect(t.store.get(CATALOG_VERSION_STORAGE_KEY)).toBe("v1");
  });

  it("survives localStorage throwing on read and write", async () => {
    const t = makeDeps();
    t.deps.storage = {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
    };
    await expect(checkCatalogVersion(t.deps)).resolves.toBe(true);
    expect(t.calls).toEqual(["fetch", "deleteCatalogCache", "cancelQueries", "invalidateQueries"]);
  });

  it("cancels and invalidates exactly the foods/food/recipes/recipe families", async () => {
    const t = makeDeps();
    await checkCatalogVersion(t.deps);
    for (const predicate of [t.cancelPredicate(), t.predicate()]) {
      const matches = (key: unknown[]) => predicate!({ queryKey: key });
      for (const key of [["foods", {}], ["food", "lemon"], ["recipes", {}], ["recipe", "r1"]]) {
        expect(matches(key)).toBe(true);
      }
      for (const key of [["babies"], ["meals", "b1"], ["storage"], ["favorites"], ["allergen-progress", "b1"]]) {
        expect(matches(key)).toBe(false);
      }
    }
  });
});

describe("createCatalogVersionChecker", () => {
  const FIFTEEN_MIN = 15 * 60 * 1000;

  it("checks at most once per 15 minutes", async () => {
    const t = makeDeps({ stored: "v2" });
    const check = createCatalogVersionChecker(t.deps);
    await check();
    t.advance(FIFTEEN_MIN - 1);
    await check();
    expect(t.calls).toEqual(["fetch"]);
    t.advance(1);
    await check();
    expect(t.calls).toEqual(["fetch", "fetch"]);
  });

  it("shares one fetch between overlapping calls", async () => {
    const t = makeDeps({ stored: "v2" });
    const check = createCatalogVersionChecker(t.deps);
    await Promise.all([check(), check(), check()]);
    expect(t.calls).toEqual(["fetch"]);
  });

  it("does not start the 15 minutes when the server could not be reached", async () => {
    const t = makeDeps({ stored: "v2" });
    const online = t.deps.fetchVersion;
    t.deps.fetchVersion = () => Promise.reject(new TypeError("Failed to fetch"));
    const check = createCatalogVersionChecker(t.deps);
    await check();
    t.deps.fetchVersion = online;
    t.advance(1);
    await check();
    expect(t.calls).toEqual(["fetch"]);
  });

  it("swallows a failed clear and retries on the next call", async () => {
    const t = makeDeps({ stored: "v1" });
    t.deps.deleteCatalogCache = () => Promise.reject(new Error("quota"));
    const check = createCatalogVersionChecker(t.deps);
    await expect(check()).resolves.toBeUndefined();
    await check();
    expect(t.calls).toEqual(["fetch", "fetch"]);
  });
});

describe("checkCatalogVersion against a real QueryClient", () => {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it("replaces a first catalog load that asked the SW cache just before the delete", async () => {
    // The race behind the cancel step: a query with no data yet is already
    // waiting on the SW's stale copy when the version check clears the cache.
    // invalidateQueries alone would wait on that answer instead of cancelling it.
    let swHasStaleCopy = true;
    const queryFn = () => {
      const answer = swHasStaleCopy ? "stale" : "fresh";
      return sleep(30).then(() => answer);
    };
    const queryClient = new QueryClient();
    queryClient.mount();
    const store = new Map([[CATALOG_VERSION_STORAGE_KEY, "v1"]]);
    const check = checkCatalogVersion({
      fetchVersion: async () => {
        await sleep(10);
        return new Response(JSON.stringify({ version: "v2" }));
      },
      deleteCatalogCache: async () => {
        swHasStaleCopy = false;
      },
      queryClient,
      storage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => void store.set(key, value) },
      now: () => 0,
    });
    await sleep(5);
    const unsubscribe = new QueryObserver(queryClient, { queryKey: ["foods", {}], queryFn, staleTime: 300_000 }).subscribe(
      () => undefined,
    );
    await check;
    await sleep(100);
    expect(queryClient.getQueryData(["foods", {}])).toBe("fresh");
    expect(store.get(CATALOG_VERSION_STORAGE_KEY)).toBe("v2");
    unsubscribe();
    queryClient.unmount();
  });
});
