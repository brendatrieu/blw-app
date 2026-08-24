import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreatePantryItemInput, PantryItem, PantryResponse, PantryView, UpdatePantryItemInput } from "@blw/shared";
import { createPantryItem, fetchPantry, updatePantryItem } from "./api.js";

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
