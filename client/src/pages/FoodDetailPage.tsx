import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { FoodDetail } from "@blw/shared";
import { useFood } from "../features/catalog/hooks.js";
import { FoodBadges } from "../features/catalog/components/FoodBadges.js";
import { Badge } from "../features/catalog/components/Badge.js";
import { levelLabel } from "../features/catalog/constants.js";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { useCreateServeLog, useServeLogs } from "../features/tracking/hooks.js";

const PREP_STAGES = [
  { key: "prep6m" as const, label: "6-8 months" },
  { key: "prep9m" as const, label: "9-11 months" },
  { key: "prep12m" as const, label: "12+ months" },
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
        <Link to="/settings" className="underline" style={{ color: "var(--color-primary)" }}>
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
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-contrast)]"
          >
            Mark as served
          </button>
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
          className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Date</span>
            <input
              type="date"
              value={servedDate}
              max={todayForDateInput()}
              onChange={(e) => setServedDate(e.target.value)}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Reaction note (optional)</span>
            <textarea
              value={reactionNote}
              onChange={(e) => setReactionNote(e.target.value)}
              rows={2}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)]"
            />
          </label>
          {createServeLog.isError && (
            <p className="text-xs text-[var(--color-danger)]">Couldn't save that — try again.</p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createServeLog.isPending}
              className="flex-1 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-contrast)] disabled:opacity-60"
            >
              {createServeLog.isPending ? "Saving…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text)]"
            >
              Cancel
            </button>
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

      <MarkAsServed food={food} />

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
