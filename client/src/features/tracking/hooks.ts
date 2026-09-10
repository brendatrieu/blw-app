import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  AllergenProgressResponse,
  CreateMealInput,
  FavoriteItem,
  FavoritesResponse,
  MealItem,
  MealsResponse,
  UpdateMealInput,
} from "@blw/shared";
import {
  createMeal,
  deleteAllergenOverride,
  deleteFavorite,
  deleteMeal,
  fetchAllergenDetail,
  fetchAllergenProgress,
  fetchFavorites,
  fetchMeals,
  putAllergenOverride,
  putFavorite,
  updateMeal,
  type MealsQuery,
} from "./api.js";
import { useCelebration, type CelebrationOptions } from "../../components/ui/Celebration.js";

export const trackingKeys = {
  meals: (babyId: string) => ["meals", babyId] as const,
  allergenProgress: (babyId: string) => ["allergen-progress", babyId] as const,
  /** Prefix covering every allergen's detail for one baby — invalidating it
   * refreshes whichever detail page happens to be cached, without the caller
   * knowing which slug that is. */
  allergenDetails: (babyId: string) => ["allergen-detail", babyId] as const,
  allergenDetail: (babyId: string, allergenSlug: string) => ["allergen-detail", babyId, allergenSlug] as const,
  favorites: ["favorites"] as const,
};

/** Every query that has to change when this baby's allergen picture does:
 * the ladder AND any cached detail page for it. Used by the override
 * mutations and by every meal mutation (a meal edit can move exposures). */
/** Exported only so a test can pin that BOTH allergen surfaces are invalidated. */
export function invalidateAllergenQueries(queryClient: QueryClient, babyId: string): void {
  void queryClient.invalidateQueries({ queryKey: trackingKeys.allergenProgress(babyId) });
  void queryClient.invalidateQueries({ queryKey: trackingKeys.allergenDetails(babyId) });
}

export function useMeals(babyId: string | undefined, query: MealsQuery = {}) {
  return useQuery({
    queryKey: [...trackingKeys.meals(babyId ?? ""), query],
    queryFn: () => fetchMeals(babyId as string, query),
    enabled: Boolean(babyId),
    staleTime: 15_000,
  });
}

/** One allergen's full story — progress row, the foods carrying it, and this
 * baby's exposure history. Sits alongside `useAllergenProgress`; both are
 * invalidated together by every mutation that can move either. */
export function useAllergenDetail(babyId: string | undefined, allergenSlug: string | undefined) {
  return useQuery({
    queryKey: trackingKeys.allergenDetail(babyId ?? "", allergenSlug ?? ""),
    queryFn: () => fetchAllergenDetail(babyId as string, allergenSlug as string),
    enabled: Boolean(babyId && allergenSlug),
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

/**
 * PUT /api/babies/:babyId/allergens/:key/established — "we already
 * established this before the app" override; see `unionAllergenStatus` in
 * shared/src/tracking.ts for how it's unioned with the derived ladder.
 */
export function useMarkAllergenEstablished(babyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (allergenSlug: string) => {
      if (!babyId) throw new Error("useMarkAllergenEstablished called with no active baby");
      return putAllergenOverride(babyId, allergenSlug);
    },
    onSettled: () => {
      if (!babyId) return;
      invalidateAllergenQueries(queryClient, babyId);
    },
  });
}

/** Undo for `useMarkAllergenEstablished` — DELETE is idempotent too. */
export function useUndoAllergenEstablished(babyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (allergenSlug: string) => {
      if (!babyId) throw new Error("useUndoAllergenEstablished called with no active baby");
      return deleteAllergenOverride(babyId, allergenSlug);
    },
    onSettled: () => {
      if (!babyId) return;
      invalidateAllergenQueries(queryClient, babyId);
    },
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

export interface MealCelebrationContext {
  previousProgress: AllergenProgressResponse | undefined;
  hadAnyMeals: boolean;
}

/**
 * Snapshot taken just before a new meal is created — whether any meals
 * already existed, and each allergen's status — so `celebrateForNewMeal` can
 * later diff a fresh fetch against it and fire at most one celebration.
 * Shared by every mutation that produces a brand-new meal (ordinary logging
 * via `useCreateMeal`, and pantry's `usePantryServe`) so they fire the exact
 * same celebration logic instead of each duplicating it.
 */
export function snapshotMealCelebrationContext(
  queryClient: QueryClient,
  babyId: string | undefined,
): MealCelebrationContext | undefined {
  if (!babyId) return undefined;
  const previousProgress = queryClient.getQueryData<AllergenProgressResponse>(trackingKeys.allergenProgress(babyId));
  const mealSnapshots = queryClient.getQueriesData<MealsResponse>({ queryKey: trackingKeys.meals(babyId) });
  const hadAnyMeals = mealSnapshots.some(([, data]) => (data?.items.length ?? 0) > 0);
  return { previousProgress, hadAnyMeals };
}

/**
 * The app's two celebration moments for a freshly-created meal: the very
 * first meal ever logged ("First food logged!"), or — otherwise — an
 * allergen that crossed into "established" as a result of this meal. Fires
 * at most one, diffing a fresh allergen-progress fetch against the snapshot
 * `snapshotMealCelebrationContext` took just before the mutation.
 */
export function celebrateForNewMeal(
  babyId: string,
  context: MealCelebrationContext | undefined,
  celebrate: (options: CelebrationOptions) => void,
): void {
  if (!context?.hadAnyMeals) {
    celebrate({ title: "First food logged!", emoji: "🎉" });
    return;
  }

  void fetchAllergenProgress(babyId).then((fresh) => {
    const previousStatus = new Map((context.previousProgress?.items ?? []).map((item) => [item.allergenSlug, item.status]));
    const newlyEstablished = fresh.items.find(
      (item) => item.status === "established" && previousStatus.get(item.allergenSlug) !== "established",
    );
    if (newlyEstablished) {
      celebrate({ title: `${newlyEstablished.allergenName} is established!`, emoji: "🌟" });
    }
  });
}

/**
 * Creating a meal also drives the app's celebration moments — see
 * `celebrateForNewMeal` — and never fires on edit/delete.
 */
export function useCreateMeal(babyId: string | undefined) {
  const queryClient = useQueryClient();
  const { celebrate } = useCelebration();
  return useMutation({
    mutationFn: (input: CreateMealInput) => {
      if (!babyId) throw new Error("useCreateMeal called with no active baby");
      return createMeal(babyId, input);
    },
    onMutate: () => snapshotMealCelebrationContext(queryClient, babyId),
    onSuccess: (created, _input, context) => {
      if (!babyId) return;
      const snapshots = queryClient.getQueriesData<MealsResponse>({ queryKey: trackingKeys.meals(babyId) });
      for (const [key, data] of snapshots) {
        if (data) queryClient.setQueryData(key, { items: [created, ...data.items] });
      }
      celebrateForNewMeal(babyId, context, celebrate);
    },
    onSettled: () => {
      if (!babyId) return;
      void queryClient.invalidateQueries({ queryKey: trackingKeys.meals(babyId) });
      invalidateAllergenQueries(queryClient, babyId);
    },
  });
}

/**
 * Editing a meal never fires a celebration (only a fresh log does) but can
 * still change allergen exposure counts (a food swap via `foodIds`), so both
 * the meal list and allergen progress are invalidated on settle.
 */
export function useUpdateMeal(babyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMealInput }) => updateMeal(id, input),
    onSuccess: (updated: MealItem) => {
      if (!babyId) return;
      const snapshots = queryClient.getQueriesData<MealsResponse>({ queryKey: trackingKeys.meals(babyId) });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        queryClient.setQueryData(key, { items: data.items.map((item) => (item.id === updated.id ? updated : item)) });
      }
    },
    onSettled: () => {
      if (!babyId) return;
      void queryClient.invalidateQueries({ queryKey: trackingKeys.meals(babyId) });
      invalidateAllergenQueries(queryClient, babyId);
    },
  });
}

export function useDeleteMeal(babyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMeal(id),
    onMutate: async (id) => {
      if (!babyId) return undefined;
      await queryClient.cancelQueries({ queryKey: trackingKeys.meals(babyId) });
      const snapshots = queryClient.getQueriesData<MealsResponse>({ queryKey: trackingKeys.meals(babyId) });
      for (const [key, data] of snapshots) {
        if (data) queryClient.setQueryData(key, { items: data.items.filter((item: MealItem) => item.id !== id) });
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
      void queryClient.invalidateQueries({ queryKey: trackingKeys.meals(babyId) });
      invalidateAllergenQueries(queryClient, babyId);
    },
  });
}

export interface FavoriteToggleTarget {
  recipeId: string;
  title: string;
  minAgeMonths: number;
  ironFocus: boolean;
  vitaminCHigh: boolean;
  fiberHigh: boolean;
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
          vitaminCHigh: target.vitaminCHigh,
          fiberHigh: target.fiberHigh,
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
