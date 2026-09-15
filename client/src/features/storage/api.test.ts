import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CreateStorageItemInput, StorageItem } from "@blw/shared";
import { createStorageItem } from "./api.js";

// The storage API client is the ONLY caller of these routes, and a stale
// path would fail silently at runtime (404s) — every gate stayed green when
// a verifier reverted one to /api/fridge. Pin the paths at the source.
describe("storage api paths", () => {
  const source = readFileSync(new URL("./api.ts", import.meta.url), "utf8");

  it("targets /api/storage and never the renamed-away /api/fridge or /api/pantry", () => {
    expect(source).toContain("/api/storage");
    expect(source).not.toContain("/api/fridge");
    expect(source).not.toContain("/api/pantry");
  });

  it("keeps every storage route the client relies on", () => {
    for (const path of ['/api/storage', '/api/storage/', '/api/storage?view=']) expect(source).toContain(path);
  });
});

// The one shape change no type could catch: POST /api/storage answers
// `{ items }` now, not a bare array, and `apiPost`'s generic would have
// happily typed the wrapper AS the array — every gate green, the client
// mapping over an object at runtime (item 347).
describe("createStorageItem response unwrapping", () => {
  const ITEM: StorageItem = {
    id: "11111111-1111-1111-1111-111111111111",
    label: null,
    foods: [{ id: "food-1", slug: "avocado", name: "Avocado", emoji: null }],
    recipeId: null,
    recipeTitle: null,
    preparedAt: "2026-08-20T10:00:00.000Z",
    location: "fridge",
    status: "active",
    statusChangedAt: "2026-08-20T10:00:00.000Z",
    expiresAt: "2026-08-23T10:00:00.000Z",
    useSoon: false,
    expired: false,
    quantityNote: null,
    servingsTotal: null,
    servingsLeft: null,
    bestBy: null,
    notes: null,
  };

  const INPUT: CreateStorageItemInput = { foodIds: ["food-1"], location: "fridge" };

  function stubPost(body: unknown) {
    const calls: Array<[string, RequestInit | undefined]> = [];
    vi.stubGlobal("fetch", (path: string, init?: RequestInit) => {
      calls.push([path, init]);
      return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve(body) } as Response);
    });
    return calls;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the items array out of the { items } envelope, never the envelope itself", async () => {
    stubPost({ items: [ITEM] });
    const created = await createStorageItem(INPUT);
    expect(Array.isArray(created)).toBe(true);
    expect(created).toEqual([ITEM]);
  });

  it("returns one element per container when the parent asked for separate ones", async () => {
    stubPost({ items: [ITEM, { ...ITEM, id: "22222222-2222-2222-2222-222222222222" }] });
    const created = await createStorageItem({ ...INPUT, foodIds: ["food-1", "food-2"], separateItems: true });
    expect(created).toHaveLength(2);
  });

  it("POSTs the input verbatim to /api/storage, separate-containers flag included", async () => {
    const calls = stubPost({ items: [ITEM] });
    await createStorageItem({ ...INPUT, foodIds: ["food-1", "food-2"], separateItems: true });
    expect(calls[0]![0]).toBe("/api/storage");
    expect(JSON.parse(String(calls[0]![1]!.body))).toEqual({
      foodIds: ["food-1", "food-2"],
      separateItems: true,
      location: "fridge",
    });
  });
});
