import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateStorageItemInput,
  MealsResponse,
  StorageItem,
  StorageResponse,
  StorageStatus,
  StorageView,
  ServeStorageItemInput,
  UpdateStorageItemInput,
} from "@blw/shared";
import { createStorageItem, fetchStorage, serveStorageItem, updateStorageItem } from "./api.js";
import { storageItemTitle } from "./format.js";
import { sortActiveByFreshness } from "./freshness.js";
import { useCelebration } from "../../components/ui/Celebration.js";
import { celebrateForNewMeal, snapshotMealCelebrationContext, trackingKeys } from "../tracking/hooks.js";
import { track } from "../../lib/usage/track.js";
import {
  ageDaysBucket,
  daysBetween,
  failureKind,
  foodCountBucket,
  freshnessAtChange,
  isOffline,
  lookupRecipeKind,
  storageAddViaFromLocation,
  storageClosedVia,
  storageSourceFromInput,
  type StorageClosedVia,
} from "../../lib/usage/properties.js";

export const storageKeys = {
  list: (view: StorageView) => ["storage", view] as const,
};

/**
 * The active view's order, applied at `select` so EVERY reader gets it: the
 * server sorts by its own derived `expiresAt`, which a best-by date now
 * overrides (item 333), so a container best-by tomorrow could otherwise sit
 * below one the window says is good for three more days. Module-level — a
 * `select` defined inline would be a new function on every render and
 * re-sort the cache each time.
 */
function selectActiveByFreshness(data: StorageResponse): StorageResponse {
  return { items: sortActiveByFreshness(data.items) };
}

export function useStorageItems(view: StorageView) {
  return useQuery({
    queryKey: storageKeys.list(view),
    queryFn: () => fetchStorage(view),
    staleTime: 15_000,
    // History is a record of what happened, not a queue to work through: it
    // keeps the server's order (most recently changed first).
    select: view === "active" ? selectActiveByFreshness : undefined,
  });
}

export function useCreateStorageItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStorageItemInput) => createStorageItem(input),
    onSuccess: (_created, input) => {
      // `via` comes from the route the form is on (and, for the two bare
      // `/storage/add` entry points, from the route it was reached from), so
      // a new "Add to storage" button anywhere is measured the day it links
      // here. `source` comes from the payload's own shape — a label-only
      // container is the one with neither a food nor a recipe, and its text
      // is never read.
      track("storage_item_added", {
        location: input.location,
        source: storageSourceFromInput(input),
        via: storageAddViaFromLocation(),
        has_servings: input.servingsTotal !== undefined && input.servingsTotal !== null,
        has_best_by: Boolean(input.bestBy),
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["storage"] });
    },
  });
}

/**
 * A status/location/date/quantity edit moves an item between the active and
 * history caches (or reorders it within one), so every cached view is
 * snapshotted up front and rolled back together on failure rather than
 * patched view-by-view.
 */
export function useUpdateStorageItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStorageItemInput }) => updateStorageItem(id, input),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["storage"] });
      const snapshots = queryClient.getQueriesData<StorageResponse>({ queryKey: ["storage"] });
      return { snapshots, id };
    },
    onError: (_error, _variables, context) => {
      context?.snapshots.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },
    onSuccess: (updated: StorageItem) => {
      // Drop the item from every cached view, then let the settled
      // invalidation below re-fetch it into whichever view it now belongs
      // in — cheaper than reasoning about active/history membership here.
      const snapshots = queryClient.getQueriesData<StorageResponse>({ queryKey: ["storage"] });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        queryClient.setQueryData(key, {
          items: data.items.map((item) => (item.id === updated.id ? updated : item)),
        });
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["storage"] });
    },
  });
}

/**
 * Serving a storage item creates a meal in the same stroke, so it drives the
 * exact same celebration moments as logging one directly — see
 * `celebrateForNewMeal` in the tracking feature, which this mirrors rather
 * than duplicates (never both this AND `useCreateMeal` firing for the same
 * action; a serve never goes through `useCreateMeal`).
 *
 * Both segments of the storage cache are invalidated on settle: a tracked
 * item that hits 0 servings flips to "finished" server-side and disappears
 * from Active into History in the same response, so both views need a
 * refetch regardless of which one the card was rendered in.
 */
export function useStorageServe(babyId: string | undefined) {
  const queryClient = useQueryClient();
  const { celebrate } = useCelebration();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ServeStorageItemInput }) => serveStorageItem(id, input),
    onMutate: () => snapshotMealCelebrationContext(queryClient, babyId),
    onSuccess: ({ meal, item }, _variables, context) => {
      // A serve IS a logged meal, so it sends the same event the log form
      // does — same props, `from_storage` true, `via: storage_serve`.
      track("meal_logged", {
        food_count: foodCountBucket(meal.foods.length),
        recipe_kind: lookupRecipeKind(queryClient, meal.recipeId),
        from_storage: true,
        via: "storage_serve",
        leftovers_saved: false,
        has_notes: Boolean(meal.notes || meal.reactionNote),
        is_first_meal: context?.hadAnyMeals !== true,
        // A serve is always "now" — the sheet has no when field.
        backdated: "now",
        offline: isOffline(),
      });
      // A tracked container that hit zero servings flips to `finished`
      // server-side in this same response. That is a close, and the serve
      // path is the only way it happens without anyone pressing Remove.
      if (item.status !== "active") {
        track("storage_item_closed", {
          to: item.status,
          via: "serve_depleted",
          freshness_at_change: freshnessAtChange(item),
          age_days_bucket: ageDaysBucket(daysBetween(item.preparedAt)),
        });
      }
      if (!babyId) return;
      const snapshots = queryClient.getQueriesData<MealsResponse>({ queryKey: trackingKeys.meals(babyId) });
      for (const [key, data] of snapshots) {
        if (data) queryClient.setQueryData(key, { items: [meal, ...data.items] });
      }
      celebrateForNewMeal(babyId, context, celebrate);
    },
    onError: (error) => {
      track("meal_save_failed", { via: "storage_serve", kind: failureKind(error), offline: isOffline() });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["storage"] });
      if (!babyId) return;
      void queryClient.invalidateQueries({ queryKey: trackingKeys.meals(babyId) });
      void queryClient.invalidateQueries({ queryKey: trackingKeys.allergenProgress(babyId) });
    },
  });
}

const UNDO_WINDOW_MS = 6_000;

/**
 * The `storage_item_closed` event for one status write.
 *
 * Read entirely off the row the server just returned: the status it now
 * holds, how fresh it was, and how long it had been open — all buckets. The
 * container's label, food and recipe never come near it, which is the whole
 * reason serve-through can be measured at all.
 */
function trackStorageStatusChange(item: StorageItem, via: StorageClosedVia): void {
  track("storage_item_closed", {
    to: item.status,
    via,
    freshness_at_change: freshnessAtChange(item),
    age_days_bucket: ageDaysBucket(daysBetween(item.preparedAt)),
  });
}

export interface StorageStatusChange {
  id: string;
  title: string;
  from: StorageStatus;
  to: StorageStatus;
}

/**
 * Banner copy for a just-announced status change — pure so the
 * "Marked finished/discarded: <title>" wording is unit-testable without
 * rendering anything.
 */
export function storageStatusChangeLabel(change: StorageStatusChange): string {
  const verb = change.to === "finished" ? "Marked finished" : "Marked discarded";
  return `${verb}: ${change.title}`;
}

/**
 * Shared status-change + 6s undo mechanism behind the storage Remove/Restore
 * actions (item 147) — originally StoragePage-only; StorageDetailPage now uses
 * the exact same hook so the undo UX never forks between the two surfaces.
 *
 * `setStatus(item, status, announce)` mirrors `StoragePage`'s original
 * behavior: `announce` decides whether the change gets an undo banner
 * (Remove does, Restore doesn't, on both pages — undoing a Restore is just
 * another Remove tap away, so it never needed one). `undo()` reverts the
 * most recently announced change within the window; a change no longer
 * "recent" (window elapsed) is simply not undoable, same as before.
 */
export function useStorageStatusChange() {
  const [recentChange, setRecentChange] = useState<StorageStatusChange | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>();
  const updateItem = useUpdateStorageItem();

  useEffect(() => {
    return () => clearTimeout(undoTimer.current);
  }, []);

  function setStatus(item: StorageItem, status: StorageStatus, announce: boolean) {
    updateItem.mutate(
      { id: item.id, input: { status } },
      {
        onSuccess: (updated) => {
          // Every status change is a `storage_item_closed`, including a
          // restore — `to: "active"` is what a restore looks like, and
          // "closed" is the event's name, not its only meaning. `via` is
          // read off the status being written rather than off the button
          // that wrote it.
          trackStorageStatusChange(updated, storageClosedVia(status));
          if (!announce) return;
          clearTimeout(undoTimer.current);
          setRecentChange({ id: updated.id, title: storageItemTitle(updated), from: item.status, to: status });
          undoTimer.current = setTimeout(() => setRecentChange(null), UNDO_WINDOW_MS);
        },
      },
    );
  }

  function undo() {
    if (!recentChange) return;
    updateItem.mutate(
      { id: recentChange.id, input: { status: recentChange.from } },
      { onSuccess: (updated) => trackStorageStatusChange(updated, "undo") },
    );
    clearTimeout(undoTimer.current);
    setRecentChange(null);
  }

  return { recentChange, setStatus, undo, isPending: updateItem.isPending };
}
