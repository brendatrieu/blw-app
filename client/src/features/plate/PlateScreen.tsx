import { useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  PLAN_NAME_MAX,
  PLATE_NOTHING_COUNTS,
  localDate,
  planDateSchema,
  plannedServedAt,
  type CreateStorageItemInput,
  type FoodListItem,
  type MealItem,
  type PlannedMeal,
  type StorageItem,
  type StorageLocation,
} from "@blw/shared";
import { useActiveBaby } from "../babies/useActiveBaby.js";
import { useFoods, useRecipe } from "../catalog/hooks.js";
import { HowToLink } from "../safety/HowToLink.js";
import { useCreateStorageItem, useStorageItems } from "../storage/hooks.js";
import { AddMoreSheet } from "../storage/components/AddMoreSheet.js";
import { AddStorageItemForm } from "../storage/components/AddStorageItemForm.js";
import { LeftoversFields } from "../storage/components/LeftoversFields.js";
import { buildLeftoverStorageInput } from "../storage/leftovers.js";
import type { ContainerChoice } from "../storage/format.js";
import { useCreateMeal, useMeal, useUpdateMeal } from "../tracking/hooks.js";
import { containerGoneBlocked, foodDeletedBlocked } from "../plan/copy.js";
import { nativeTimeInput } from "../plan/DailyMealsSheet.js";
import { isPlanChanged, servedMealId, usePlan, useSavePlannedMeal } from "../plan/hooks.js";
import { NEW_PLANNED_MEAL, deviceTimeZone, mealTimeLabel, planDayLabel, validatePlanMeal, weekOf } from "../plan/plan.js";
import { BackButton, useBackNavigate } from "../../components/ui/BackButton.js";
import { Button, ButtonLink } from "../../components/ui/Button.js";
import { CloseButton } from "../../components/ui/CloseButton.js";
import { DateTimeField, nowAtMinute } from "../../components/ui/DateTimeField.js";
import { EmptyState } from "../../components/ui/EmptyState.js";
import { Field } from "../../components/ui/Field.js";
import { Input, Textarea } from "../../components/ui/Input.js";
import { PageHeader, resolveHeaderAffordance, type HeaderAffordance } from "../../components/ui/PageHeader.js";
import { Sheet } from "../../components/ui/Sheet.js";
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
  deletedFoodEntry,
  entryKey,
  fromMeal,
  fromPlanned,
  hasLeftovers,
  nothingCounts,
  plateAddMoreServing,
  plateLeftoverSource,
  plateReducer,
  ranOutEntry,
  restockPrefill,
  servePlanned,
  staleLeaveOut,
  toMealInput,
  toPlanInput,
  validatePlate,
  type ContainerEntry,
  type PlateAction,
  type PlateEntry,
} from "./plate.js";

/** Which page /log-meal is (plan SPEC §5): `?edit=` an Edit meal, `?storage=`
 * a container's Serve, anything else Log meal (with `?food=` / `?recipe=`).
 * `/plan/:date/:slotId` is Plan a meal, and with `?serve=1` on today or an
 * earlier day it is that planned meal's Serve (`planServe`, SPEC §3.5). */
export type PlateMode = "log" | "serve" | "edit" | "plan" | "planServe";

export function plateMode(params: URLSearchParams): PlateMode {
  if (params.get("edit")) return "edit";
  if (params.get("storage")) return "serve";
  return "log";
}

/** Entry wording follows the button the parent tapped (PP-NOTES round 1). */
export const PLATE_TITLE: Record<PlateMode, string> = {
  log: "Log meal",
  serve: "Serve",
  edit: "Edit meal",
  plan: "Plan a meal",
  planServe: "Serve",
};

/**
 * The header's way out (items 258/259): Edit meal and Plan a meal are reached
 * by drilling into a meal, so they get the back chevron; Log meal and Serve
 * (a planned meal's too, CD-Serve-Ran-Out) are tasks opened from anywhere,
 * so they get the X. Never both.
 */
export function resolvePlateHeaderAffordance(mode: PlateMode): HeaderAffordance {
  const drilledInto = mode === "edit" || mode === "plan";
  return resolveHeaderAffordance({ drilledInto, openedAsTask: !drilledInto });
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
 * - **Plan a meal:** the planned meal's items, or an empty plate for one
 *   "+ Add a meal" makes. A day that isn't a date, a meal not on its day
 *   (removed elsewhere), or a save the server says is no longer there is
 *   `missing`; offline before the plan was ever read is `offline`.
 * - **A planned meal's Serve:** the same meal, once Storage's lists have
 *   answered too, so each container opens as it is now (`servePlanned`).
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
  /** Plan a meal: its day (null when not a date), whether it is new, the
   * meal as the plan holds it, and the plan query's state. */
  plan?: { date: string | null; isNew: boolean; meal: PlannedMeal | undefined; settled: boolean; gone: boolean };
}): PlateStart {
  if (input.mode === "plan" || input.mode === "planServe") {
    const plan = input.plan;
    if (!plan?.date || plan.gone) return { status: "missing" };
    if (plan.isNew) return { status: "ready", plate: [] };
    if (plan.meal && input.mode === "planServe") {
      return input.storageQueries.some((query) => awaitingDetail(query, false))
        ? { status: "loading" }
        : { status: "ready", plate: servePlanned(plan.meal.items, input.containers) };
    }
    if (plan.meal) return { status: "ready", plate: fromPlanned(plan.meal.items) };
    if (plan.settled) return { status: "missing" };
    return input.offline ? { status: "offline" } : { status: "loading" };
  }
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
  const params = useParams();
  const localToday = localDate(new Date(), deviceTimeZone());
  // Plan a meal: its day, as the plan page shows it (?date=, none for today).
  const planDate = params.date !== undefined && planDateSchema.safeParse(params.date).success ? params.date : null;
  const isNewMeal = params.slotId === NEW_PLANNED_MEAL;
  // A future day has no Serve (SPEC §3.5): `?serve=1` there is just the meal.
  const servesPlan = searchParams.get("serve") === "1" && planDate !== null && planDate <= localToday && !isNewMeal;
  const mode: PlateMode = params.date !== undefined ? (servesPlan ? "planServe" : "plan") : plateMode(searchParams);
  const fromPlan = mode === "plan" || mode === "planServe";
  const editId = mode === "edit" ? searchParams.get("edit") : null;
  const storageId = mode === "serve" ? searchParams.get("storage") : null;
  const foodId = mode === "log" ? searchParams.get("food") : null;
  const recipeId = mode === "log" ? searchParams.get("recipe") : null;
  const planBack = !planDate || planDate === localToday ? "/plan" : `/plan?date=${planDate}`;
  const goBack = useBackNavigate(fromPlan ? planBack : "/");
  const navigate = useNavigate();
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
  const week = weekOf(planDate ?? localToday);
  const plan = usePlan(planDate && !isNewMeal ? activeBaby?.id : undefined, week[0]!, week[6]!);
  const found = plan.data?.days.find((day) => day.date === planDate)?.meals.find((meal) => meal.slotId === params.slotId);
  // A day another device writes to first gets new slot ids; the page keeps
  // the meal it opened (the server still finds it by the old one).
  const opened = useRef<PlannedMeal | undefined>(undefined);
  if (found) opened.current = found;
  const plannedMeal = found ?? opened.current;
  const [planGone, setPlanGone] = useState(false);
  // A planned meal's Serve waits for Storage once, to open on fresh counts;
  // a later refetch (its own Add to storage) must not unmount the plate.
  const opensOnce = useRef(false);

  const start = resolvePlateStart({
    mode,
    offline,
    meal: mealQuery,
    storageId,
    containers,
    storageQueries: mode === "planServe" && opensOnce.current ? [] : [active, history],
    prefill: {
      // Only what was asked for is waited on: a plain Log meal opens at once.
      loading: (Boolean(foodId) && foods.isLoading) || recipe.isLoading,
      food: foods.data?.foods.find((food) => food.id === foodId),
      recipe: recipe.data,
    },
    plan: { date: planDate, isNew: isNewMeal, meal: plannedMeal, settled: Boolean(plan.data) || plan.isError, gone: planGone },
  });
  if (start.status === "ready") opensOnce.current = true;

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title={PLATE_TITLE[mode]}
        leading={
          resolvePlateHeaderAffordance(mode) === "back" ? (
            <BackButton fallback={fromPlan ? planBack : "/"} />
          ) : (
            <CloseButton fallback={fromPlan ? planBack : "/"} />
          )
        }
      />
      {mode === "serve" && <HowToLink slug="how-to-serve-from-storage" />}
      {(mode === "log" || mode === "edit") && <HowToLink slug="how-to-log-a-meal" />}

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

      {!babyLoading && activeBaby && start.status === "missing" && (mode === "edit" || fromPlan) && (
        <EmptyState
          icon="🤷"
          title="That meal is gone"
          description="It may have already been deleted, or something went wrong loading it."
          action={fromPlan ? <ButtonLink to={planBack}>Meal plan</ButtonLink> : <ButtonLink to="/">Back home</ButtonLink>}
        />
      )}

      {/* What was served lives on the logged meal (CD-After-Serve's "Rate or change"). */}
      {!babyLoading && activeBaby && start.status === "ready" && plannedMeal?.served && (
        <Navigate to={`/meals/${plannedMeal.served.mealId}`} replace />
      )}

      {!babyLoading && activeBaby && start.status === "ready" && !plannedMeal?.served && (
        <PlateForm
          key={`${mode}:${editId ?? storageId ?? params.slotId ?? ""}:${reloads}`}
          mode={mode}
          babyId={activeBaby.id}
          initialPlate={start.plate}
          meal={mealQuery.data}
          plan={
            planDate
              ? {
                  date: planDate,
                  today: plan.data?.today ?? localToday,
                  // The row id once the day has rows (a served meal links to it).
                  slotId: isNewMeal ? null : (plannedMeal?.slotId ?? params.slotId ?? null),
                  name: plannedMeal?.name ?? "",
                  time: plannedMeal?.time ?? null,
                }
              : undefined
          }
          containers={containers}
          onDone={goBack}
          reloaded={reloads > 0}
          onMealChanged={() => {
            void mealQuery.refetch().then(() => setReloads((count) => count + 1));
          }}
          onPlanGone={(mealId) => (mealId ? navigate(`/meals/${mealId}`, { replace: true }) : setPlanGone(true))}
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
  /** Plan a meal: its day and the caller's today, its slot (null for a meal
   * "+ Add a meal" makes on Save), and its name and time as planned. A
   * planned meal's Serve links the meal it logs to that slot. */
  plan?: { date: string; today: string; slotId: string | null; name: string; time: string | null };
  /** Plan a meal or its Serve: the save found the meal served (its logged
   * meal's id) or gone from its day (null). */
  onPlanGone?: (servedMealId: string | null) => void;
}

/** When a planned meal's Serve starts (SPEC §3.5): a past day at the time it
 * was planned for (noon without one), today now. */
export function planServeStart(plan: { date: string; today: string; time: string | null }, now: Date = new Date()): Date {
  return plan.date < plan.today ? nowAtMinute(plannedServedAt(plan.date, plan.time, deviceTimeZone())) : nowAtMinute(now);
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
  plan,
  onPlanGone,
}: PlateFormProps) {
  const [entries, setEntries] = useState<PlateEntry[]>(initialPlate);
  const plate = attachContainers(entries, containers);
  const dispatch = (action: PlateAction) =>
    setEntries((current) => plateReducer(attachContainers(current, containers), action));
  const [servedAt, setServedAt] = useState(() =>
    meal ? nowAtMinute(new Date(meal.servedAt)) : mode === "planServe" && plan ? planServeStart(plan) : nowAtMinute(),
  );
  const [reactionNote, setReactionNote] = useState(() => meal?.reactionNote ?? "");
  const [notes, setNotes] = useState(() => meal?.notes ?? "");
  const [addingMore, setAddingMore] = useState(false);
  // CD-Ran-Out-Add: the run-out container a new batch is being added for.
  const [restocking, setRestocking] = useState<ContainerEntry | null>(null);
  // Plan a meal's Name and Time (CD-Plan-Meal).
  const [planName, setPlanName] = useState(() => plan?.name ?? "");
  const [planTime, setPlanTime] = useState<string | null>(() => plan?.time ?? null);

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
  const savePlan = useSavePlannedMeal(babyId);
  const planning = mode === "plan";
  const mutation = planning ? savePlan : mode === "edit" ? updateMeal : createMeal;
  const offline = useIsOffline();
  // Offline a save pauses rather than fails: say neither "Saving…" nor
  // "Couldn't…", and keep every control usable (ledger 766, M9).
  const busy = mutation.isPending && !offline;
  // A plan takes nothing from a container yet, so nothing "runs out" here.
  const runOut = planning ? undefined : ranOutEntry(plate);
  // A planned meal's plate can hold a food deleted since (SPEC §3.5).
  const deletedFood = mode === "planServe" ? deletedFoodEntry(plate) : undefined;
  const blocked = runOut ?? deletedFood;
  const leftoverSource = plateLeftoverSource(plate);
  const serve = mode === "serve" || mode === "planServe";

  const { errors, attemptSubmit } = useSubmitValidation(
    { itemCount: plate.length, nothingCounts: nothingCounts(plate), leftoversOpen, leftoverBestBy, name: planName },
    planning ? validatePlanMeal : validatePlate,
    PLATE_FIELD_ORDER,
    { name: "plan-name", items: "plate-add-more", leftoverBestBy: "log-food-leftover-best-by" },
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
    if (postSave === "noop" || mutation.isPending || offline || blocked) return;
    if (!attemptSubmit()) return;
    // A leave-out the recipe lost on another device: drop it, and the
    // recipe refetches (the mutation hooks), so the next save goes through.
    const dropStale = (error: unknown) => {
      const stale = staleLeaveOut(error);
      if (stale) dispatch({ type: "dropLeftOut", ...stale });
    };
    if (planning && plan) {
      const planInput = { name: planName.trim(), time: planTime, items: toPlanInput(plate) };
      // Nothing changed: leave without a write, so a day nothing was planned
      // on keeps following Daily meals (804).
      const unchanged =
        plan.slotId !== null &&
        planInput.name === plan.name &&
        planInput.time === plan.time &&
        JSON.stringify(planInput.items) === JSON.stringify(toPlanInput(initialPlate));
      if (unchanged) {
        finish();
        return;
      }
      savePlan.mutate(
        { date: plan.date, slotId: plan.slotId, today: plan.today, input: planInput },
        {
          onSuccess: finish,
          onError: (error) => {
            dropStale(error);
            const served = servedMealId(error);
            if (served || isPlanChanged(error)) onPlanGone?.(served);
          },
        },
      );
      return;
    }
    const input = toMealInput(plate, { servedAt, reactionNote, notes });
    if (mode === "planServe" && plan?.slotId) {
      // Linked to its planned meal in the same write (SPEC §3.5).
      createMeal.mutate(
        { ...input, plannedMealId: plan.slotId, tz: deviceTimeZone() },
        {
          onSuccess: finish,
          onError: (error) => {
            dropStale(error);
            const served = servedMealId(error);
            if (served || isPlanChanged(error)) onPlanGone?.(served);
          },
        },
      );
      return;
    }
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
    <>
      {/* `noValidate`: the plate answers its own required field inline (item 236). */}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {/* CD-Serve-Ran-Out: why the save waits. The row says what to do. */}
        {blocked && (
          <p
            id="plate-ran-out"
            role="status"
            className={`${NOTICE} bg-[var(--color-caution-soft)] text-[var(--color-caution-soft-text)]`}
          >
            <WarningGlyph />
            {blockedLine(blocked, mode === "planServe" ? plan?.name : undefined, serve)}
          </p>
        )}
        {planning &&
          planMealFields({
            name: planName,
            onNameChange: setPlanName,
            nameError: errors.name,
            day: plan ? planDayLabel(plan.date, plan.today) : "",
            time: planTime,
            onTimeChange: setPlanTime,
            disabled: busy,
          })}
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
            {plate.length > 0 && !planning && <p className="text-xs text-[var(--color-text-muted)]">Stars are optional.</p>}
          </div>
          {plate.length > 0 && (
            <ul aria-labelledby="plate-items-label" className="flex flex-col gap-2">
              {plate.map((entry) => (
                <PlateItemRow
                  key={entryKey(entry)}
                  entry={entry}
                  dispatch={dispatch}
                  disabled={busy}
                  planning={planning}
                  onAddToStorage={setRestocking}
                  offline={offline}
                />
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

        {/* Plan a meal has no When, Reaction or Notes until it is served (SPEC §5). */}
        {!planning && (
          <>
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
          </>
        )}

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

        {/* A `meal_changed` refusal reloads the plate, which says so itself; a
            plan's "served" or "gone" answer leaves the page. */}
        {mutation.isError &&
          !offline &&
          !blocked &&
          !isMealChanged(mutation.error) &&
          !isPlanChanged(mutation.error) &&
          !servedMealId(mutation.error) && (
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
              disabled={busy || offline || Boolean(blocked)}
              aria-describedby={offline ? "plate-offline" : blocked ? "plate-ran-out" : undefined}
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
            requireContainer={mode === "serve"}
            onClose={() => setAddingMore(false)}
            onDone={(change) => {
              dispatch({ type: "addMore", change });
              setAddingMore(false);
            }}
          />
        )}
      </form>
      {/* CD-Ran-Out-Add, outside the plate's form: a portal's submit still
          bubbles through React's tree, and would serve the meal. Nothing is
          logged here; closing it changes nothing. */}
      {restocking && (
        <Sheet open onClose={() => setRestocking(null)} title="Add to storage" showClose fixedHeight>
          <AddStorageItemForm
            prefill={restockPrefill(restocking)}
            via="plate_ran_out"
            onAdded={(items) => dispatch({ type: "replaceContainer", key: entryKey(restocking), items })}
            onDone={() => setRestocking(null)}
          />
        </Sheet>
      )}
    </>
  );
}

/** The status line over a plate that can't be saved yet: a run-out
 * container, or a planned food deleted since. On a planned meal it names
 * the meal (903b's wording); elsewhere "this meal". */
export function blockedLine(entry: ContainerEntry | { kind: "food"; food: { name: string } }, meal: string | undefined, serve: boolean): string {
  if (entry.kind === "food") return foodDeletedBlocked(entry.food.name, meal ?? "this meal");
  if (meal) return containerGoneBlocked(entry.title, meal, entry.container?.status === "discarded" ? "discarded" : "finished");
  return `${entry.title} has run out, so this meal isn't ${serve ? "served" : "saved"} yet.`;
}

/** The look of a one-line field (the app's Input), for Day and Time. */
const PLAN_FIELD_BOX =
  "flex h-11 items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-[15px] font-medium whitespace-nowrap text-[var(--color-text)]";

const GLYPH = {
  "aria-hidden": true,
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  className: "shrink-0 text-[var(--color-icon)]",
} as const;

interface PlanMealFieldsProps {
  name: string;
  onNameChange: (name: string) => void;
  nameError: string | undefined;
  /** The Day field's text ("Today", "Thu, Oct 15"). */
  day: string;
  time: string | null;
  onTimeChange: (time: string | null) => void;
  disabled: boolean;
}

/**
 * Plan a meal's own fields (CD-Plan-Meal): Name, the one place a meal is
 * renamed (810), just for this day; the Day it is on, read-only in v1 (Q7);
 * and an optional Time, through the platform's own picker. A render helper,
 * so the form's own tree holds the fields.
 */
function planMealFields({ name, onNameChange, nameError, day, time, onTimeChange, disabled }: PlanMealFieldsProps) {
  return (
    <>
      <Field label="Name" htmlFor="plan-name" error={nameError} hint="Just for this day. Daily meals stay as they are.">
        <Input
          id="plan-name"
          value={name}
          maxLength={PLAN_NAME_MAX}
          autoComplete="off"
          aria-invalid={nameError ? true : undefined}
          disabled={disabled}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </Field>
      <div className="flex gap-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium text-[var(--color-text)]">Day</span>
          <p className={PLAN_FIELD_BOX}>
            <svg {...GLYPH}>
              <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
              <path d="M3.5 10h17M8 3v4M16 3v4" />
            </svg>
            <span className="min-w-0 truncate">{day}</span>
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <Field label="Time (optional)" htmlFor="plan-time">
            <div
              className={`${PLAN_FIELD_BOX} relative has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-accent)]`}
            >
              <svg {...GLYPH}>
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 7.5V12l3 2" />
              </svg>
              <span aria-hidden="true" className={time ? "" : "text-[var(--color-text-muted)]"}>
                {time ? mealTimeLabel(time) : "Add time"}
              </span>
              <input id="plan-time" disabled={disabled} {...nativeTimeInput(time, onTimeChange)} />
            </div>
          </Field>
        </div>
      </div>
    </>
  );
}
