import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver, type QueryObserverOptions } from "@tanstack/react-query";

// Ledger 1152a: an allergen's out-of-window row caches the meal under Edit's
// key; Edit must still GET it on its own visit, never build from that copy.
const fresh = { id: "meal-1", version: "fresh" };
vi.mock("./api.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchMeal: vi.fn(async () => fresh),
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useQuery: (options: unknown) => options,
}));

const { useMeal, trackingKeys } = await import("./hooks.js");
const { fetchMeal } = await import("./api.js");

describe("useMeal (Edit's fetch)", () => {
  it("refetches on every mount even when a cached copy never goes stale, and that visit's answer is the one used", async () => {
    const options = useMeal("meal-1") as unknown as QueryObserverOptions;
    expect(options.refetchOnMount).toBe("always");
    expect(options.staleTime).toBe(Infinity);

    const client = new QueryClient();
    // What the allergen page left behind: a copy since edited elsewhere.
    client.setQueryData(trackingKeys.meal("meal-1"), { id: "meal-1", version: "stale" });
    const observer = new QueryObserver(client, options);
    const first = observer.getCurrentResult();
    expect(first.data).toEqual({ id: "meal-1", version: "stale" });
    expect(first.isFetchedAfterMount).toBe(false); // resolvePlateStart keeps loading
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() => expect(observer.getCurrentResult().isFetchedAfterMount).toBe(true));
    expect(observer.getCurrentResult().data).toEqual(fresh);
    expect(fetchMeal).toHaveBeenCalledTimes(1);
    unsubscribe();
    client.clear();
  });
});
