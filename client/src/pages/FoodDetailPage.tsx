import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { FoodDetail } from "@blw/shared";
import { useDeleteCustomFood, useFood } from "../features/catalog/hooks.js";
import { asCustomFoodConflict } from "../features/catalog/api.js";
import { FoodBadges } from "../features/catalog/components/FoodBadges.js";
import { Badge } from "../features/catalog/components/Badge.js";
import { CUSTOM_FOOD_SOFT_NOTE, customFoodConflictMessage, levelLabel } from "../features/catalog/constants.js";
import { getFoodEmoji } from "../features/catalog/foodEmoji.js";
import { BASIC_RECIPE_LABEL, isBasicRecipe, sortBasicRecipesFirst } from "../features/catalog/basicRecipe.js";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { useMeals } from "../features/tracking/hooks.js";
import { BackButton } from "../components/ui/BackButton.js";
import { Button, ButtonLink } from "../components/ui/Button.js";
import { CardLink } from "../components/ui/Card.js";
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
 * "Log meal" entry point + served-count fact. The old inline mini-form
 * (date-only, reaction-only) was a stripped duplicate of the real log flow;
 * per user direction it now links to /log-meal?food=<id> so serving from a
 * food page gets the FULL form — time, notes, reaction, and leftovers.
 */
function MarkAsServed({ food }: MarkAsServedProps) {
  const { activeBaby, isLoading: babyLoading } = useActiveBaby();
  // 100 is the server's max page size — best-effort count over recent meals.
  const { data: recentMeals } = useMeals(activeBaby?.id, { limit: 100 });

  const timesServed =
    recentMeals?.items.filter((meal) => meal.foods.some((mealFood) => mealFood.id === food.id)).length ?? null;

  if (babyLoading) return null;

  if (!activeBaby) {
    return (
      <p className="text-xs text-[var(--color-text-muted)]">
        <Link to="/settings" className="font-medium text-[var(--color-primary)] underline">
          Add a baby
        </Link>{" "}
        to log this as served.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <ButtonLink to={`/log-meal?food=${food.id}`}>Log meal</ButtonLink>
      {timesServed !== null && timesServed > 0 && (
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

/**
 * Edit + Delete for a food the parent owns (item 181). Delete is a two-step
 * inline confirm — the same idiom the meal log's delete uses — rather than a
 * dialog: it's a destructive action on a row, and a `window.confirm` would
 * be the only native modal left in the app.
 *
 * The 409 case is the interesting one. A food still referenced by meals or
 * pantry items can't be deleted (deleting it would strand those rows and the
 * allergen exposures counted from them), and the server answers with the two
 * counts so this can say exactly where to go clean up instead of a bare
 * "couldn't delete".
 *
 * Exported so a render test can pin the confirm/Edit/Delete markup directly
 * — the confirming state only exists after a click, and these tests have no
 * DOM to click in.
 */
export function CustomFoodActions({ food }: CustomFoodActionsProps) {
  const [confirming, setConfirming] = useState(false);
  const navigate = useNavigate();
  const deleteFood = useDeleteCustomFood();
  const conflict = asCustomFoodConflict(deleteFood.error);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink to={`/foods/${food.slug}/edit`} variant="secondary" size="sm">
          Edit
        </ButtonLink>
        {confirming ? (
          <>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={deleteFood.isPending}
              onClick={() =>
                deleteFood.mutate(
                  { id: food.id, slug: food.slug },
                  { onSuccess: () => navigate("/foods", { replace: true }) },
                )
              }
            >
              {deleteFood.isPending ? "Deleting…" : "Delete for good"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        )}
      </div>
      {deleteFood.isError && (
        <p role="alert" className="text-xs font-medium text-[var(--color-danger)]">
          {conflict ? customFoodConflictMessage(conflict) : "Couldn't delete that — try again."}
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
        </div>
      </div>

      <MarkAsServed food={food} />

      {food.isCustom && <CustomFoodActions food={food} />}

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
    </div>
  );
}
