import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { FoodDetail, FoodListItem } from "@blw/shared";
import {
  useDeleteCustomFood,
  useFood,
  useFoods,
  useReplaceCustomFood,
  useRestoreCustomFood,
} from "../features/catalog/hooks.js";
import { FoodBadges } from "../features/catalog/components/FoodBadges.js";
import { Badge } from "../features/catalog/components/Badge.js";
import { SingleFoodPicker } from "../features/catalog/components/FoodPicker.js";
import { CUSTOM_FOOD_SOFT_NOTE, levelLabel, replaceSummary, usedInPhrase } from "../features/catalog/constants.js";
import { getFoodEmoji } from "../features/catalog/foodEmoji.js";
import { BASIC_RECIPE_LABEL, isBasicRecipe, sortBasicRecipesFirst } from "../features/catalog/basicRecipe.js";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { useMeals } from "../features/tracking/hooks.js";
import { RatingHistory, RatingSummaryRow } from "../features/tracking/components/RatingHistory.js";
import { BackButton } from "../components/ui/BackButton.js";
import { Button, ButtonLink } from "../components/ui/Button.js";
import { CardLink } from "../components/ui/Card.js";
import { ConfirmSheet } from "../components/ui/ConfirmSheet.js";
import { Field } from "../components/ui/Field.js";
import { Skeleton } from "../components/ui/Skeleton.js";

const PREP_STAGES = [
  { key: "prep6m" as const, label: "6-8 months", tone: "leaf" as const },
  { key: "prep9m" as const, label: "9-11 months", tone: "sunshine" as const },
  { key: "prep12m" as const, label: "12+ months", tone: "primary" as const },
];

interface MarkAsServedProps {
  food: FoodDetail;
}

/**
 * The food page's actions row: the same pair Home offers — primary "Log
 * meal" and tonal "Add to storage", in that order (item 282) — over the
 * served-count fact. Both are plain links carrying this food's id; the full
 * forms (time, notes, reaction, leftovers / location, servings, best-by)
 * live at the other end, which is why the old inline mini-forms are gone.
 *
 * The pair renders whether or not a baby exists: adding to storage never
 * needed one, and "Log meal" without a baby lands on the log page's own
 * "Add a baby first" state rather than being hidden here. The count and the
 * "add a baby" nudge are facts UNDER the row, not gates on it.
 */
function MarkAsServed({ food }: MarkAsServedProps) {
  const { activeBaby, isLoading: babyLoading } = useActiveBaby();
  // 100 is the server's max page size — best-effort count over recent meals.
  const { data: recentMeals } = useMeals(activeBaby?.id, { limit: 100 });

  const timesServed =
    recentMeals?.items.filter((meal) => meal.foods.some((mealFood) => mealFood.id === food.id)).length ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <ButtonLink to={`/log-meal?food=${food.id}`} className="flex-1">
          Log meal
        </ButtonLink>
        <ButtonLink to={`/storage/add?food=${food.id}`} variant="tonal" className="flex-1">
          Add to storage
        </ButtonLink>
      </div>
      {!babyLoading && !activeBaby && (
        <p className="text-xs text-[var(--color-text-muted)]">
          <Link to="/settings" className="font-medium text-[var(--color-primary)] underline">
            Add a baby
          </Link>{" "}
          to log this as served.
        </p>
      )}
      {activeBaby && timesServed !== null && timesServed > 0 && (
        <span className="text-xs text-[var(--color-text-muted)]">
          Served {timesServed} {timesServed === 1 ? "time" : "times"} to {activeBaby.name}
        </span>
      )}
    </div>
  );
}

interface CustomFoodActionsProps {
  food: FoodDetail;
}

/** Where a deleted food can be found again — said before and after deleting. */
export const RESTORE_HINT = "You can restore it from Foods › Deleted.";

/**
 * The food "Replace with…" starts on: the catalog food named exactly like
 * this one, ignoring case (a parent who typed "cauliflower" before the
 * catalog had it), else another of their own foods of that name. Pure.
 */
export function sameNameFood(foods: FoodListItem[], food: Pick<FoodDetail, "id" | "name">): FoodListItem | undefined {
  const name = food.name.trim().toLowerCase();
  const matches = foods.filter((candidate) => candidate.id !== food.id && candidate.name.trim().toLowerCase() === name);
  return matches.find((candidate) => !candidate.isCustom) ?? matches[0];
}

/**
 * Edit + Delete for a food the parent owns (item 181). Delete only asks
 * (item 599): it opens `DeleteFoodQuestion`, and nothing is deleted until
 * that sheet's red button is tapped.
 *
 * Exported so a render test can pin the Edit/Delete markup directly.
 */
export function CustomFoodActions({ food }: CustomFoodActionsProps) {
  const [asking, setAsking] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ButtonLink to={`/foods/${food.slug}/edit`} variant="secondary" size="sm">
        Edit
      </ButtonLink>
      <Button type="button" variant="secondary" size="sm" onClick={() => setAsking(true)}>
        Delete
      </Button>
      {/* Mounted only while asking, so every open fetches usage afresh. */}
      {asking && <DeleteFoodQuestion food={food} onClose={() => setAsking(false)} />}
    </div>
  );
}

/**
 * The delete question for a custom food (items 599-600). Delete is soft
 * (ledger 537), so nothing blocks it. Where the food is used is fetched FRESH
 * when the sheet opens — the page's cached detail can predate the meal or
 * storage item that now uses it — and the sheet says "Checking where it's
 * used…" until that answer is in. Used: it names where (zero counts left out)
 * and offers "Replace with…" another food, which moves every entry across and
 * deletes this one for good, or "Delete anyway", which leaves past entries
 * showing it as deleted. Unused: it says so, which is why only Delete is
 * offered. Either delete keeps the parent on this page, now read-only with a
 * Restore.
 *
 * Exported so a handler test can drive it as a plain function.
 */
export function DeleteFoodQuestion({ food, onClose }: { food: FoodDetail; onClose: () => void }) {
  const { data: fetched, isFetchedAfterMount, isError: checkFailed, refetch } = useFood(food.slug, { fresh: true });
  // null = untouched, so the same-name food stays preselected however late
  // the foods list arrives; "" = the parent cleared it.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const navigate = useNavigate();
  const deleteFood = useDeleteCustomFood();
  const replaceFood = useReplaceCustomFood();
  const { data } = useFoods();
  const foods = data?.foods ?? [];

  // Only an answer fetched since the sheet opened counts — never the cache.
  const checked = isFetchedAfterMount && !checkFailed ? fetched : undefined;
  const usedIn = checked?.usage ? usedInPhrase(checked.usage) : null;
  const replacementId = pickedId ?? sameNameFood(foods, food)?.id ?? "";
  const replacement = foods.find((candidate) => candidate.id === replacementId);
  const summary = checked?.usage && replacement ? replaceSummary(checked.usage, replacement.name) : null;
  const pending = deleteFood.isPending || replaceFood.isPending;
  const error =
    deleteFood.isError || replaceFood.isError
      ? replaceFood.isError
        ? "Couldn't replace that — try again."
        : "Couldn't delete that — try again."
      : undefined;

  return (
    <ConfirmSheet
      open
      onClose={onClose}
      title={`Delete ${food.name}?`}
      confirmLabel={usedIn ? "Delete anyway" : "Delete"}
      pendingLabel="Deleting…"
      pending={pending}
      {...(checked ? { onConfirm: () => deleteFood.mutate(checked) } : {})}
      error={error}
    >
      {!checked ? (
        checkFailed ? (
          <>
            <p role="alert" className="font-medium text-[var(--color-danger)]">
              Couldn't check where it's used — try again.
            </p>
            <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => void refetch()}>
              Try again
            </Button>
          </>
        ) : (
          <p role="status" className="text-[var(--color-text-muted)]">
            Checking where it's used…
          </p>
        )
      ) : usedIn ? (
        <>
          <p className="font-medium">{usedIn}.</p>
          <Field label="Replace with…" htmlFor="replace-food">
            <SingleFoodPicker id="replace-food" value={replacementId} onChange={setPickedId} excludeId={food.id} />
          </Field>
          {summary && <p className="text-xs text-[var(--color-text-muted)]">{summary}.</p>}
          <Button
            type="button"
            className="w-full"
            disabled={!replacement || pending}
            onClick={() =>
              replacement &&
              replaceFood.mutate(
                { food: checked, replacementId: replacement.id },
                { onSuccess: (result) => navigate(`/foods/${result.replacement.slug}`, { replace: true }) },
              )
            }
          >
            {replaceFood.isPending ? "Replacing…" : "Replace"}
          </Button>
          <p className="text-[var(--color-text-muted)]">
            Or delete it anyway: past entries will show it as deleted. {RESTORE_HINT}
          </p>
        </>
      ) : (
        <p>
          Nothing uses it yet, so it just comes off your foods and pickers. {RESTORE_HINT}
        </p>
      )}
    </ConfirmSheet>
  );
}

/**
 * What a deleted food's page shows instead of its actions (ledger 543): the
 * page is read-only — no Log meal, Edit or Delete — with one way back.
 */
export function DeletedFoodNotice({ food }: { food: FoodDetail }) {
  const restore = useRestoreCustomFood();
  return (
    <div className="flex flex-col items-start gap-2 rounded-[var(--radius-lg)] bg-[var(--color-bg-inset)] p-4">
      <p className="text-sm text-[var(--color-text)]">You deleted this food.</p>
      <Button type="button" variant="secondary" size="sm" disabled={restore.isPending} onClick={() => restore.mutate(food)}>
        {restore.isPending ? "Restoring…" : "Restore"}
      </Button>
      {restore.isError && (
        <p role="alert" className="text-xs font-medium text-[var(--color-danger)]">
          Couldn't restore that — try again.
        </p>
      )}
    </div>
  );
}

export function FoodDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: food, isLoading, isError } = useFood(slug);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5 p-4">
        <BackButton fallback="/foods" />
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="h-24 w-24 rounded-full" />
          <Skeleton className="h-6 w-2/3" />
        </div>
        <Skeleton className="h-11 w-40 rounded-[var(--radius-md)]" />
        <Skeleton className="h-32 w-full rounded-[var(--radius-lg)]" />
      </div>
    );
  }
  if (isError || !food) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <BackButton fallback="/foods" />
        <p className="text-sm text-[var(--color-danger)]">Couldn't find that food.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <BackButton fallback="/foods" />
      <div className="flex flex-col items-center gap-3 text-center">
        <span
          aria-hidden="true"
          className="flex h-24 w-24 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-5xl leading-none"
        >
          {getFoodEmoji(food.slug, food.category, food.emoji)}
        </span>
        <div className="flex flex-col items-center gap-2">
          <h1 className="font-display text-[var(--color-text)]">{food.name}</h1>
          <FoodBadges food={food} />
          {/* Item 585: a subtitle, like the badges; the graph is at the bottom. */}
          <RatingSummaryRow target={{ foodId: food.id }} />
        </div>
      </div>

      {food.deletedAt ? (
        <DeletedFoodNotice food={food} />
      ) : (
        <>
          <MarkAsServed food={food} />
          {food.isCustom && <CustomFoodActions food={food} />}
        </>
      )}

      {food.isCustom && (
        <p className="rounded-[var(--radius-lg)] bg-[var(--color-bg-inset)] p-4 text-sm text-[var(--color-text-muted)]">
          {CUSTOM_FOOD_SOFT_NOTE}
        </p>
      )}

      {!food.isCustom && food.chokingNotes && (
        <div className="flex flex-col gap-1 rounded-[var(--radius-lg)] border-2 border-[var(--color-danger)] bg-[var(--color-bg-elevated)] p-4">
          <p className="font-caption text-[var(--color-danger)]">⚠️ Choking notes</p>
          <p className="text-sm text-[var(--color-text)]">{food.chokingNotes}</p>
        </div>
      )}

      {/* Prep by age and the choking block above are curated catalog content.
          A custom food's columns hold empty strings and a placeholder "low"
          — the soft note above says so plainly instead. */}
      {!food.isCustom && (
        <section className="flex flex-col gap-3">
          <h2 className="font-h2 text-[var(--color-text)]">Prep by age</h2>
          {PREP_STAGES.map((stage) => (
            <div
              key={stage.key}
              className="flex flex-col gap-1.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3"
            >
              <Badge tone={stage.tone}>{stage.label}</Badge>
              <p className="text-sm text-[var(--color-text)]">{food[stage.key]}</p>
            </div>
          ))}
        </section>
      )}

      {food.notes && (
        <section>
          <h2 className="font-h2 text-[var(--color-text)]">Notes</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{food.notes}</p>
        </section>
      )}

      {food.pairings.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-h2 text-[var(--color-text)]">Vitamin-C pairings</h2>
          {/* Stacked, not a side-scroller: a pairing's reason is a sentence
              and needs the full width to wrap (user: "this should wrap"). */}
          <div className="flex flex-col gap-2">
            {food.pairings.map((pairing) => (
              <CardLink
                key={pairing.food.slug}
                to={`/foods/${pairing.food.slug}`}
                padding="sm"
                className="flex flex-col gap-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-text)]">
                    <span aria-hidden="true" className="text-lg leading-none">
                      {getFoodEmoji(pairing.food.slug)}
                    </span>
                    {pairing.food.name}
                  </span>
                  <Badge tone="sunshine">Vit C {levelLabel(pairing.food.vitaminCLevel)}</Badge>
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">{pairing.reason}</p>
              </CardLink>
            ))}
          </div>
        </section>
      )}

      {food.recipes.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-h2 text-[var(--color-text)]">Recipes with {food.name.toLowerCase()}</h2>
          <div className="flex flex-col gap-2">
            {/* Single-ingredient "Simple <food>" basics lead the list — the
                plainest way to serve this food should be the first thing a
                parent sees here (item 255). */}
            {sortBasicRecipesFirst(food.recipes).map((recipe) => (
              <CardLink key={recipe.id} to={`/recipes/${recipe.id}`} padding="sm" className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-[var(--color-text)]">{recipe.title}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {isBasicRecipe(recipe.ingredientCount) && <Badge tone="neutral">{BASIC_RECIPE_LABEL}</Badge>}
                  <Badge tone="neutral">{recipe.minAgeMonths}m+</Badge>
                </span>
              </CardLink>
            ))}
          </div>
        </section>
      )}

      {/* Item 575: loose-food meal ratings only — a recipe's rating never
          counts toward this food. A deleted food keeps its history. */}
      <RatingHistory target={{ foodId: food.id }} name={food.name} />
    </div>
  );
}
