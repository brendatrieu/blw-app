import { useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import {
  PLATE_NOTHING_COUNTS,
  type CreateStorageItemInput,
  type FoodListItem,
  type MealItem,
  type StorageItem,
  type StorageLocation,
} from "@blw/shared";
import { useActiveBaby } from "../babies/useActiveBaby.js";
import { useFoods, useRecipe } from "../catalog/hooks.js";
import { HowToLink } from "../safety/HowToLink.js";
import { useCreateStorageItem, useStorageItems } from "../storage/hooks.js";
import { AddMoreSheet } from "../storage/components/AddMoreSheet.js";
import { LeftoversFields } from "../storage/components/LeftoversFields.js";
import { buildLeftoverStorageInput } from "../storage/leftovers.js";
import type { ContainerChoice } from "../storage/format.js";
import { useCreateMeal, useMeal, useUpdateMeal } from "../tracking/hooks.js";
import { BackButton, useBackNavigate } from "../../components/ui/BackButton.js";
import { Button, ButtonLink } from "../../components/ui/Button.js";
import { CloseButton } from "../../components/ui/CloseButton.js";
import { DateTimeField, nowAtMinute } from "../../components/ui/DateTimeField.js";
import { EmptyState } from "../../components/ui/EmptyState.js";
import { Field } from "../../components/ui/Field.js";
import { Textarea } from "../../components/ui/Input.js";
import { PageHeader, resolveHeaderAffordance, type HeaderAffordance } from "../../components/ui/PageHeader.js";
import { Skeleton } from "../../components/ui/Skeleton.js";
import { Switch } from "../../components/ui/Switch.js";
import { ApiError } from "../../lib/api.js";
import { awaitingDetail } from "../../lib/detailQuery.js";
import { useSubmitValidation } from "../../lib/forms.js";
import { useIsOffline } from "../../lib/online.js";
import { ignoreTapsBriefly } from "../../lib/tapGuard.js";
import { PlateItemRow, WarningGlyph } from "./PlateItemRow.js";
import {
  NOTHING_COUNTS_MESSAGE,
  PLATE_FIELD_ORDER,
  RECIPE_CHANGED_MESSAGE,
  attachContainers,
  containerEntry,
  entryKey,
  fromMeal,
  hasLeftovers,
  nothingCounts,
  plateAddMoreServing,
  plateLeftoverSource,
  plateReducer,
  ranOutEntry,
  staleLeaveOut,
  toMealInput,
  validatePlate,
  type PlateAction,
  type PlateEntry,
} from "./plate.js";

/** Which page /log-meal is (plan SPEC §5): `?edit=` an Edit meal, `?storage=`
 * a container's Serve, anything else Log meal (with `?food=` / `?recipe=`). */
export type PlateMode = "log" | "serve" | "edit";

export function plateMode(params: URLSearchParams): PlateMode {
  if (params.get("edit")) return "edit";
  if (params.get("storage")) return "serve";
  return "log";
}

/** Entry wording follows the button the parent tapped (PP-NOTES round 1). */
export const PLATE_TITLE: Record<PlateMode, string> = { log: "Log meal", serve: "Serve", edit: "Edit meal" };

/**
 * The header's way out (items 258/259): Edit meal is reached by drilling
 * into a meal, so it gets the back chevron; Log meal and Serve are tasks
 * opened from anywhere, so they get the X. Never both.
 */
export function resolvePlateHeaderAffordance(mode: PlateMode): HeaderAffordance {
  return resolveHeaderAffordance({ drilledInto: mode === "edit", openedAsTask: mode !== "edit" });
}

export type PlateStart =
  | { status: "loading" }
  | { status: "offline" }
  | { status: "missing" }
  | { status: "ready"; plate: PlateEntry[] };

/**
 * What the plate opens with, once what it needs has answered.
 *
 * - **Edit:** the meal as GET /api/meals/:id answers it; a failed fetch (gone,
 *   or never this account's) is `missing`. Offline with no answer yet it is
 *   `offline`: the fetch waits for the network (VERIFY-p2-c1 #6), and a
 *   failure then is no proof the meal is gone.
 * - **Serve:** the container, from Storage's active or history list (a
 *   finished one opens flagged, CD-Serve-Ran-Out); in neither is `missing`.
 * - **Log meal:** the food or recipe a food or recipe page passed. One that
 *   doesn't resolve is simply left off: the page is still Log meal.
 */
export function resolvePlateStart(input: {
  mode: PlateMode;
  offline: boolean;
  /** Edit: GET /api/meals/:id. */
  meal: { isError: boolean; data: MealItem | undefined };
  /** Serve: the container's id, Storage's lists, and those lists' queries. */
  storageId: string | null;
  containers: readonly StorageItem[];
  storageQueries: readonly { isPending: boolean; isFetching: boolean }[];
  /** Log meal: what `?food=` / `?recipe=` name, and whether it is still loading. */
  prefill: { loading: boolean; food: FoodListItem | undefined; recipe: { id: string; title: string } | undefined };
}): PlateStart {
  if (input.mode === "edit") {
    if (input.meal.data) return { status: "ready", plate: fromMeal(input.meal.data) };
    if (input.offline) return { status: "offline" };
    return input.meal.isError ? { status: "missing" } : { status: "loading" };
  }
  if (input.mode === "serve") {
    const item = input.containers.find((candidate) => candidate.id === input.storageId);
    if (item) return { status: "ready", plate: [containerEntry(item)] };
    return input.storageQueries.some((query) => awaitingDetail(query, false)) ? { status: "loading" } : { status: "missing" };
  }
  const { loading, food, recipe } = input.prefill;
  if (loading) return { status: "loading" };
  const plate = plateReducer([], {
    type: "addMore",
    change: {
      removed: { itemIds: [], recipeIds: [], foodIds: [] },
      items: [],
      recipes: recipe ? [{ id: recipe.id, title: recipe.title }] : [],
      foods: food ? [{ id: food.id, slug: food.slug, name: food.name, category: food.category, emoji: food.emoji }] : [],
    },
  });
  return { status: "ready", plate };
}

/** The server's 409 when a kept item or rating names a row another write
 * replaced (SPEC §1.4 step 1): the page reloads the meal, re-applying nothing. */
export const isMealChanged = (error: unknown): boolean =>
  error instanceof ApiError &&
  error.status === 409 &&
  (error.body as { error?: unknown } | undefined)?.error === "meal_changed";

/** The server's 400 when nothing on the plate counts as a food: the plate
 * says what to do instead of "try again" (VERIFY-p2-c1 #3). */
export const isNothingCounts = (error: unknown): boolean =>
  error instanceof ApiError &&
  error.status === 400 &&
  (error.body as { details?: { items?: unknown } } | undefined)?.details?.items === PLATE_NOTHING_COUNTS;

/**
 * What the submit may do once a Log meal save has progressed. Pinned so the
 * no-double-meal guarantee holds: after the meal has been created, NO submit
 * path returns "create" again — only a storage retry (when the leftovers
 * half failed) or nothing. Implicit submission (Enter) reaches the submit
 * handler even while the failure banner has replaced the button.
 */
export function resolveSubmitAction(mealSaved: boolean, storageFailurePending: boolean): "create" | "retry-storage" | "noop" {
  if (!mealSaved) return "create";
  return storageFailurePending ? "retry-storage" : "noop";
}

/**
 * The plate page (plan SPEC §5, ledger 902), one route for three entries:
 * Log meal (`/log-meal`, `?food=` / `?recipe=` prefill), Serve
 * (`/log-meal?storage=:id`, the container already on the plate) and Edit
 * meal (`/log-meal?edit=:id`). Leaving it (the header's X or chevron, a
 * save, the device's back) pops back to wherever the parent came from, "/"
 * for a deep link.
 */
export function PlateScreen() {
  const { activeBaby, isLoading: babyLoading } = useActiveBaby();
  const [searchParams] = useSearchParams();
  const mode = plateMode(searchParams);
  const editId = mode === "edit" ? searchParams.get("edit") : null;
  const storageId = mode === "serve" ? searchParams.get("storage") : null;
  const foodId = mode === "log" ? searchParams.get("food") : null;
  const recipeId = mode === "log" ? searchParams.get("recipe") : null;
  const goBack = useBackNavigate("/");
  const offline = useIsOffline();
  // Bumped once a 409 meal_changed refetch lands: the plate starts over
  // from the meal as it is now, and says so.
  const [reloads, setReloads] = useState(0);

  const mealQuery = useMeal(editId ?? undefined);
  const active = useStorageItems("active");
  const history = useStorageItems("history");
  const foods = useFoods();
  const recipe = useRecipe(recipeId ?? undefined);
  const containers = [...(active.data?.items ?? []), ...(history.data?.items ?? [])];

  const start = resolvePlateStart({
    mode,
    offline,
    meal: mealQuery,
    storageId,
    containers,
    storageQueries: [active, history],
    prefill: {
      // Only what was asked for is waited on: a plain Log meal opens at once.
      loading: (Boolean(foodId) && foods.isLoading) || recipe.isLoading,
      food: foods.data?.foods.find((food) => food.id === foodId),
      recipe: recipe.data,
    },
  });

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title={PLATE_TITLE[mode]}
        leading={
          resolvePlateHeaderAffordance(mode) === "back" ? <BackButton fallback="/" /> : <CloseButton fallback="/" />
        }
      />
      {mode === "serve" ? <HowToLink slug="how-to-serve-from-storage" /> : <HowToLink slug="how-to-log-a-meal" />}

      {(babyLoading || (activeBaby && start.status === "loading")) && (
        <Skeleton className="h-40 w-full rounded-[var(--radius-lg)]" />
      )}

      {!babyLoading && !activeBaby && (
        <EmptyState
          icon="👋"
          title="Add a baby first"
          description="Once a baby profile exists you can start logging foods."
          action={<ButtonLink to="/settings">Add a baby</ButtonLink>}
        />
      )}

      {/* Edit offline with the meal not loaded (start "offline"): the page
          shows nothing more, since the banner already says "You're offline."
          (VERIFY-p3-c1). The fetch resumes once back online. */}
      {!babyLoading && activeBaby && start.status === "missing" && mode === "serve" && <Navigate to="/storage" replace />}

      {!babyLoading && activeBaby && start.status === "missing" && mode === "edit" && (
        <EmptyState
          icon="🤷"
          title="That meal is gone"
          description="It may have already been deleted, or something went wrong loading it."
          action={<ButtonLink to="/">Back home</ButtonLink>}
        />
      )}

      {!babyLoading && activeBaby && start.status === "ready" && (
        <PlateForm
          key={`${mode}:${editId ?? storageId ?? ""}:${reloads}`}
          mode={mode}
          babyId={activeBaby.id}
          initialPlate={start.plate}
          meal={mealQuery.data}
          containers={containers}
          onDone={goBack}
          reloaded={reloads > 0}
          onMealChanged={() => {
            void mealQuery.refetch().then(() => setReloads((count) => count + 1));
          }}
        />
      )}
    </div>
  );
}

const ADD_MORE_BUTTON =
  "flex min-h-12 items-center justify-center rounded-[var(--radius-md)] border-[1.5px] border-dashed border-[var(--color-border)] text-[15px] font-semibold text-[var(--color-accent)] disabled:opacity-60";
const NOTICE = "flex gap-2 rounded-[10px] px-2.5 py-2 text-sm";

export interface PlateFormProps {
  mode: PlateMode;
  babyId: string;
  initialPlate: PlateEntry[];
  /** Edit: the meal as GET /api/meals/:id answered it. */
  meal?: MealItem;
  /** Storage's latest copies (active and history), for each container's
   * line, its stepper's limit and its run-out flag. */
  containers: readonly StorageItem[];
  onDone: () => void;
  /** Edit: the save was refused as `meal_changed`; the page reloads the meal. */
  onMealChanged: () => void;
  /** Edit: this plate is the meal as reloaded after `meal_changed`. */
  reloaded: boolean;
}

/**
 * The plate itself (CD-Log-Meal, CD-Serve-From-Storage, CD-Edit-Meal,
 * CD-Leave-Out, CD-Serve-Ran-Out): "On the plate", one row per item with its
 * own stars, "+ Add more" (the only way to add), When, the reaction and
 * notes, Log meal's leftovers switch, and one Save (Serve on Serve). Every
 * change goes through the plate reducer; the save is `toMealInput`. Offline,
 * the save waits with everything entered kept (ledger 766).
 */
export function PlateForm({
  mode,
  babyId,
  initialPlate,
  meal,
  containers,
  onDone,
  onMealChanged,
  reloaded,
}: PlateFormProps) {
  const [entries, setEntries] = useState<PlateEntry[]>(initialPlate);
  const plate = attachContainers(entries, containers);
  const dispatch = (action: PlateAction) =>
    setEntries((current) => plateReducer(attachContainers(current, containers), action));
  const [servedAt, setServedAt] = useState(() => (meal ? nowAtMinute(new Date(meal.servedAt)) : nowAtMinute()));
  const [reactionNote, setReactionNote] = useState(() => meal?.reactionNote ?? "");
  const [notes, setNotes] = useState(() => meal?.notes ?? "");
  const [addingMore, setAddingMore] = useState(false);

  // Log meal's "Save leftovers to storage" (items 152-153, 348).
  const [leftoversOpen, setLeftoversOpen] = useState(false);
  const [leftoverLocation, setLeftoverLocation] = useState<StorageLocation>("fridge");
  const [leftoverServingsTotal, setLeftoverServingsTotal] = useState("");
  const [leftoverBestBy, setLeftoverBestBy] = useState("");
  // Item 348: one container is what a box of leftovers from one meal is.
  const [leftoverContainerChoice, setLeftoverContainerChoice] = useState<ContainerChoice>("one");
  const [storageFailure, setStorageFailure] = useState<CreateStorageItemInput | null>(null);
  const createStorageItem = useCreateStorageItem();
  // Once the meal itself has saved, nothing here may create a second one.
  const mealSavedRef = useRef(false);

  const createMeal = useCreateMeal(babyId, {
    leftoversSaved: leftoversOpen,
    containers: plate.flatMap((entry) => (entry.kind === "storage" && entry.container ? [entry.container] : [])),
  });
  const updateMeal = useUpdateMeal(babyId);
  const mutation = mode === "edit" ? updateMeal : createMeal;
  const offline = useIsOffline();
  // Offline a save pauses rather than fails: say neither "Saving…" nor
  // "Couldn't…", and keep every control usable (ledger 766, M9).
  const busy = mutation.isPending && !offline;
  const runOut = ranOutEntry(plate);
  const leftoverSource = plateLeftoverSource(plate);
  const serve = mode === "serve";

  const { errors, attemptSubmit } = useSubmitValidation(
    { itemCount: plate.length, nothingCounts: nothingCounts(plate), leftoversOpen, leftoverBestBy },
    validatePlate,
    PLATE_FIELD_ORDER,
    { items: "plate-add-more", leftoverBestBy: "log-food-leftover-best-by" },
  );

  function finish() {
    // Ledger 767: a fast second tap must not land on what was under the button.
    ignoreTapsBriefly();
    onDone();
  }

  /** The leftovers half; success and Retry both come here. Never a meal. */
  function saveStorage(input: CreateStorageItemInput) {
    createStorageItem.mutate(input, {
      onSuccess: () => {
        setStorageFailure(null);
        finish();
      },
      onError: () => setStorageFailure(input),
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const postSave = resolveSubmitAction(mealSavedRef.current, storageFailure !== null);
    if (postSave === "retry-storage") {
      saveStorage(storageFailure!);
      return;
    }
    if (postSave === "noop" || mutation.isPending || offline || runOut) return;
    if (!attemptSubmit()) return;
    const input = toMealInput(plate, { servedAt, reactionNote, notes });
    // A leave-out the recipe lost on another device: drop it, and the
    // recipe refetches (the mutation hooks), so the next save goes through.
    const dropStale = (error: unknown) => {
      const stale = staleLeaveOut(error);
      if (stale) dispatch({ type: "dropLeftOut", ...stale });
    };
    if (mode === "edit" && meal) {
      updateMeal.mutate(
        { id: meal.id, input },
        {
          onSuccess: finish,
          onError: (error) => {
            if (isMealChanged(error)) onMealChanged();
            dropStale(error);
          },
        },
      );
      return;
    }
    const leftovers = mode === "log" && leftoversOpen && hasLeftovers(leftoverSource) ? leftoverSource : null;
    createMeal.mutate(input, {
      onError: dropStale,
      onSuccess: () => {
        mealSavedRef.current = true;
        if (!leftovers) {
          finish();
          return;
        }
        saveStorage(
          buildLeftoverStorageInput(
            leftovers,
            leftoverLocation,
            leftoverServingsTotal,
            leftoverBestBy,
            leftoverContainerChoice === "separate",
          ),
        );
      },
    });
  }

  return (
    // `noValidate`: the plate answers its own required field inline (item 236).
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {/* CD-Serve-Ran-Out: why the save waits. The row says what to do. */}
      {runOut && (
        <p
          id="plate-ran-out"
          role="status"
          className={`${NOTICE} bg-[var(--color-caution-soft)] text-[var(--color-caution-soft-text)]`}
        >
          <WarningGlyph />
          {`${runOut.title} has run out, so this meal isn't ${serve ? "served" : "saved"} yet.`}
        </p>
      )}
      {reloaded && (
        <p role="status" className={`${NOTICE} bg-[var(--color-caution-soft)] text-[var(--color-caution-soft-text)]`}>
          This meal was changed somewhere else, so it's been reloaded. Make your changes again.
        </p>
      )}

      <div role="group" aria-labelledby="plate-items-label" className="flex flex-col gap-2">
        <div>
          <span id="plate-items-label" className="text-sm font-medium text-[var(--color-text)]">
            On the plate
          </span>
          {plate.length > 0 && <p className="text-xs text-[var(--color-text-muted)]">Stars are optional.</p>}
        </div>
        {plate.length > 0 && (
          <ul aria-labelledby="plate-items-label" className="flex flex-col gap-2">
            {plate.map((entry) => (
              <PlateItemRow key={entryKey(entry)} entry={entry} dispatch={dispatch} disabled={busy} />
            ))}
          </ul>
        )}
        <button
          id="plate-add-more"
          type="button"
          disabled={busy}
          onClick={() => setAddingMore(true)}
          className={ADD_MORE_BUTTON}
        >
          + Add more
        </button>
        {errors.items && (
          <p role="alert" className="text-xs font-medium text-[var(--color-danger)]">
            {errors.items}
          </p>
        )}
      </div>

      <Field label="When" htmlFor="plate-when">
        <DateTimeField id="plate-when" value={servedAt} onChange={setServedAt} disabled={busy} />
      </Field>

      {/* Always visible (item 263): the reaction note feeds allergen tracking. */}
      <Field
        label="Reaction (optional)"
        htmlFor="plate-reaction"
        description="Only for hives, vomiting, rash or other reaction signs."
      >
        <Textarea
          id="plate-reaction"
          value={reactionNote}
          onChange={(e) => setReactionNote(e.target.value)}
          rows={2}
          placeholder="e.g. mild rash around mouth"
        />
      </Field>

      <Field label="Notes (optional)" htmlFor="plate-notes">
        <Textarea
          id="plate-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="e.g. ate the whole thing"
        />
      </Field>

      {mode === "log" && !storageFailure && (
        <div className="flex flex-col gap-3">
          {/* Borderless row + switch: a bordered box read as a tappable card,
              and a checkbox as form data (user feedback). */}
          <div className="flex min-h-11 items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
              <span aria-hidden="true" className="text-lg leading-none">
                📦
              </span>
              Save leftovers to storage
            </span>
            <Switch
              checked={leftoversOpen}
              disabled={!hasLeftovers(leftoverSource)}
              onChange={setLeftoversOpen}
              aria-label="Save leftovers to storage"
            />
          </div>
          {leftoversOpen && (
            <LeftoversFields
              source={leftoverSource}
              containerChoice={leftoverContainerChoice}
              onContainerChoiceChange={setLeftoverContainerChoice}
              location={leftoverLocation}
              onLocationChange={setLeftoverLocation}
              servingsTotal={leftoverServingsTotal}
              onServingsTotalChange={setLeftoverServingsTotal}
              bestBy={leftoverBestBy}
              onBestByChange={setLeftoverBestBy}
              bestByError={errors.leftoverBestBy}
            />
          )}
        </div>
      )}

      {/* A `meal_changed` refusal reloads the plate, which says so itself. */}
      {mutation.isError && !offline && !runOut && !isMealChanged(mutation.error) && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          {isNothingCounts(mutation.error)
            ? NOTHING_COUNTS_MESSAGE
            : staleLeaveOut(mutation.error)
              ? RECIPE_CHANGED_MESSAGE
              : serve
                ? "Couldn't serve — try again."
                : "Couldn't save that — try again."}
        </p>
      )}

      {storageFailure ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
          <p role="alert" className="text-sm font-medium text-[var(--color-danger)]">
            Meal saved — couldn't save leftovers. Try again, or close this page to skip it.
          </p>
          {/* Retry only (item 257): the meal is saved, and the header's X
              leaves without retrying. */}
          <Button type="button" size="sm" onClick={() => saveStorage(storageFailure)} disabled={createStorageItem.isPending}>
            {createStorageItem.isPending ? "Retrying…" : "Retry"}
          </Button>
        </div>
      ) : (
        // No gap: the empty live region must add no space while online.
        <div className="flex flex-col">
          <Button
            type="submit"
            disabled={busy || offline || Boolean(runOut)}
            aria-describedby={offline ? "plate-offline" : runOut ? "plate-ran-out" : undefined}
            className="w-full"
          >
            {busy ? (serve ? "Serving…" : "Saving…") : serve ? "Serve" : "Save"}
          </Button>
          <div role="status">
            {offline && (
              <p id="plate-offline" className="mt-1.5 text-center text-xs text-[var(--color-text-muted)]">
                You're offline.
              </p>
            )}
          </div>
        </div>
      )}

      {addingMore && (
        <AddMoreSheet
          babyId={babyId}
          serving={plateAddMoreServing(plate)}
          requireContainer={serve}
          onClose={() => setAddingMore(false)}
          onDone={(change) => {
            dispatch({ type: "addMore", change });
            setAddingMore(false);
          }}
        />
      )}
    </form>
  );
}
