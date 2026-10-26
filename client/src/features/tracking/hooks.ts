import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  AllergenProgressResponse,
  CreatePlateMealInput,
  FavoriteItem,
  FavoritesResponse,
  MealItem,
  MealsResponse,
  RatingHistoryQuery,
  StorageItem,
  UpdatePlateMealInput,
} from "@blw/shared";
import {
  createMeal,
  deleteAllergenOverride,
  deleteFavorite,
  deleteMeal,
  fetchAllergenDetail,
  fetchAllergenProgress,
  fetchFavorites,
  fetchMeal,
  fetchMeals,
  fetchRatingHistory,
  fetchRatings,
  putAllergenOverride,
  putFavorite,
  updateMeal,
  type MealsQuery,
} from "./api.js";
import { useCelebration, type CelebrationOptions } from "../../components/ui/Celebration.js";
import { ApiError } from "../../lib/api.js";
import { track } from "../../lib/usage/track.js";
import {
  ageDaysBucket,
  backdatedBucket,
  daysBetween,
  failureKind,
  foodCountBucket,
  freshnessAtChange,
  isBackdatedMark,
  isOffline,
  mealRecipeKindProps,
  mealViaFromLocation,
} from "../../lib/usage/properties.js";
import { catalogKeys } from "../catalog/hooks.js";
import { containersEmptiedBy, staleLeaveOut } from "../plate/plate.js";

export const trackingKeys = {
  meals: (babyId: string) => ["meals", babyId] as const,
  /** One meal (GET /api/meals/:id). Not under "meals": those caches hold
   * lists, and every meal mutation rewrites them as lists. */
  meal: (id: string) => ["meal", id] as const,
  allergenProgress: (babyId: string) => ["allergen-progress", babyId] as const,
  /** Prefix covering every allergen's detail for one baby — invalidating it
   * refreshes whichever detail page happens to be cached, without the caller
   * knowing which slug that is. */
  allergenDetails: (babyId: string) => ["allergen-detail", babyId] as const,
  allergenDetail: (babyId: string, allergenSlug: string) => ["allergen-detail", babyId, allergenSlug] as const,
  favorites: ["favorites"] as const,
  /** Prefix: the summaries AND every cached history for one baby, so a meal
   * mutation refreshes both with one invalidation. */
  ratings: (babyId: string) => ["ratings", babyId] as const,
  ratingHistory: (babyId: string, target: RatingHistoryQuery) => ["ratings", babyId, "history", target] as const,
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

/**
 * One meal with its plate, for Edit meal (ledger 902). Fetched fresh on
 * every visit and dropped when the page closes (`gcTime: 0`), and never on
 * its own afterwards: the plate is built once from it, and a save names its
 * item ids, so it must never be a cached copy another save has replaced
 * (the server's 409 `meal_changed`). The page refetches it on that 409.
 */
export function useMeal(id: string | undefined) {
  return useQuery({
    queryKey: trackingKeys.meal(id ?? ""),
    queryFn: () => fetchMeal(id as string),
    enabled: Boolean(id),
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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

/** Item 573: this baby's rating summaries for the Foods / Recipes cards. */
export function useRatings(babyId: string | undefined) {
  return useQuery({
    queryKey: trackingKeys.ratings(babyId ?? ""),
    queryFn: () => fetchRatings(babyId as string),
    enabled: Boolean(babyId),
    staleTime: 15_000,
  });
}

/** Item 575: the points of one food's or recipe's rating graph. */
export function useRatingHistory(babyId: string | undefined, target: RatingHistoryQuery) {
  return useQuery({
    queryKey: trackingKeys.ratingHistory(babyId ?? "", target),
    queryFn: () => fetchRatingHistory(babyId as string, target),
    enabled: Boolean(babyId && (target.foodId || target.recipeId)),
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

export interface MarkAllergenEstablishedVariables {
  allergenSlug: string;
  /** ISO instant the parent says this allergen was established — the
   * maintenance countdown runs from here, so it is required rather than
   * optional: an omitted one would silently restart the clock at "now". */
  establishedAt: string;
}

/**
 * PUT /api/babies/:babyId/allergens/:key/established — "we already
 * established this before the app" override; see `unionAllergenStatus` in
 * shared/src/tracking.ts for how it's unioned with the derived ladder.
 */
export function useMarkAllergenEstablished(babyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ allergenSlug, establishedAt }: MarkAllergenEstablishedVariables) => {
      if (!babyId) throw new Error("useMarkAllergenEstablished called with no active baby");
      return putAllergenOverride(babyId, allergenSlug, { establishedAt });
    },
    onSuccess: (_result, variables) => {
      // Never the date and never the allergen: how far back a parent had to
      // reach is a product question ("is the When field earning its keep?"),
      // and `backdated` is the whole answer.
      track("allergen_marked", { action: "mark", backdated: isBackdatedMark(variables.establishedAt) });
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
    onSuccess: () => {
      // Undo carries no date at all — there is nothing to backdate, so the
      // flag is false rather than "unknown".
      track("allergen_marked", { action: "undo", backdated: false });
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
 * Taken by `useCreateMeal`, the one mutation that produces a brand-new meal
 * (Log meal and Serve alike).
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
 * The one fact about a save that the ROUTE cannot tell us, and that the
 * payload does not carry either: whether the parent had the "+ Save
 * leftovers to storage" switch on. Everything else in `meal_logged` is
 * derived from the input, the celebration snapshot or the URL.
 */
export interface CreateMealUsage {
  /**
   * Whether the leftovers switch was on when Save was pressed — i.e. whether
   * the parent ASKED for leftovers. Whether the storage write then succeeded
   * is `storage_item_added`'s business, not this event's.
   */
  leftoversSaved: boolean;
  /** The plate's containers as Storage had them when Save was pressed, so a
   * serve that empties one sends its `storage_item_closed` (the save's answer
   * is the meal alone). */
  containers?: readonly StorageItem[];
}

/**
 * Creating a meal (Log meal and Serve, both the plate page since ledger 902)
 * also drives the app's celebration moments — see `celebrateForNewMeal` —
 * and never fires on edit/delete.
 *
 * It is also where `meal_logged` is measured: once, on success, never per
 * network attempt, so a retried save cannot be counted twice. The props are
 * buckets and booleans read off the input and the saved meal — `has_notes`
 * is whether a note exists, never the note; `food_count` is what the meal
 * counts as tried, and `recipe_kind` reads its distinct recipes (SPEC §6).
 */
export function useCreateMeal(babyId: string | undefined, usage: CreateMealUsage = { leftoversSaved: false }) {
  const queryClient = useQueryClient();
  const { celebrate } = useCelebration();
  return useMutation({
    mutationFn: (input: CreatePlateMealInput) => {
      if (!babyId) throw new Error("useCreateMeal called with no active baby");
      return createMeal(babyId, input);
    },
    onMutate: () => snapshotMealCelebrationContext(queryClient, babyId),
    onSuccess: (created, input, context) => {
      track("meal_logged", {
        food_count: foodCountBucket(created.foods.length),
        // Ledger 759: two or more recipes are `several` (+ `includes_basic`).
        ...mealRecipeKindProps(
          queryClient,
          created.recipes?.map((recipe) => recipe.id) ?? (created.recipeId ? [created.recipeId] : []),
        ),
        from_storage: input.items.some((item) => item.kind === "storage"),
        via: mealViaFromLocation(),
        leftovers_saved: usage.leftoversSaved,
        has_notes: Boolean(input.notes || input.reactionNote),
        // The celebration snapshot already answers "had this baby eaten
        // anything before?", so the funnel's most important step costs no
        // extra query.
        is_first_meal: context?.hadAnyMeals !== true,
        backdated: backdatedBucket(input.servedAt ?? new Date()),
        offline: isOffline(),
        has_left_out: input.items.some((item) => item.kind === "recipe" && (item.leftOutFoodIds?.length ?? 0) > 0),
      });
      // A tracked container this serve emptied is finished by the server in
      // the same write: that is a close, and the only one nobody presses
      // Remove for. Never the container itself, only buckets.
      for (const item of containersEmptiedBy(input.items, usage.containers ?? [])) {
        track("storage_item_closed", {
          to: "finished",
          via: "serve_depleted",
          freshness_at_change: freshnessAtChange(item),
          age_days_bucket: ageDaysBucket(daysBetween(item.preparedAt)),
        });
      }
      if (!babyId) return;
      const snapshots = queryClient.getQueriesData<MealsResponse>({ queryKey: trackingKeys.meals(babyId) });
      for (const [key, data] of snapshots) {
        if (data) queryClient.setQueryData(key, { items: [created, ...data.items] });
      }
      celebrateForNewMeal(babyId, context, celebrate);
    },
    onError: (error) => {
      track("meal_save_failed", { via: mealViaFromLocation(), kind: failureKind(error), offline: isOffline() });
      refetchChangedRecipe(queryClient, error);
    },
    onSettled: () => {
      // A plate can take servings from containers, and (Phase 4) fill a
      // planned meal.
      invalidatePlateQueries(queryClient);
      if (!babyId) return;
      void queryClient.invalidateQueries({ queryKey: trackingKeys.meals(babyId) });
      invalidateAllergenQueries(queryClient, babyId);
      void queryClient.invalidateQueries({ queryKey: trackingKeys.ratings(babyId) });
    },
  });
}

/** A save refused because its recipe lost a left-out ingredient on another
 * device: that recipe's ingredients are refetched (VERIFY-p3-c1 #6). */
function refetchChangedRecipe(queryClient: QueryClient, error: unknown): void {
  const stale = staleLeaveOut(error);
  if (stale) void queryClient.invalidateQueries({ queryKey: catalogKeys.recipe(stale.recipeId) });
}

/** Storage and the meal plan, which every meal write can change: servings
 * taken or given back, a planned meal served or not. */
function invalidatePlateQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["storage"] });
  void queryClient.invalidateQueries({ queryKey: ["plan"] });
}

/**
 * Editing a meal never fires a celebration (only a fresh log does) but can
 * still change allergen exposure counts (a food left out, an item taken
 * off), so both the meal list and allergen progress are invalidated on
 * settle.
 */
export function useUpdateMeal(babyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePlateMealInput }) => updateMeal(id, input),
    // An edit is not a new meal, so it never sends `meal_logged` — but it IS
    // a meal mutation that can fail, and the quality panel counts those.
    onError: (error) => {
      track("meal_save_failed", { via: mealViaFromLocation(), kind: failureKind(error), offline: isOffline() });
      refetchChangedRecipe(queryClient, error);
    },
    onSuccess: (updated: MealItem) => {
      // The save's own answer, which can carry new item ids (a heal
      // regroups an orphan, BUILD-2.0), so nothing edits from an older copy.
      queryClient.setQueryData(trackingKeys.meal(updated.id), updated);
      if (!babyId) return;
      const snapshots = queryClient.getQueriesData<MealsResponse>({ queryKey: trackingKeys.meals(babyId) });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        queryClient.setQueryData(key, { items: data.items.map((item) => (item.id === updated.id ? updated : item)) });
      }
    },
    onSettled: () => {
      // Ledger 751/760: an edit that takes a container off the meal, or
      // changes its servings, moves servings in storage.
      invalidatePlateQueries(queryClient);
      if (!babyId) return;
      void queryClient.invalidateQueries({ queryKey: trackingKeys.meals(babyId) });
      invalidateAllergenQueries(queryClient, babyId);
      void queryClient.invalidateQueries({ queryKey: trackingKeys.ratings(babyId) });
    },
  });
}

/**
 * Deleting a meal (ledger 760; 785: the only way to reverse a serve). A served
 * meal's containers get their servings back server-side, so storage is
 * refreshed too. A 404 means the meal is already gone (a double tap, or a
 * delete elsewhere): that is the outcome asked for, so it is done,
 * not an error.
 */
export function useDeleteMeal(babyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      deleteMeal(id).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) return;
        throw error;
      }),
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
      invalidatePlateQueries(queryClient);
      if (!babyId) return;
      void queryClient.invalidateQueries({ queryKey: trackingKeys.meals(babyId) });
      invalidateAllergenQueries(queryClient, babyId);
      void queryClient.invalidateQueries({ queryKey: trackingKeys.ratings(babyId) });
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
