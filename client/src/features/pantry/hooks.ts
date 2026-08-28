import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreatePantryItemInput,
  MealsResponse,
  PantryItem,
  PantryResponse,
  PantryView,
  ServePantryItemInput,
  UpdatePantryItemInput,
} from "@blw/shared";
import { createPantryItem, fetchPantry, servePantryItem, updatePantryItem } from "./api.js";
import { useCelebration } from "../../components/ui/Celebration.js";
import { celebrateForNewMeal, snapshotMealCelebrationContext, trackingKeys } from "../tracking/hooks.js";

export const pantryKeys = {
  list: (view: PantryView) => ["pantry", view] as const,
};

export function usePantryItems(view: PantryView) {
  return useQuery({
    queryKey: pantryKeys.list(view),
    queryFn: () => fetchPantry(view),
    staleTime: 15_000,
  });
}

export function useCreatePantryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePantryItemInput) => createPantryItem(input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["pantry"] });
    },
  });
}

/**
 * A status/location/date/quantity edit moves an item between the active and
 * history caches (or reorders it within one), so every cached view is
 * snapshotted up front and rolled back together on failure rather than
 * patched view-by-view.
 */
export function useUpdatePantryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePantryItemInput }) => updatePantryItem(id, input),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["pantry"] });
      const snapshots = queryClient.getQueriesData<PantryResponse>({ queryKey: ["pantry"] });
      return { snapshots, id };
    },
    onError: (_error, _variables, context) => {
      context?.snapshots.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },
    onSuccess: (updated: PantryItem) => {
      // Drop the item from every cached view, then let the settled
      // invalidation below re-fetch it into whichever view it now belongs
      // in — cheaper than reasoning about active/history membership here.
      const snapshots = queryClient.getQueriesData<PantryResponse>({ queryKey: ["pantry"] });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        queryClient.setQueryData(key, {
          items: data.items.map((item) => (item.id === updated.id ? updated : item)),
        });
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["pantry"] });
    },
  });
}

/**
 * Serving a pantry item creates a meal in the same stroke, so it drives the
 * exact same celebration moments as logging one directly — see
 * `celebrateForNewMeal` in the tracking feature, which this mirrors rather
 * than duplicates (never both this AND `useCreateMeal` firing for the same
 * action; a serve never goes through `useCreateMeal`).
 *
 * Both segments of the pantry cache are invalidated on settle: a tracked
 * item that hits 0 servings flips to "finished" server-side and disappears
 * from Active into History in the same response, so both views need a
 * refetch regardless of which one the card was rendered in.
 */
export function usePantryServe(babyId: string | undefined) {
  const queryClient = useQueryClient();
  const { celebrate } = useCelebration();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ServePantryItemInput }) => servePantryItem(id, input),
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
      void queryClient.invalidateQueries({ queryKey: ["pantry"] });
      if (!babyId) return;
      void queryClient.invalidateQueries({ queryKey: trackingKeys.meals(babyId) });
      void queryClient.invalidateQueries({ queryKey: trackingKeys.allergenProgress(babyId) });
    },
  });
}
