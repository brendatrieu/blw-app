import { useSearchParams } from "react-router-dom";
import type { MealItem } from "@blw/shared";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { useMeals } from "../features/tracking/hooks.js";
import { LogFoodForm } from "../features/tracking/components/LogFoodForm.js";
import { useBackNavigate } from "../components/ui/BackButton.js";
import { CloseButton } from "../components/ui/CloseButton.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { ButtonLink } from "../components/ui/Button.js";
import { Skeleton } from "../components/ui/Skeleton.js";

/**
 * Full-screen page for both logging a new meal and editing an existing one
 * (opened as `/log-meal?edit=:id`, e.g. from ServeLogList's per-meal Edit
 * link). Closing (via the header X, Cancel, a successful save, or the
 * device/browser back gesture) all resolve through the same history-aware
 * `useBackNavigate` idiom `BackButton` uses elsewhere — pop back to wherever
 * the user came from, falling back to "/" for a direct/deep-linked visit
 * with no history to pop.
 *
 * There's no single-meal fetch endpoint, so edit mode locates the meal by id
 * in the most recent page of meals — the only list ServeLogList ever shows
 * an Edit link from, so a real edit always finds it there. An id that isn't
 * found (already deleted from under the link, raced with another delete, or
 * the fetch itself errored) shows a "gone" EmptyState with a way back,
 * rather than falling through to a blank create form under an Edit title.
 */
export type EditLoadState = "loading" | "found" | "missing";

/**
 * Pure classification of the edit-target lookup, independent of *why* it's
 * still loading (baby not resolved yet vs. the meals fetch itself pending) —
 * the caller folds both into a single `loading` flag. `missing` covers both
 * a genuinely absent id and a failed fetch: either way there's nothing to
 * prefill and the same "meal is gone" state applies.
 */
export function resolveEditState(
  loading: boolean,
  isError: boolean,
  items: MealItem[],
  editId: string,
): EditLoadState {
  if (loading) return "loading";
  if (isError) return "missing";
  return items.some((item) => item.id === editId) ? "found" : "missing";
}

export function LogFoodPage() {
  const { activeBaby, isLoading: babyLoading } = useActiveBaby();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const isEditing = Boolean(editId);
  const goBack = useBackNavigate("/");

  // Only fetched in edit mode — a fresh "log a meal" visit needs none of
  // this, and it's usually a cache hit anyway (ServeLogList queries the same
  // babyId/limit on Home, which is how the user got to the Edit link).
  const {
    data: mealsData,
    isLoading: mealsLoading,
    isError: mealsErrored,
  } = useMeals(isEditing ? activeBaby?.id : undefined, { limit: 100 });
  const editState = editId ? resolveEditState(babyLoading || mealsLoading, mealsErrored, mealsData?.items ?? [], editId) : null;
  const meal = editState === "found" ? mealsData?.items.find((item) => item.id === editId) : undefined;
  const stillLoadingEditTarget = editState === "loading";
  const editTargetMissing = editState === "missing";

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title={isEditing ? "Edit meal" : "Log meal"} action={<CloseButton fallback="/" />} />

      {(babyLoading || stillLoadingEditTarget) && <Skeleton className="h-40 w-full rounded-[var(--radius-lg)]" />}

      {!babyLoading && !activeBaby && (
        <EmptyState
          icon="👋"
          title="Add a baby first"
          description="Once a baby profile exists you can start logging foods."
          action={<ButtonLink to="/settings">Add a baby</ButtonLink>}
        />
      )}

      {!babyLoading && activeBaby && editTargetMissing && (
        <EmptyState
          icon="🤷"
          title="That meal is gone"
          description="It may have already been deleted, or something went wrong loading it."
          action={<ButtonLink to="/">Back home</ButtonLink>}
        />
      )}

      {!babyLoading && activeBaby && !stillLoadingEditTarget && !editTargetMissing && (
        <LogFoodForm babyId={activeBaby.id} meal={meal} onDone={goBack} />
      )}
    </div>
  );
}
