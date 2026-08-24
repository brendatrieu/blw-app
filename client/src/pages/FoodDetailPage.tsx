import { Link, useParams } from "react-router-dom";
import { useFood } from "../features/catalog/hooks.js";
import { FoodBadges } from "../features/catalog/components/FoodBadges.js";
import { Badge } from "../features/catalog/components/Badge.js";
import { levelLabel } from "../features/catalog/constants.js";

const PREP_STAGES = [
  { key: "prep6m" as const, label: "6-8 months" },
  { key: "prep9m" as const, label: "9-11 months" },
  { key: "prep12m" as const, label: "12+ months" },
];

export function FoodDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: food, isLoading, isError } = useFood(slug);

  if (isLoading) {
    return <p className="p-4 text-sm text-[var(--color-text-muted)]">Loading…</p>;
  }
  if (isError || !food) {
    return <p className="p-4 text-sm text-[var(--color-danger)]">Couldn't find that food.</p>;
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">{food.name}</h1>
        <FoodBadges food={food} />
      </div>

      {food.chokingNotes && (
        <div className="rounded-lg border border-[var(--color-danger)] bg-[var(--color-bg-elevated)] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-danger)]">Choking notes</p>
          <p className="mt-1 text-sm text-[var(--color-text)]">{food.chokingNotes}</p>
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Prep by age</h2>
        {PREP_STAGES.map((stage) => (
          <div key={stage.key} className="rounded-lg bg-[var(--color-bg-elevated)] p-3">
            <p className="text-xs font-medium text-[var(--color-text-muted)]">{stage.label}</p>
            <p className="mt-1 text-sm text-[var(--color-text)]">{food[stage.key]}</p>
          </div>
        ))}
      </section>

      {food.notes && (
        <section>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Notes</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{food.notes}</p>
        </section>
      )}

      {food.pairings.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Vitamin-C pairings</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {food.pairings.map((pairing) => (
              <Link
                key={pairing.food.slug}
                to={`/foods/${pairing.food.slug}`}
                className="flex min-w-[10rem] flex-shrink-0 flex-col gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-[var(--color-text)]">{pairing.food.name}</span>
                  <Badge tone="accent">Vit C {levelLabel(pairing.food.vitaminCLevel)}</Badge>
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">{pairing.reason}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {food.recipes.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Recipes with {food.name.toLowerCase()}</h2>
          <div className="flex flex-col gap-2">
            {food.recipes.map((recipe) => (
              <Link
                key={recipe.id}
                to={`/recipes/${recipe.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3"
              >
                <span className="text-sm font-medium text-[var(--color-text)]">{recipe.title}</span>
                <Badge tone="neutral">{recipe.minAgeMonths}m+</Badge>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
