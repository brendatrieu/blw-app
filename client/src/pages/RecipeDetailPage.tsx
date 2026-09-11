import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { AgeStage, RecipeDetail } from "@blw/shared";
import { ageInMonths, formatExtraIngredient } from "@blw/shared";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { useDeleteCustomRecipe, useRecipe } from "../features/catalog/hooks.js";
import { asCustomRecipeConflict } from "../features/catalog/api.js";
import { clampStageToAvailable, stageForAge } from "../features/catalog/stage.js";
import { BASIC_RECIPE_LABEL, isBasicRecipe } from "../features/catalog/basicRecipe.js";
import { Badge } from "../features/catalog/components/Badge.js";
import { RECIPES_TAB_PATH, allergenLabel, customRecipeConflictMessage } from "../features/catalog/constants.js";
import { getFoodEmoji } from "../features/catalog/foodEmoji.js";
import { useIsFavorited, useToggleFavorite } from "../features/tracking/hooks.js";
import { BackButton } from "../components/ui/BackButton.js";
import { Button, ButtonLink } from "../components/ui/Button.js";
import { DeleteConfirmActions } from "../components/ui/DeleteConfirmActions.js";
import { Skeleton } from "../components/ui/Skeleton.js";

const AGE_STAGES: { value: AgeStage; label: string }[] = [
  { value: "6", label: "6mo" },
  { value: "9", label: "9mo" },
  { value: "12", label: "12mo" },
];

interface FavoriteHeartProps {
  recipeId: string;
  title: string;
  minAgeMonths: number;
  ironFocus: boolean;
  vitaminCHigh: boolean;
  fiberHigh: boolean;
  allergens: string[];
}

function FavoriteHeart({
  recipeId,
  title,
  minAgeMonths,
  ironFocus,
  vitaminCHigh,
  fiberHigh,
  allergens,
}: FavoriteHeartProps) {
  const favorited = useIsFavorited(recipeId);
  const toggleFavorite = useToggleFavorite();

  return (
    <button
      type="button"
      aria-pressed={favorited}
      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
      disabled={toggleFavorite.isPending}
      onClick={() =>
        toggleFavorite.mutate({
          target: { recipeId, title, minAgeMonths, ironFocus, vitaminCHigh, fiberHigh, allergens },
          favorited,
        })
      }
      // The spring easing overshoots on the scale transition itself, so
      // toggling between the two scale values reads as a little heart-pop —
      // no keyframe needed, and it collapses to an instant swap for
      // reduced-motion users via motion-reduce:transition-none.
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-pill)] border px-3.5 py-1.5 text-sm font-medium transition-[transform,background-color,border-color,color] duration-[var(--duration-base)] ease-[var(--ease-spring)] motion-reduce:transition-none motion-reduce:scale-100 disabled:opacity-60 ${
        favorited
          ? "scale-105 border-transparent bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-text)]"
          : "scale-100 border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text)]"
      }`}
    >
      <span aria-hidden="true" className="text-base leading-none">
        {favorited ? "♥" : "♡"}
      </span>
      {favorited ? "Favorited" : "Favorite"}
    </button>
  );
}

interface CustomRecipeActionsProps {
  recipe: Pick<RecipeDetail, "id">;
}

/**
 * Edit + Delete for a recipe the parent owns (item 212). Delete is the same
 * two-step inline confirm the custom-food page uses — a destructive action
 * on the thing you're looking at, not a native modal.
 *
 * The 409 is the case worth spelling out: a recipe still referenced by
 * logged meals or storage items can't be deleted (those rows would be left
 * pointing at nothing), and the server sends both counts so this can name
 * exactly where to go clean up. Favorites never block — the server drops
 * the caller's own favorite row along with the recipe.
 *
 * Exported so a render test can pin the Edit/Delete markup directly: the
 * confirming state only exists after a click, and these tests have no DOM.
 */
export function CustomRecipeActions({ recipe }: CustomRecipeActionsProps) {
  const [confirming, setConfirming] = useState(false);
  const navigate = useNavigate();
  const deleteRecipe = useDeleteCustomRecipe();
  const conflict = asCustomRecipeConflict(deleteRecipe.error);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink to={`/recipes/${recipe.id}/edit`} variant="secondary" size="sm">
          Edit
        </ButtonLink>
        {confirming ? (
          <DeleteConfirmActions
            confirmLabel="Delete for good"
            pendingLabel="Deleting…"
            pending={deleteRecipe.isPending}
            onConfirm={() =>
              deleteRecipe.mutate(recipe.id, {
                onSuccess: () => navigate(RECIPES_TAB_PATH, { replace: true }),
              })
            }
            onKeep={() => setConfirming(false)}
          />
        ) : (
          <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        )}
      </div>
      {deleteRecipe.isError && (
        <p role="alert" className="text-xs font-medium text-[var(--color-danger)]">
          {conflict ? customRecipeConflictMessage(conflict) : "Couldn't delete that — try again."}
        </p>
      )}
    </div>
  );
}

export function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: recipe, isLoading, isError } = useRecipe(id);
  const { activeBaby, isLoading: isBabyLoading } = useActiveBaby();
  const [activeStage, setActiveStage] = useState<AgeStage>("6");
  const userPickedStage = useRef(false);

  // Sync the initial stage to the active baby's age once that data resolves,
  // but only until the user taps a tab themselves.
  useEffect(() => {
    if (userPickedStage.current || isBabyLoading) return;
    const stage = stageForAge(activeBaby ? ageInMonths(activeBaby.birthDate) : null);
    setActiveStage(stage);
  }, [activeBaby, isBabyLoading]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5 p-4">
        <BackButton fallback={RECIPES_TAB_PATH} />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-24 w-full rounded-[var(--radius-lg)]" />
        <Skeleton className="h-40 w-full rounded-[var(--radius-lg)]" />
      </div>
    );
  }
  if (isError || !recipe) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <BackButton fallback={RECIPES_TAB_PATH} />
        <p className="text-sm text-[var(--color-danger)]">Couldn't find that recipe.</p>
      </div>
    );
  }

  // The stage the parent (or their baby's age) asked for is a REQUEST — a
  // recipe need not carry all three. Shrimp starts at 9 months (item 253), so
  // "6" here resolves to "9", and the tab strip highlights whatever this
  // resolves to rather than the raw request: the highlighted tab and the prep
  // below it must always name the same stage.
  const resolvedStage = clampStageToAvailable(
    activeStage,
    recipe.variants.map((v) => v.ageStage),
  );
  const activeVariant = recipe.variants.find((v) => v.ageStage === resolvedStage) ?? recipe.variants[0];
  /** A custom recipe's single set of steps — empty when the parent wrote none. */
  const customSteps = recipe.variants[0]?.steps ?? [];

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-2">
        {/* The chevron shares the title's row (item 258) — the recipe has no
            PageHeader of its own, so this row IS the header. */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <BackButton fallback={RECIPES_TAB_PATH} />
            <h1 className="font-display min-w-0 text-[var(--color-text)]">{recipe.title}</h1>
          </div>
          <FavoriteHeart
            recipeId={recipe.id}
            title={recipe.title}
            minAgeMonths={recipe.minAgeMonths}
            ironFocus={recipe.ironFocus}
            vitaminCHigh={recipe.vitaminCHigh}
            fiberHigh={recipe.fiberHigh}
            allergens={recipe.allergens}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* 0 minutes isn't "instant", it's "the parent didn't say" — the
              badge is dropped rather than claiming a prep time (item 212). */}
          {recipe.prepMinutes > 0 && <Badge tone="neutral">{recipe.prepMinutes} min prep</Badge>}
          {recipe.ironFocus && <Badge tone="primary">Iron focus</Badge>}
          {recipe.vitaminCHigh && <Badge tone="sunshine">Vit C</Badge>}
          {recipe.fiberHigh && <Badge tone="leaf">Fiber</Badge>}
          <Badge tone="neutral">{recipe.minAgeMonths}m+</Badge>
          {/* Derived from the ingredient list, not stored (item 255). */}
          {isBasicRecipe(recipe.ingredients.length) && <Badge tone="neutral">{BASIC_RECIPE_LABEL}</Badge>}
          {recipe.isCustom && <Badge tone="neutral">Custom</Badge>}
          {recipe.allergens.map((slug) => (
            <Badge key={slug} tone="danger">
              {allergenLabel(slug)}
            </Badge>
          ))}
        </div>
      </div>

      {/* The same pair Home offers, in the same order and the same variants
          (item 283): logging what the baby ate and stashing what you cooked
          are the two things you do from a recipe, and neither is a
          sub-action of the other. Both are plain links carrying the recipe
          id — the full forms live at the other end. */}
      <div className="flex items-center gap-2">
        <ButtonLink to={`/log-meal?recipe=${recipe.id}`} className="flex-1">
          Log meal
        </ButtonLink>
        <ButtonLink to={`/storage/add?recipe=${recipe.id}`} variant="tonal" className="flex-1">
          Add to storage
        </ButtonLink>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-h2 text-[var(--color-text)]">Ingredients</h2>
        <ul className="flex flex-col gap-1.5">
          {/* The whole row is the link to the food's page, so nothing inside
              it may be interactive. A custom ingredient's own emoji wins over
              the slug map (item 212); `quantityNote` is "" when the parent
              gave no amount, so the dash is dropped with it. */}
          {recipe.ingredients.map((ingredient) => (
            <li key={ingredient.foodId}>
              <Link
                to={`/foods/${ingredient.foodSlug}`}
                className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-inset)] px-3 py-2 text-sm text-[var(--color-text)]"
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  {getFoodEmoji(ingredient.foodSlug, null, ingredient.foodEmoji)}
                </span>
                <span>
                  <span className="font-medium">{ingredient.foodName}</span>
                  {ingredient.quantityNote ? (
                    <span className="text-[var(--color-text-muted)]"> — {ingredient.quantityNote}</span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
          {/* An extra reads as "a drizzle of olive oil" — quantity first,
              name after, and the name alone when no quantity was given
              (item 299). The whole row is already in the muted tone a real
              ingredient's quantity note gets, so the quantity needs no
              styling of its own; `formatExtraIngredient` is shared with the
              AI recipe tool so the two can never word it differently. */}
          {recipe.extraIngredients.map((extra, index) => (
            <li
              key={`${index}-${extra.name}`}
              className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-inset)] px-3 py-2 text-sm text-[var(--color-text-muted)]"
            >
              <span aria-hidden="true" className="text-lg leading-none">
                🧂
              </span>
              {formatExtraIngredient(extra)}
            </li>
          ))}
        </ul>
      </section>

      {recipe.isCustom ? (
        // A custom recipe carries exactly ONE variant (item 203): the parent
        // wrote one set of steps, so age tabs would be three tabs where two
        // are always empty. Its textureNote is "" and is skipped entirely.
        //
        // Steps are optional (item 240), and the variant row exists either
        // way — so the section is driven by whether there are any steps, not
        // by whether there is a variant. No steps, no heading and no empty
        // box: an ingredients-only recipe is a complete recipe.
        customSteps.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className="font-h2 text-[var(--color-text)]">Steps</h2>
            <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
              <ol className="flex flex-col gap-1.5 text-sm text-[var(--color-text)]">
                {customSteps.map((step, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-medium text-[var(--color-accent)]">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        ) : null
      ) : (
      <section className="flex flex-col gap-2">
        <div className="inline-flex w-fit gap-1 rounded-[var(--radius-pill)] bg-[var(--color-bg-inset)] p-1">
          {AGE_STAGES.map((stage) => {
            const available = recipe.variants.some((v) => v.ageStage === stage.value);
            const active = stage.value === resolvedStage;
            return (
              <button
                key={stage.value}
                type="button"
                disabled={!available}
                onClick={() => {
                  userPickedStage.current = true;
                  setActiveStage(stage.value);
                }}
                className={`min-h-9 rounded-[var(--radius-pill)] px-3.5 py-1.5 text-xs font-semibold transition-[background-color,color] duration-[var(--duration-fast)] ease-[var(--ease-spring)] motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-40 ${
                  active
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)] shadow-[var(--shadow-sm)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                {stage.label}
              </button>
            );
          })}
        </div>

        {activeVariant && (
          <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
            <p className="text-xs font-medium text-[var(--color-text-muted)]">{activeVariant.textureNote}</p>
            <ol className="flex flex-col gap-1.5 text-sm text-[var(--color-text)]">
              {activeVariant.steps.map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-medium text-[var(--color-accent)]">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
      )}

      {recipe.notes && (
        <section className="flex flex-col gap-2">
          <h2 className="font-h2 text-[var(--color-text)]">Notes</h2>
          <p className="text-sm whitespace-pre-line text-[var(--color-text)]">{recipe.notes}</p>
        </section>
      )}

      {recipe.isCustom && <CustomRecipeActions recipe={recipe} />}
    </div>
  );
}
