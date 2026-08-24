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
  };
}

describe("performSignOut", () => {
  it("runs all four cleanups, each after auth sign-out resolves", async () => {
    const order: string[] = [];
    await performSignOut(makeDeps(order));

    expect(order).toEqual([
      "authSignOut",
      "queryClient.clear",
      "clearCache",
      "storage.removeItem:blw.activeBabyId",
    ]);
  });

  it("removes the active-baby localStorage key specifically", async () => {
    const order: string[] = [];
    await performSignOut(makeDeps(order));

    expect(order).toContain("storage.removeItem:blw.activeBabyId");
  });
});
