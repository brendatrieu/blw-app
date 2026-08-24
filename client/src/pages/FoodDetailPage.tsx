import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { FoodDetail } from "@blw/shared";
import { useFood } from "../features/catalog/hooks.js";
import { FoodBadges } from "../features/catalog/components/FoodBadges.js";
import { Badge } from "../features/catalog/components/Badge.js";
import { levelLabel } from "../features/catalog/constants.js";
import { getFoodEmoji } from "../features/catalog/foodEmoji.js";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { useCreateServeLog, useServeLogs } from "../features/tracking/hooks.js";
import { BackButton } from "../components/ui/BackButton.js";
import { Button } from "../components/ui/Button.js";
import { CardLink } from "../components/ui/Card.js";
import { Field } from "../components/ui/Field.js";
import { Input, Textarea } from "../components/ui/Input.js";
import { Skeleton } from "../components/ui/Skeleton.js";

const PREP_STAGES = [
  { key: "prep6m" as const, label: "6-8 months", tone: "leaf" as const },
  { key: "prep9m" as const, label: "9-11 months", tone: "sunshine" as const },
  { key: "prep12m" as const, label: "12+ months", tone: "primary" as const },
];

/** `<input type="date">` wants a local yyyy-mm-dd, not an ISO instant. */
function todayForDateInput(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

interface MarkAsServedProps {
  food: FoodDetail;
}

function MarkAsServed({ food }: MarkAsServedProps) {
  const { activeBaby, isLoading: babyLoading } = useActiveBaby();
  // 100 is the server's max page size (serveLogsQuerySchema) — "times
  // served" is a best-effort count over the most recent logs, not an exact
  // lifetime total.
  const { data: recentLogs } = useServeLogs(activeBaby?.id, { limit: 100 });
  const createServeLog = useCreateServeLog(activeBaby?.id);
  const [open, setOpen] = useState(false);
  const [servedDate, setServedDate] = useState(() => todayForDateInput());
  const [reactionNote, setReactionNote] = useState("");

  const timesServed = recentLogs?.items.filter((item) => item.foodId === food.id).length ?? null;

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

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    createServeLog.mutate(
      {
        foodId: food.id,
        servedAt: new Date(`${servedDate}T12:00:00`).toISOString(),
        reactionNote: reactionNote.trim() || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setReactionNote("");
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {!open && (
          <Button type="button" onClick={() => setOpen(true)}>
            Mark as served
          </Button>
        )}
        {timesServed !== null && timesServed > 0 && (
          <span className="text-xs text-[var(--color-text-muted)]">
            Served {timesServed} {timesServed === 1 ? "time" : "times"} to {activeBaby.name}
          </span>
        )}
      </div>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4"
        >
          <Field label="Date" htmlFor="food-served-date">
            <Input
              id="food-served-date"
              type="date"
              value={servedDate}
              max={todayForDateInput()}
              onChange={(e) => setServedDate(e.target.value)}
            />
          </Field>
          <Field label="Reaction note (optional)" htmlFor="food-reaction-note">
            <Textarea
              id="food-reaction-note"
              value={reactionNote}
              onChange={(e) => setReactionNote(e.target.value)}
              rows={2}
            />
          </Field>
          {createServeLog.isError && (
            <p role="alert" className="text-xs text-[var(--color-danger)]">
              Couldn't save that — try again.
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={createServeLog.isPending} className="flex-1">
              {createServeLog.isPending ? "Saving…" : "Confirm"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
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
          className="flex h-24 w-24 items-center justify-center rounded-full bg-[var(--color-coral-soft)] text-5xl leading-none"
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
                  <Badge tone="accent">Vit C {levelLabel(pairing.food.vitaminCLevel)}</Badge>
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
