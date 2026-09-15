import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../api.js";
import { catalogKeys } from "../../features/catalog/hooks.js";
import {
  aiKeySaveOutcome,
  ageDaysBucket,
  attemptBucket,
  backdatedBucket,
  daysBetween,
  errorMessage,
  errorStatus,
  failureKind,
  foodCountBucket,
  freshnessAtChange,
  isBackdatedMark,
  isChunkLoadError,
  isOffline,
  lookupRecipeKind,
  mealViaFromLocation,
  readLocation,
  recipeKindFromRecipe,
  resultsBucket,
  statusBucket,
  storageAddViaFromLocation,
  storageClosedVia,
  storageSourceFromInput,
} from "./properties.js";
import { recordRouteChange, resetUsage } from "./track.js";

afterEach(() => {
  resetUsage();
  vi.unstubAllGlobals();
});

describe("buckets — a count is never sent as a number", () => {
  it("foodCountBucket", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 12].map(foodCountBucket)).toEqual(["1", "1", "2", "3", "4-5", "4-5", "6+", "6+"]);
  });

  it("resultsBucket", () => {
    expect([0, 1, 5, 6, 20, 21, 50, 51].map(resultsBucket)).toEqual([
      "0",
      "1-5",
      "1-5",
      "6-20",
      "6-20",
      "21-50",
      "21-50",
      "50+",
    ]);
  });

  it("ageDaysBucket", () => {
    expect([0, 0.5, 1, 2, 3, 4, 7, 8, 14, 15, 400].map(ageDaysBucket)).toEqual([
      "0",
      "0",
      "1",
      "2-3",
      "2-3",
      "4-7",
      "4-7",
      "8-14",
      "8-14",
      "15+",
      "15+",
    ]);
  });

  it("attemptBucket", () => {
    expect([0, 1, 2, 3, 9].map(attemptBucket)).toEqual(["1", "1", "2", "3+", "3+"]);
  });

  it("backdatedBucket, against the moment of saving", () => {
    const now = new Date("2026-09-13T12:00:00.000Z");
    const ago = (ms: number) => backdatedBucket(new Date(now.getTime() - ms), now);
    expect(ago(0)).toBe("now");
    expect(ago(30_000)).toBe("now");
    expect(ago(90_000)).toBe("<1h");
    expect(ago(3 * 60 * 60_000)).toBe("<1d");
    expect(ago(3 * 24 * 60 * 60_000)).toBe("1d+");
    // A clock a little ahead of ours is "now", not a negative age.
    expect(backdatedBucket(new Date(now.getTime() + 60_000), now)).toBe("now");
    expect(backdatedBucket("not a date", now)).toBe("now");
  });

  it("isBackdatedMark asks whether the chosen instant is more than an hour before the tap", () => {
    const now = new Date("2026-09-13T12:00:00.000Z");
    const ago = (ms: number) => isBackdatedMark(new Date(now.getTime() - ms), now);
    // An untouched "When" is the current minute.
    expect(ago(0)).toBe(false);
    expect(ago(30_000)).toBe(false);
    expect(ago(59 * 60_000)).toBe(false);
    // The boundary itself is still "now" — the slack absorbs a device an
    // hour of DST out of step, not a parent making a claim about the past.
    expect(ago(60 * 60_000)).toBe(false);
    expect(ago(60 * 60_000 + 1)).toBe(true);
    // Deliberately NOT `backdatedBucket`'s 1d+ edge: a parent who scrolled
    // back to this morning has used the picker just as much as one who
    // scrolled back to March.
    expect(ago(3 * 60 * 60_000)).toBe(true);
    expect(backdatedBucket(new Date(now.getTime() - 3 * 60 * 60_000), now)).toBe("<1d");
    expect(ago(90 * 24 * 60 * 60_000)).toBe(true);
    // A clock a little ahead of ours is not a backdate, and neither is junk.
    expect(isBackdatedMark(new Date(now.getTime() + 60 * 60_000), now)).toBe(false);
    expect(isBackdatedMark("not a date", now)).toBe(false);
  });

  it("statusBucket keeps the codes we act on and collapses the rest", () => {
    expect(statusBucket(404)).toBe("404");
    expect(statusBucket(500)).toBe("500");
    expect(statusBucket(418)).toBe("4xx");
    expect(statusBucket(507)).toBe("5xx");
    expect(statusBucket(undefined)).toBe("none");
    expect(statusBucket(200)).toBe("none");
  });

  it("daysBetween counts whole days and never goes negative", () => {
    const to = new Date("2026-09-13T12:00:00.000Z");
    expect(daysBetween("2026-09-13T11:00:00.000Z", to)).toBe(0);
    expect(daysBetween("2026-09-10T12:00:00.000Z", to)).toBe(3);
    expect(daysBetween("2026-09-20T12:00:00.000Z", to)).toBe(0);
  });
});

describe("via — derived from the route, never wired to a button", () => {
  it("reads the log form's entry point off /log-meal's query params", () => {
    expect(mealViaFromLocation({ pathname: "/log-meal", search: "" })).toBe("log_page");
    expect(mealViaFromLocation({ pathname: "/log-meal", search: "?food=abc" })).toBe("food_page");
    expect(mealViaFromLocation({ pathname: "/log-meal", search: "?recipe=abc" })).toBe("recipe_page");
    // Editing (`?edit=`) is still the log page.
    expect(mealViaFromLocation({ pathname: "/log-meal", search: "?edit=abc" })).toBe("log_page");
    expect(mealViaFromLocation({ pathname: "/", search: "" })).toBe("log_page");
  });

  it("reads the storage form's entry point the same way, including Home vs the Storage tab", () => {
    expect(storageAddViaFromLocation({ pathname: "/storage/add", search: "?food=abc" })).toBe("food_page");
    expect(storageAddViaFromLocation({ pathname: "/storage/add", search: "?recipe=abc" })).toBe("recipe_page");
    // Both Home and the Storage tab link to a BARE /storage/add, so the
    // route the parent came from is what separates them.
    recordRouteChange("/storage");
    expect(storageAddViaFromLocation({ pathname: "/storage/add", search: "" })).toBe("storage_page");
    recordRouteChange("/");
    expect(storageAddViaFromLocation({ pathname: "/storage/add", search: "" })).toBe("home");
  });

  it("calls a leftovers save from the log form what it is", () => {
    expect(storageAddViaFromLocation({ pathname: "/log-meal", search: "" })).toBe("log_leftovers");
  });

  it("never reads the VALUE of a query param, only that it is there", () => {
    const via = mealViaFromLocation({ pathname: "/log-meal", search: "?food=sweet-potato-secret-id" });
    expect(via).toBe("food_page");
    expect(JSON.stringify(via)).not.toContain("secret");
  });

  it("reads restore vs remove off the status being written", () => {
    expect(storageClosedVia("active")).toBe("restore");
    expect(storageClosedVia("finished")).toBe("remove");
    expect(storageClosedVia("discarded")).toBe("remove");
  });

  it("reads a container's source off the payload's shape, never its text", () => {
    expect(storageSourceFromInput({ recipeId: "r", foodIds: ["f"] })).toBe("recipe");
    expect(storageSourceFromInput({ foodIds: ["f"] })).toBe("food");
    expect(storageSourceFromInput({ foodIds: [] })).toBe("label");
    expect(storageSourceFromInput({})).toBe("label");
  });

  it("reads freshness off the flags the API already sends when there is no best-by date", () => {
    const windowItem = { bestBy: null, expiresAt: "2026-09-20T10:00:00.000Z" };
    expect(freshnessAtChange({ ...windowItem, expired: true, useSoon: true })).toBe("expired");
    expect(freshnessAtChange({ ...windowItem, expired: false, useSoon: true })).toBe("use_soon");
    expect(freshnessAtChange({ ...windowItem, expired: false, useSoon: false })).toBe("fresh");
  });

  // Item 333: the chip the parent was actually looking at when they hit
  // Remove is the one the event has to report, and a best-by date beats the
  // server's window-derived flags on that chip.
  it("prefers a best-by date over the flags, in both directions", () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const ymd = (offsetDays: number) => {
      const d = new Date(Date.now() + offsetDays * dayMs);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const flaggedFresh = { expired: false, useSoon: false, expiresAt: new Date(Date.now() + 5 * dayMs).toISOString() };
    const flaggedExpired = { expired: true, useSoon: true, expiresAt: new Date(Date.now() - dayMs).toISOString() };

    expect(freshnessAtChange({ ...flaggedFresh, bestBy: ymd(-1) })).toBe("expired");
    expect(freshnessAtChange({ ...flaggedFresh, bestBy: ymd(0) })).toBe("use_soon");
    expect(freshnessAtChange({ ...flaggedExpired, bestBy: ymd(7) })).toBe("fresh");
  });

  it("falls back to a blank location outside a browser rather than throwing", () => {
    expect(readLocation()).toEqual({ pathname: "", search: "" });
  });
});

describe("recipe_kind", () => {
  it("calls a one-ingredient catalog recipe a basic, the same rule the badge uses", () => {
    expect(recipeKindFromRecipe({ isCustom: false, ingredientCount: 1 })).toBe("basic");
    expect(recipeKindFromRecipe({ isCustom: false, ingredientCount: 4 })).toBe("catalog");
    // A parent's own one-ingredient recipe is theirs first.
    expect(recipeKindFromRecipe({ isCustom: true, ingredientCount: 1 })).toBe("custom");
  });

  it("answers from the detail cache the log form already filled", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(catalogKeys.recipe("r1"), { isCustom: true, ingredients: [{}, {}] });
    expect(lookupRecipeKind(queryClient, "r1")).toBe("custom");
  });

  it("falls back to any cached recipes list", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(catalogKeys.recipesList({ scope: "all" }), {
      recipes: [{ id: "r2", isCustom: false, ingredientNames: ["Oats"] }],
    });
    expect(lookupRecipeKind(queryClient, "r2")).toBe("basic");
  });

  it("is 'none' without a recipe, and 'catalog' for one nothing has cached", () => {
    const queryClient = new QueryClient();
    expect(lookupRecipeKind(queryClient, null)).toBe("none");
    expect(lookupRecipeKind(queryClient, undefined)).toBe("none");
    expect(lookupRecipeKind(queryClient, "unknown")).toBe("catalog");
  });

  it("pins the restated query keys against the catalog's own", () => {
    // properties.ts restates these rather than importing `catalogKeys` (that
    // module imports the tracking hooks this one is used from). If they ever
    // drift, every recipe_kind silently becomes "catalog".
    const queryClient = new QueryClient();
    queryClient.setQueryData(catalogKeys.recipe("pin"), { isCustom: false, ingredients: [{}] });
    expect(lookupRecipeKind(queryClient, "pin")).toBe("basic");
    expect(catalogKeys.recipe("pin")).toEqual(["recipe", "pin"]);
    expect(catalogKeys.recipes).toEqual(["recipes"]);
  });
});

describe("failures", () => {
  it("separates 'the network was gone' from '4xx' from 'we broke'", () => {
    expect(failureKind(new ApiError(500, "internal_error"))).toBe("5xx");
    expect(failureKind(new ApiError(409, "conflict"))).toBe("4xx");
    expect(failureKind(new TypeError("Failed to fetch"))).toBe("network");
    expect(failureKind(undefined)).toBe("network");
  });

  it("reads a status off an ApiError and nothing else", () => {
    expect(errorStatus(new ApiError(404, "not_found"))).toBe(404);
    expect(errorStatus(new Error("boom"))).toBeUndefined();
    expect(errorStatus({ status: "500" })).toBeUndefined();
  });

  it("tells a stale-chunk error apart from a real crash — different fix, different bucket", () => {
    expect(isChunkLoadError("TypeError: Failed to fetch dynamically imported module: /assets/x.js")).toBe(true);
    expect(isChunkLoadError("ChunkLoadError: Loading chunk 42 failed")).toBe(true);
    expect(isChunkLoadError("TypeError: undefined is not a function")).toBe(false);
  });

  it("reads a message only to classify it — the message itself is never a prop", () => {
    expect(errorMessage(new TypeError("nope"))).toBe("TypeError: nope");
    expect(errorMessage("plain")).toBe("plain");
    expect(errorMessage({ secret: "baby name" })).toBe("");
  });

  it("maps the AI key server's machine codes onto the closed outcome set", () => {
    expect(aiKeySaveOutcome(new Error("invalid_key"))).toBe("invalid_key");
    expect(aiKeySaveOutcome(new Error("validation_unavailable"))).toBe("validation_unavailable");
    expect(aiKeySaveOutcome(new Error("rate_limited"))).toBe("rate_limited");
    // An unrecognised code must never travel as itself.
    expect(aiKeySaveOutcome(new Error("sk-ant-leaked-key"))).toBe("network_error");
    expect(aiKeySaveOutcome(undefined)).toBe("network_error");
  });

  it("reads offline off navigator, and assumes online where there is no navigator", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isOffline()).toBe(true);
    vi.stubGlobal("navigator", { onLine: true });
    expect(isOffline()).toBe(false);
  });
});
