import { Link, useParams } from "react-router-dom";
import type { FoodDetail } from "@blw/shared";
import { useFood } from "../features/catalog/hooks.js";
import { FoodBadges } from "../features/catalog/components/FoodBadges.js";
import { Badge } from "../features/catalog/components/Badge.js";
import { levelLabel } from "../features/catalog/constants.js";
import { getFoodEmoji } from "../features/catalog/foodEmoji.js";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { useMeals } from "../features/tracking/hooks.js";
import { BackButton } from "../components/ui/BackButton.js";
import { ButtonLink } from "../components/ui/Button.js";
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
          {getFoodEmoji(food.slug, food.category)}
        </span>
        <div className="flex flex-col items-center gap-2">
          <h1 className="font-display text-[var(--color-text)]">{food.name}</h1>
          <FoodBadges food={food} />
        </div>
      </div>

      <MarkAsServed food={food} />

      {food.chokingNotes && (
        <div className="flex flex-col gap-1 rounded-[var(--radius-lg)] border-2 border-[var(--color-danger)] bg-[var(--color-bg-elevated)] p-4">
          <p className="font-caption text-[var(--color-danger)]">⚠️ Choking notes</p>
          <p className="text-sm text-[var(--color-text)]">{food.chokingNotes}</p>
        </div>
      )}

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

      {food.notes && (
        <section>
          <h2 className="font-h2 text-[var(--color-text)]">Notes</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{food.notes}</p>
        </section>
      )}

      {food.pairings.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-h2 text-[var(--color-text)]">Vitamin-C pairings</h2>
          <div className="scroll-momentum flex gap-2 overflow-x-auto pb-1">
            {food.pairings.map((pairing) => (
              <CardLink
                key={pairing.food.slug}
                to={`/foods/${pairing.food.slug}`}
                padding="sm"
                className="flex min-w-[11rem] flex-shrink-0 flex-col gap-1"
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
            {food.recipes.map((recipe) => (
              <CardLink key={recipe.id} to={`/recipes/${recipe.id}`} padding="sm" className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-[var(--color-text)]">{recipe.title}</span>
                <Badge tone="neutral">{recipe.minAgeMonths}m+</Badge>
              </CardLink>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
