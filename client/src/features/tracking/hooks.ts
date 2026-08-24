import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateServeLogInput, FavoriteItem, FavoritesResponse, ServeLogItem, ServeLogsResponse } from "@blw/shared";
import {
  createServeLog,
  deleteFavorite,
  deleteServeLog,
  fetchAllergenProgress,
  fetchFavorites,
  fetchServeLogs,
  putFavorite,
  type ServeLogsQuery,
} from "./api.js";

export const trackingKeys = {
  serveLogs: (babyId: string) => ["serve-logs", babyId] as const,
  allergenProgress: (babyId: string) => ["allergen-progress", babyId] as const,
  favorites: ["favorites"] as const,
};

export function useServeLogs(babyId: string | undefined, query: ServeLogsQuery = {}) {
  return useQuery({
    queryKey: [...trackingKeys.serveLogs(babyId ?? ""), query],
    queryFn: () => fetchServeLogs(babyId as string, query),
    enabled: Boolean(babyId),
    staleTime: 15_000,
  });
}

export function useAllergenProgress(babyId: string | undefined) {
  return useQuery({
    queryKey: trackingKeys.allergenProgress(babyId ?? ""),
    queryFn: () => fetchAllergenProgress(babyId as string),
    enabled: Boolean(babyId),
    staleTime: 15_000,
  });
}

export function useFavorites() {
  return useQuery({
    queryKey: trackingKeys.favorites,
    queryFn: fetchFavorites,
    staleTime: 30_000,
  });
}

/** Whether a recipe is currently favorited, derived from the favorites list
 * already cached for the page (no extra request per recipe). */
export function useIsFavorited(recipeId: string | undefined): boolean {
  const { data } = useFavorites();
  return Boolean(recipeId && data?.items.some((item) => item.recipeId === recipeId));
}

export function useCreateServeLog(babyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateServeLogInput) => {
      if (!babyId) throw new Error("useCreateServeLog called with no active baby");
      return createServeLog(babyId, input);
    },
    onSuccess: (created) => {
      if (!babyId) return;
      const snapshots = queryClient.getQueriesData<ServeLogsResponse>({ queryKey: trackingKeys.serveLogs(babyId) });
      for (const [key, data] of snapshots) {
        if (data) queryClient.setQueryData(key, { items: [created, ...data.items] });
      }
    },
    onSettled: () => {
      if (!babyId) return;
      void queryClient.invalidateQueries({ queryKey: trackingKeys.serveLogs(babyId) });
      void queryClient.invalidateQueries({ queryKey: trackingKeys.allergenProgress(babyId) });
    },
  });
}

export function useDeleteServeLog(babyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteServeLog(id),
    onMutate: async (id) => {
      if (!babyId) return undefined;
      await queryClient.cancelQueries({ queryKey: trackingKeys.serveLogs(babyId) });
      const snapshots = queryClient.getQueriesData<ServeLogsResponse>({ queryKey: trackingKeys.serveLogs(babyId) });
      for (const [key, data] of snapshots) {
        if (data) queryClient.setQueryData(key, { items: data.items.filter((item: ServeLogItem) => item.id !== id) });
      }
      return { snapshots };
    },
    onError: (_error, _id, context) => {
      context?.snapshots.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },
    onSettled: () => {
      if (!babyId) return;
      void queryClient.invalidateQueries({ queryKey: trackingKeys.serveLogs(babyId) });
      void queryClient.invalidateQueries({ queryKey: trackingKeys.allergenProgress(babyId) });
    },
  });
}

export interface FavoriteToggleTarget {
  recipeId: string;
  title: string;
  minAgeMonths: number;
  ironFocus: boolean;
  allergens: string[];
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ target, favorited }: { target: FavoriteToggleTarget; favorited: boolean }) =>
      favorited ? deleteFavorite(target.recipeId) : putFavorite(target.recipeId),
    onMutate: async ({ target, favorited }) => {
      await queryClient.cancelQueries({ queryKey: trackingKeys.favorites });
      const previous = queryClient.getQueryData<FavoritesResponse>(trackingKeys.favorites);
      queryClient.setQueryData<FavoritesResponse>(trackingKeys.favorites, (current) => {
        const items = current?.items ?? [];
        if (favorited) {
          return { items: items.filter((item) => item.recipeId !== target.recipeId) };
        }
        const added: FavoriteItem = {
          recipeId: target.recipeId,
          title: target.title,
          minAgeMonths: target.minAgeMonths,
          ironFocus: target.ironFocus,
          allergens: target.allergens,
        };
        return { items: [added, ...items] };
      });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(trackingKeys.favorites, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: trackingKeys.favorites });
    },
  });
}
