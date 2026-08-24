import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import type { AgeStage } from "@blw/shared";
import { ageInMonths } from "@blw/shared";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { useRecipe } from "../features/catalog/hooks.js";
import { stageForAge } from "../features/catalog/stage.js";
import { Badge } from "../features/catalog/components/Badge.js";
import { allergenLabel } from "../features/catalog/constants.js";
import { useIsFavorited, useToggleFavorite } from "../features/tracking/hooks.js";
import { apiPost } from "../lib/api.js";
import { Button } from "../components/ui/Button.js";
import { Skeleton } from "../components/ui/Skeleton.js";

const AGE_STAGES: { value: AgeStage; label: string }[] = [
  { value: "6", label: "6mo" },
  { value: "9", label: "9mo" },
  { value: "12", label: "12mo" },
];

type PantryLocation = "fridge" | "freezer" | "counter";

const PANTRY_LOCATIONS: { value: PantryLocation; label: string }[] = [
  { value: "fridge", label: "Fridge" },
  { value: "freezer", label: "Freezer" },
  { value: "counter", label: "Counter" },
];

interface FavoriteHeartProps {
  recipeId: string;
  title: string;
  minAgeMonths: number;
  ironFocus: boolean;
  allergens: string[];
}

function FavoriteHeart({ recipeId, title, minAgeMonths, ironFocus, allergens }: FavoriteHeartProps) {
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
          target: { recipeId, title, minAgeMonths, ironFocus, allergens },
          favorited,
        })
      }
      className="rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60"
      style={{
        borderColor: favorited ? "var(--color-danger)" : "var(--color-border)",
        color: favorited ? "var(--color-danger)" : "var(--color-text)",
        backgroundColor: "var(--color-bg-elevated)",
      }}
    >
      {favorited ? "♥ Favorited" : "♡ Favorite"}
    </button>
  );
}

interface PrepThisProps {
  recipeId: string;
}

function PrepThis({ recipeId }: PrepThisProps) {
  const [open, setOpen] = useState(false);
  const prepped = useMutation({
    mutationFn: (location: PantryLocation) =>
      // The pantry endpoint ships from a parallel-phase agent; this route
      // isn't owned here, only the request against its documented contract.
      apiPost<unknown>("/api/pantry", { recipeId, location, preparedAt: new Date().toISOString() }),
  });

  if (prepped.isSuccess) {
    return <p className="text-sm font-medium text-[var(--color-primary)]">Added to your pantry.</p>;
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        I prepped this
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
      <p className="text-xs font-medium text-[var(--color-text-muted)]">Where's it stored?</p>
      <div className="flex gap-1.5">
        {PANTRY_LOCATIONS.map((loc) => (
          <button
            key={loc.value}
            type="button"
            disabled={prepped.isPending}
            onClick={() => prepped.mutate(loc.value)}
            className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-xs font-medium text-[var(--color-text)] disabled:opacity-60"
          >
            {prepped.isPending ? "Saving…" : loc.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full px-3 py-1 text-xs font-medium text-[var(--color-text-muted)]"
        >
          Cancel
        </button>
      </div>
      {prepped.isError && <p className="text-xs text-[var(--color-danger)]">Couldn't save that — try again.</p>}
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
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }
  if (isError || !recipe) {
    return <p className="p-4 text-sm text-[var(--color-danger)]">Couldn't find that recipe.</p>;
  }

  const activeVariant = recipe.variants.find((v) => v.ageStage === activeStage) ?? recipe.variants[0];

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-semibold text-[var(--color-text)]">{recipe.title}</h1>
          <FavoriteHeart
            recipeId={recipe.id}
            title={recipe.title}
            minAgeMonths={recipe.minAgeMonths}
            ironFocus={recipe.ironFocus}
            allergens={recipe.allergens}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">{recipe.prepMinutes} min prep</Badge>
          {recipe.ironFocus && <Badge tone="primary">Iron focus</Badge>}
          <Badge tone="neutral">{recipe.minAgeMonths}m+</Badge>
          {recipe.allergens.map((slug) => (
            <Badge key={slug} tone="danger">
              {allergenLabel(slug)}
            </Badge>
          ))}
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Ingredients</h2>
        <ul className="flex flex-col gap-1 text-sm text-[var(--color-text)]">
          {recipe.ingredients.map((ingredient) => (
            <li key={ingredient.foodSlug}>
              <span className="font-medium">{ingredient.foodName}</span> — {ingredient.quantityNote}
            </li>
          ))}
          {recipe.extraIngredients.map((extra) => (
            <li key={extra} className="text-[var(--color-text-muted)]">
              {extra}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex gap-1.5">
          {AGE_STAGES.map((stage) => {
            const available = recipe.variants.some((v) => v.ageStage === stage.value);
            const active = stage.value === activeStage;
            return (
              <button
                key={stage.value}
                type="button"
                disabled={!available}
                onClick={() => {
                  userPickedStage.current = true;
                  setActiveStage(stage.value);
                }}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  active
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
                    : "border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text)]"
                }`}
              >
                {stage.label}
              </button>
            );
          })}
        </div>

        {activeVariant && (
          <div className="flex flex-col gap-2 rounded-lg bg-[var(--color-bg-elevated)] p-3">
            <p className="text-xs font-medium text-[var(--color-text-muted)]">{activeVariant.textureNote}</p>
            <ol className="flex flex-col gap-1.5 text-sm text-[var(--color-text)]">
              {activeVariant.steps.map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-medium text-[var(--color-primary)]">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      <PrepThis recipeId={recipe.id} />
    </div>
  );
}
