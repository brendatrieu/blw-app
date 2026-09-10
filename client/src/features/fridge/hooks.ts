import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateFridgeItemInput,
  MealsResponse,
  FridgeItem,
  FridgeResponse,
  FridgeStatus,
  FridgeView,
  ServeFridgeItemInput,
  UpdateFridgeItemInput,
} from "@blw/shared";
import { createFridgeItem, fetchFridge, serveFridgeItem, updateFridgeItem } from "./api.js";
import { fridgeItemTitle } from "./format.js";
import { useCelebration } from "../../components/ui/Celebration.js";
import { celebrateForNewMeal, snapshotMealCelebrationContext, trackingKeys } from "../tracking/hooks.js";

export const fridgeKeys = {
  list: (view: FridgeView) => ["fridge", view] as const,
};

export function useFridgeItems(view: FridgeView) {
  return useQuery({
    queryKey: fridgeKeys.list(view),
    queryFn: () => fetchFridge(view),
    staleTime: 15_000,
  });
}

export function useCreateFridgeItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFridgeItemInput) => createFridgeItem(input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["fridge"] });
    },
  });
}

/**
 * A status/location/date/quantity edit moves an item between the active and
 * history caches (or reorders it within one), so every cached view is
 * snapshotted up front and rolled back together on failure rather than
 * patched view-by-view.
 */
export function useUpdateFridgeItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateFridgeItemInput }) => updateFridgeItem(id, input),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["fridge"] });
      const snapshots = queryClient.getQueriesData<FridgeResponse>({ queryKey: ["fridge"] });
      return { snapshots, id };
    },
    onError: (_error, _variables, context) => {
      context?.snapshots.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },
    onSuccess: (updated: FridgeItem) => {
      // Drop the item from every cached view, then let the settled
      // invalidation below re-fetch it into whichever view it now belongs
      // in — cheaper than reasoning about active/history membership here.
      const snapshots = queryClient.getQueriesData<FridgeResponse>({ queryKey: ["fridge"] });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        queryClient.setQueryData(key, {
          items: data.items.map((item) => (item.id === updated.id ? updated : item)),
        });
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["fridge"] });
    },
  });
}

/**
 * Serving a fridge item creates a meal in the same stroke, so it drives the
 * exact same celebration moments as logging one directly — see
 * `celebrateForNewMeal` in the tracking feature, which this mirrors rather
 * than duplicates (never both this AND `useCreateMeal` firing for the same
 * action; a serve never goes through `useCreateMeal`).
 *
 * Both segments of the fridge cache are invalidated on settle: a tracked
 * item that hits 0 servings flips to "finished" server-side and disappears
 * from Active into History in the same response, so both views need a
 * refetch regardless of which one the card was rendered in.
 */
export function useFridgeServe(babyId: string | undefined) {
  const queryClient = useQueryClient();
  const { celebrate } = useCelebration();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ServeFridgeItemInput }) => serveFridgeItem(id, input),
    onMutate: () => snapshotMealCelebrationContext(queryClient, babyId),
    onSuccess: ({ meal }, _variables, context) => {
      if (!babyId) return;
      const snapshots = queryClient.getQueriesData<MealsResponse>({ queryKey: trackingKeys.meals(babyId) });
      for (const [key, data] of snapshots) {
        if (data) queryClient.setQueryData(key, { items: [meal, ...data.items] });
      }
      celebrateForNewMeal(babyId, context, celebrate);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["fridge"] });
      if (!babyId) return;
      void queryClient.invalidateQueries({ queryKey: trackingKeys.meals(babyId) });
      void queryClient.invalidateQueries({ queryKey: trackingKeys.allergenProgress(babyId) });
    },
  });
}

const UNDO_WINDOW_MS = 6_000;

export interface FridgeStatusChange {
  id: string;
  title: string;
  from: FridgeStatus;
  to: FridgeStatus;
}

/**
 * Banner copy for a just-announced status change — pure so the
 * "Marked finished/discarded: <title>" wording is unit-testable without
 * rendering anything.
 */
export function fridgeStatusChangeLabel(change: FridgeStatusChange): string {
  const verb = change.to === "finished" ? "Marked finished" : "Marked discarded";
  return `${verb}: ${change.title}`;
}

/**
 * Shared status-change + 6s undo mechanism behind the fridge Remove/Restore
 * actions (item 147) — originally FridgePage-only; FridgeDetailPage now uses
 * the exact same hook so the undo UX never forks between the two surfaces.
 *
 * `setStatus(item, status, announce)` mirrors `FridgePage`'s original
 * behavior: `announce` decides whether the change gets an undo banner
 * (Remove does, Restore doesn't, on both pages — undoing a Restore is just
 * another Remove tap away, so it never needed one). `undo()` reverts the
 * most recently announced change within the window; a change no longer
 * "recent" (window elapsed) is simply not undoable, same as before.
 */
export function useFridgeStatusChange() {
  const [recentChange, setRecentChange] = useState<FridgeStatusChange | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>();
  const updateItem = useUpdateFridgeItem();

  useEffect(() => {
    return () => clearTimeout(undoTimer.current);
  }, []);

  function setStatus(item: FridgeItem, status: FridgeStatus, announce: boolean) {
    updateItem.mutate(
      { id: item.id, input: { status } },
      {
        onSuccess: (updated) => {
          if (!announce) return;
          clearTimeout(undoTimer.current);
          setRecentChange({ id: updated.id, title: fridgeItemTitle(updated), from: item.status, to: status });
          undoTimer.current = setTimeout(() => setRecentChange(null), UNDO_WINDOW_MS);
        },
      },
    );
  }

  function undo() {
    if (!recentChange) return;
    updateItem.mutate({ id: recentChange.id, input: { status: recentChange.from } });
    clearTimeout(undoTimer.current);
    setRecentChange(null);
  }

  return { recentChange, setStatus, undo, isPending: updateItem.isPending };
}
