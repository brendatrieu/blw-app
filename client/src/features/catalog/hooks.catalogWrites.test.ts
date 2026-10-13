// Ledger 791: the service worker serves /api/foods and /api/recipes
// stale-while-revalidate, so a refetch right after a custom food/recipe write
// was answered with the list from before it, and overwrote the cache entry the
// write had just fixed ("1 selected", no chip, the new food not searchable).
// Pins (1) the mechanism against a fake SW cache and (2) that EVERY catalog
// write empties that cache before it invalidates.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import type { FoodDetail, FoodsResponse } from "@blw/shared";

const h = vi.hoisted(() => {
  const log: string[] = [];
  return {
    log,
    client: null as unknown as import("@tanstack/react-query").QueryClient,
    deleteCatalogCache: () => {
      log.push("deleteCatalogCache");
      return Promise.resolve(true);
    },
  };
});

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useQueryClient: () => h.client,
    // The hook's options ARE the result here, so onSettled can be called directly.
    useMutation: (options: Record<string, unknown>) => options,
  };
});

vi.mock("../../lib/catalogVersion.js", () => ({ deleteCatalogCache: () => h.deleteCatalogCache() }));

import {
  catalogKeys,
  invalidateAfterCatalogWrite,
  useCreateCustomFood,
  useCreateCustomRecipe,
  useDeleteCustomFood,
  useDeleteCustomRecipe,
  useReplaceCustomFood,
  useRestoreCustomFood,
  useUpdateCustomFood,
  useUpdateCustomRecipe,
  writeCustomFoodToCache,
} from "./hooks.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function food(id: string, name: string): FoodDetail {
  return { id, slug: id, name, category: "legume", allergens: [], emoji: null, deletedAt: null } as unknown as FoodDetail;
}

describe("a foods refetch after creating a custom food (the SW-cache race)", () => {
  async function run(deleteCache: (() => Promise<unknown>) | null) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const before: FoodsResponse = { foods: [food("apple", "Apple")] } as FoodsResponse;
    const kidney = food("kidney", "kidney bean");
    // A fake SW: answers from its cache while it holds one (stale-while-revalidate), else the server.
    let swCache: FoodsResponse | null = before;
    const server = (): FoodsResponse => ({ foods: [...before.foods, kidney] }) as FoodsResponse;
    const observer = new QueryObserver(client, {
      queryKey: catalogKeys.foodsList({}),
      queryFn: () => swCache ?? server(),
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    await flush();

    writeCustomFoodToCache(client, kidney);
    await invalidateAfterCatalogWrite(
      client,
      [catalogKeys.foods],
      deleteCache &&
        (async () => {
          swCache = null;
          return deleteCache();
        }),
    );
    await flush();
    const names = client.getQueryData<FoodsResponse>(catalogKeys.foodsList({}))?.foods.map((f) => f.name);
    unsubscribe();
    return names;
  }

  it("without emptying the SW cache first, the stale answer drops the new food (the bug)", async () => {
    expect(await run(null)).toEqual(["Apple"]);
  });

  it("emptying it first keeps the new food in the list the picker reads", async () => {
    expect(await run(() => Promise.resolve(true))).toEqual(["Apple", "kidney bean"]);
  });

  it("still invalidates when the cache delete fails", async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    await invalidateAfterCatalogWrite(client, [catalogKeys.foods], () => Promise.reject(new Error("quota")));
    expect(spy).toHaveBeenCalledWith({ queryKey: catalogKeys.foods });
  });
});

describe("every catalog write empties the SW catalog cache before it invalidates", () => {
  beforeEach(() => {
    h.log.length = 0;
    h.client = new QueryClient();
    vi.spyOn(h.client, "invalidateQueries").mockImplementation((filters) => {
      h.log.push(`invalidate:${JSON.stringify(filters?.queryKey)}`);
      return Promise.resolve();
    });
  });

  const saved = food("kidney", "kidney bean");
  const hooks: [string, () => unknown, string][] = [
    ["useCreateCustomFood", useCreateCustomFood, '["foods"]'],
    ["useUpdateCustomFood", useUpdateCustomFood, '["foods"]'],
    ["useDeleteCustomFood", useDeleteCustomFood, '["foods"]'],
    ["useRestoreCustomFood", useRestoreCustomFood, '["foods"]'],
    ["useReplaceCustomFood", useReplaceCustomFood, '["foods"]'],
    ["useCreateCustomRecipe", useCreateCustomRecipe, '["recipes"]'],
    ["useUpdateCustomRecipe", useUpdateCustomRecipe, '["recipes"]'],
    ["useDeleteCustomRecipe", useDeleteCustomRecipe, '["recipes"]'],
  ];

  it.each(hooks)("%s", async (_name, hook, listKey) => {
    const { onSettled } = hook() as { onSettled: (data: unknown) => void };
    onSettled(saved);
    await flush();
    expect(h.log[0]).toBe("deleteCatalogCache");
    expect(h.log).toContain(`invalidate:${listKey}`);
  });
});
