import { describe, expect, it } from "vitest";
import { performSignOut, type SignOutDeps } from "./signout.js";

function makeDeps(order: string[]): SignOutDeps {
  return {
    authSignOut: async () => {
      // Resolve on a later microtask so any premature call to a
      // subsequent cleanup step would race ahead of this and show up out
      // of order below.
      await Promise.resolve();
      order.push("authSignOut");
    },
    queryClient: {
      clear: () => {
        order.push("queryClient.clear");
      },
    },
    clearCache: async () => {
      order.push("clearCache");
    },
    storage: {
      removeItem: (key: string) => {
        order.push(`storage.removeItem:${key}`);
      },
    },
    flushUsage: async () => {
      await Promise.resolve();
      order.push("flushUsage");
    },
    discardUsage: async () => {
      order.push("discardUsage");
    },
  };
}

describe("performSignOut", () => {
  it("runs all four cleanups, each after auth sign-out resolves", async () => {
    const order: string[] = [];
    await performSignOut(makeDeps(order));

    expect(order).toEqual([
      // The usage flush goes FIRST, while the session cookie is still valid:
      // a queued event sent after the sign-out arrives anonymous.
      "flushUsage",
      "authSignOut",
      "queryClient.clear",
      "clearCache",
      "storage.removeItem:blw.activeBabyId",
      // And the queue is purged last, with the rest of the account's
      // client-side state (item 319).
      "discardUsage",
    ]);
  });

  it("removes the active-baby localStorage key specifically", async () => {
    const order: string[] = [];
    await performSignOut(makeDeps(order));

    expect(order).toContain("storage.removeItem:blw.activeBabyId");
  });

  it("still clears this device when the server sign-out fails (offline, item 827), then rethrows", async () => {
    const order: string[] = [];
    const deps = makeDeps(order);
    deps.authSignOut = () => Promise.reject(new TypeError("Failed to fetch"));
    await expect(performSignOut(deps)).rejects.toThrow("Failed to fetch");

    expect(order).toEqual(["flushUsage", "queryClient.clear", "clearCache", "storage.removeItem:blw.activeBabyId", "discardUsage"]);
  });
});
