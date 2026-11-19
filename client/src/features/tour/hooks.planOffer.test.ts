// Ledger 995: "Not now" on Home's planning offer. The PATCH it sends, and the
// optimistic hide: the cached preferences read as dismissed before the server
// answers, then hold the server's own stamp; a failure leaves it hidden.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { UserPreferences } from "@blw/shared";

const h = vi.hoisted(() => ({
  client: null as unknown as import("@tanstack/react-query").QueryClient,
  patches: [] as unknown[][],
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useQueryClient: () => h.client,
  // The hook's options ARE the result here, so its callbacks can be called directly.
  useMutation: (options: Record<string, unknown>) => options,
}));
vi.mock("../../lib/api.js", () => ({
  apiGet: vi.fn(),
  apiPatch: (...args: unknown[]) => {
    h.patches.push(args);
    return Promise.resolve({ tourCompletedAt: null, shareUsageData: true, planOfferDismissedAt: "2026-11-18T09:00:00.000Z" });
  },
}));

import { preferenceKeys, useDismissPlanOffer } from "./hooks.js";

type Options = { mutationFn: () => Promise<UserPreferences>; onMutate: () => Promise<void>; onSuccess: (p: UserPreferences) => void; onError: () => void };
const PREFS: UserPreferences = { tourCompletedAt: "2026-11-01T09:00:00.000Z", shareUsageData: false, planOfferDismissedAt: null };

beforeEach(() => {
  h.client = new QueryClient();
  h.patches.length = 0;
});

describe("useDismissPlanOffer", () => {
  it("PATCHes planOfferDismissed: true, nothing else", async () => {
    const options = useDismissPlanOffer() as unknown as Options;
    await options.mutationFn();
    expect(h.patches).toEqual([["/api/preferences", { planOfferDismissed: true }]]);
  });

  it("hides at once: the cache reads dismissed before the server answers, the rest untouched; then holds the server's stamp", async () => {
    h.client.setQueryData(preferenceKeys.all(), PREFS);
    const options = useDismissPlanOffer() as unknown as Options;
    await options.onMutate();
    const optimistic = h.client.getQueryData<UserPreferences>(preferenceKeys.all())!;
    expect(optimistic.planOfferDismissedAt).not.toBeNull();
    expect({ ...optimistic, planOfferDismissedAt: null }).toEqual(PREFS);
    options.onSuccess({ ...PREFS, planOfferDismissedAt: "2026-11-18T09:00:00.000Z" });
    expect(h.client.getQueryData<UserPreferences>(preferenceKeys.all())!.planOfferDismissedAt).toBe("2026-11-18T09:00:00.000Z");
  });

  it("keeps an earlier stamp, leaves an unloaded cache alone, and a failure rolls nothing back (the tour's rule)", async () => {
    h.client.setQueryData(preferenceKeys.all(), { ...PREFS, planOfferDismissedAt: "2026-11-01T00:00:00.000Z" });
    const options = useDismissPlanOffer() as unknown as Options;
    await options.onMutate();
    options.onError();
    expect(h.client.getQueryData<UserPreferences>(preferenceKeys.all())!.planOfferDismissedAt).toBe("2026-11-01T00:00:00.000Z");
    h.client = new QueryClient();
    await (useDismissPlanOffer() as unknown as Options).onMutate();
    expect(h.client.getQueryData(preferenceKeys.all())).toBeUndefined();
  });
});
