import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Baby, CreateBabyInput, UpdateBabyInput } from "@blw/shared";
import {
  authConfigKey,
  babyKeys,
  createBaby,
  deleteBaby,
  fetchAuthConfig,
  fetchBabies,
  updateBaby,
} from "./api.js";

export function useBabies(includeArchived = false) {
  return useQuery({
    queryKey: babyKeys.list(includeArchived),
    queryFn: () => fetchBabies(includeArchived),
    staleTime: 30_000,
  });
}

export function useAuthConfig() {
  return useQuery({
    queryKey: authConfigKey,
    queryFn: fetchAuthConfig,
    // The server's OAuth configuration cannot change without a restart.
    staleTime: Infinity,
    retry: false,
  });
}

/**
 * Snapshots every cached baby list, applies `patch` to each, and returns a
 * rollback. Both list variants (with and without archived rows) are cached
 * separately, so an optimistic edit has to touch all of them or the settings
 * page and the baby switcher disagree until the refetch lands.
 */
function patchCachedLists(
  queryClient: QueryClient,
  patch: (rows: Baby[]) => Baby[],
): () => void {
  const snapshots = queryClient.getQueriesData<Baby[]>({ queryKey: babyKeys.all });
  for (const [key, rows] of snapshots) {
    if (rows) queryClient.setQueryData<Baby[]>(key, patch(rows));
  }
  return () => {
    for (const [key, rows] of snapshots) {
      queryClient.setQueryData<Baby[]>(key, rows);
    }
  };
}

export function useCreateBaby() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBabyInput) => createBaby(input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: babyKeys.all }),
  });
}

export function useUpdateBaby() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateBabyInput }) => updateBaby(id, input),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: babyKeys.all });
      const rollback = patchCachedLists(queryClient, (rows) =>
        rows.map((row) =>
          row.id === id
            ? {
                ...row,
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.birthDate !== undefined ? { birthDate: input.birthDate } : {}),
                ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
                ...(input.archived !== undefined ? { archived: input.archived } : {}),
              }
            : row,
        ),
      );
      return { rollback };
    },
    onError: (_error, _variables, context) => {
      context?.rollback();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: babyKeys.all }),
  });
}

export function useDeleteBaby() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBaby(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: babyKeys.all });
      const rollback = patchCachedLists(queryClient, (rows) => rows.filter((row) => row.id !== id));
      return { rollback };
    },
    onError: (_error, _variables, context) => {
      context?.rollback();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: babyKeys.all }),
  });
}
