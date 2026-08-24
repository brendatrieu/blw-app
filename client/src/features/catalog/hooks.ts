import { useQuery } from "@tanstack/react-query";
import type { FoodsQuery } from "@blw/shared";
import { fetchFood, fetchFoods, fetchRecipe } from "./api.js";

export function useFoods(filters: FoodsQuery = {}) {
  return useQuery({
    queryKey: ["foods", filters],
    queryFn: () => fetchFoods(filters),
    staleTime: 5 * 60 * 1000,
  });
}

export function useFood(slug: string | undefined) {
  return useQuery({
    queryKey: ["food", slug],
    queryFn: () => fetchFood(slug as string),
    enabled: Boolean(slug),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRecipe(id: string | undefined) {
  return useQuery({
    queryKey: ["recipe", id],
    queryFn: () => fetchRecipe(id as string),
    enabled: Boolean(id),
    staleTime: 5 * 60 * 1000,
  });
}
