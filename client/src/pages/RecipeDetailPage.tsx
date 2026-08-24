import { useState } from "react";
import { useParams } from "react-router-dom";
import type { AgeStage } from "@blw/shared";
import { useRecipe } from "../features/catalog/hooks.js";
import { Badge } from "../features/catalog/components/Badge.js";
import { allergenLabel } from "../features/catalog/constants.js";

const AGE_STAGES: { value: AgeStage; label: string }[] = [
  { value: "6", label: "6mo" },
  { value: "9", label: "9mo" },
  { value: "12", label: "12mo" },
];

export function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: recipe, isLoading, isError } = useRecipe(id);
  const [activeStage, setActiveStage] = useState<AgeStage>("6");

  if (isLoading) {
    return <p className="p-4 text-sm text-[var(--color-text-muted)]">Loading…</p>;
  }
  if (isError || !recipe) {
    return <p className="p-4 text-sm text-[var(--color-danger)]">Couldn't find that recipe.</p>;
  }

  const activeVariant = recipe.variants.find((v) => v.ageStage === activeStage) ?? recipe.variants[0];

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">{recipe.title}</h1>
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
                onClick={() => setActiveStage(stage.value)}
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

      <button
        type="button"
        disabled
        title="Coming soon — pantry tracking"
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--color-text-muted)] disabled:cursor-not-allowed"
      >
        I prepped this
      </button>
    </div>
  );
}
