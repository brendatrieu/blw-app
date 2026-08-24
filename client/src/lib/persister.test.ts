import { describe, expect, it, vi } from "vitest";

const del = vi.fn(async () => undefined);
const get = vi.fn(async () => undefined);
const set = vi.fn(async () => undefined);

vi.mock("idb-keyval", () => ({ del, get, set }));

describe("clearPersistedQueryCache", () => {
  it("deletes the persisted react-query IndexedDB key", async () => {
    const { clearPersistedQueryCache } = await import("./persister.js");

    await clearPersistedQueryCache();

    expect(del).toHaveBeenCalledWith("blw.reactQueryCache");
  });
});
