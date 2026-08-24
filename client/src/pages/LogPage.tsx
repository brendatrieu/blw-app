import { useMemo, useState } from "react";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { useFoods } from "../features/catalog/hooks.js";
import { useCreateServeLog, useDeleteServeLog, useServeLogs } from "../features/tracking/hooks.js";
import type { ServeLogItem } from "@blw/shared";
import { getFoodEmoji } from "../features/catalog/foodEmoji.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { Button, ButtonLink } from "../components/ui/Button.js";
import { Card } from "../components/ui/Card.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { Field } from "../components/ui/Field.js";
import { Input, Textarea } from "../components/ui/Input.js";
import { Select } from "../components/ui/Select.js";
import { Skeleton, SkeletonList } from "../components/ui/Skeleton.js";

/** yyyy-mm-dd in the viewer's local timezone, used to group the timeline by day. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!);
  const today = new Date();
  const todayKey = dayKey(today.toISOString());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === todayKey) return "Today";
  if (key === dayKey(yesterday.toISOString())) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** `<input type="datetime-local">` wants local wall-clock time, no offset. */
function nowForDateTimeLocal(): string {
  const now = new Date();
  now.setSeconds(0, 0);
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
}

interface QuickLogFormProps {
  babyId: string;
  onDone: () => void;
}

function QuickLogForm({ babyId, onDone }: QuickLogFormProps) {
  const { data: foodsData, isLoading: foodsLoading } = useFoods();
  const createServeLog = useCreateServeLog(babyId);
  const [foodId, setFoodId] = useState("");
  const [servedAt, setServedAt] = useState(() => nowForDateTimeLocal());
  const [reactionNote, setReactionNote] = useState("");

  const foods = foodsData?.foods ?? [];

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!foodId) return;
    createServeLog.mutate(
      {
        foodId,
        servedAt: new Date(servedAt).toISOString(),
        reactionNote: reactionNote.trim() || undefined,
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4"
    >
      <Field label="Food" htmlFor="quick-log-food">
        <Select
          id="quick-log-food"
          required
          value={foodId}
          onChange={(e) => setFoodId(e.target.value)}
        >
          <option value="" disabled>
            {foodsLoading ? "Loading foods…" : "Select a food"}
          </option>
          {foods.map((food) => (
            <option key={food.id} value={food.id}>
              {food.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="When" htmlFor="quick-log-when">
        <Input
          id="quick-log-when"
          type="datetime-local"
          value={servedAt}
          max={nowForDateTimeLocal()}
          onChange={(e) => setServedAt(e.target.value)}
        />
      </Field>

      <Field label="Reaction note (optional)" htmlFor="quick-log-note">
        <Textarea
          id="quick-log-note"
          value={reactionNote}
          onChange={(e) => setReactionNote(e.target.value)}
          rows={2}
          placeholder="e.g. mild rash around mouth"
        />
      </Field>

      {createServeLog.isError && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          Couldn't save that — try again.
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={!foodId || createServeLog.isPending} className="flex-1">
          {createServeLog.isPending ? "Logging…" : "Log it"}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

interface LogEntryRowProps {
  entry: ServeLogItem;
  babyId: string;
  pendingDeleteId: string | null;
  onRequestDelete: (id: string) => void;
  onCancelDelete: () => void;
}

function LogEntryRow({ entry, babyId, pendingDeleteId, onRequestDelete, onCancelDelete }: LogEntryRowProps) {
  const deleteServeLog = useDeleteServeLog(babyId);
  const confirming = pendingDeleteId === entry.id;

  return (
    <Card as="li" padding="sm" className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-coral-soft)] text-lg leading-none"
        >
          {getFoodEmoji(entry.foodSlug)}
        </span>
        <div className="flex flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-medium text-[var(--color-text)]">
              {entry.foodName}
              {entry.recipeTitle && (
                <span className="font-normal text-[var(--color-text-muted)]"> · {entry.recipeTitle}</span>
              )}
            </span>
            {!confirming && (
              <button
                type="button"
                onClick={() => onRequestDelete(entry.id)}
                className="shrink-0 rounded px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
              >
                Delete
              </button>
            )}
          </div>
          <span className="text-xs text-[var(--color-text-muted)]">{timeLabel(entry.servedAt)}</span>
          {entry.reactionNote && (
            <span className="mt-1 text-xs text-[var(--color-danger)]">Reaction: {entry.reactionNote}</span>
          )}
        </div>
      </div>

      {confirming && (
        <div className="flex items-center gap-2 border-t border-[var(--color-border)] pt-2">
          <span className="text-xs text-[var(--color-text-muted)]">Remove this entry?</span>
          <button
            type="button"
            disabled={deleteServeLog.isPending}
            onClick={() => deleteServeLog.mutate(entry.id, { onSettled: onCancelDelete })}
            className="rounded-[var(--radius-md)] bg-[var(--color-danger)] px-2 py-1 text-xs font-medium text-[var(--color-primary-contrast)] disabled:opacity-60"
          >
            {deleteServeLog.isPending ? "Removing…" : "Yes, delete"}
          </button>
          <button
            type="button"
            onClick={onCancelDelete}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-text)]"
          >
            Cancel
          </button>
        </div>
      )}
    </Card>
  );
}

export function LogPage() {
  const { activeBaby, isLoading: babyLoading } = useActiveBaby();
  const babyId = activeBaby?.id;
  const { data, isLoading, isError } = useServeLogs(babyId, { limit: 100 });
  const [showForm, setShowForm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const items = data?.items ?? [];
    const byDay = new Map<string, ServeLogItem[]>();
    for (const item of items) {
      const key = dayKey(item.servedAt);
      const list = byDay.get(key);
      if (list) list.push(item);
      else byDay.set(key, [item]);
    }
    return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [data]);

  if (babyLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <Skeleton className="h-6 w-1/2" />
        <SkeletonList count={3} />
      </div>
    );
  }

  if (!activeBaby) {
    return (
      <div className="p-4">
        <EmptyState
          title="No baby profile yet"
          description="Add a baby profile to start logging served foods."
          action={<ButtonLink to="/settings">Add a baby</ButtonLink>}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title={`Log — ${activeBaby.name}`}
        emoji="📖"
        action={
          !showForm && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              + Log food
            </Button>
          )
        }
      />

      {showForm && <QuickLogForm babyId={activeBaby.id} onDone={() => setShowForm(false)} />}

      {isLoading && <SkeletonList count={3} />}
      {isError && <p className="text-sm text-[var(--color-danger)]">Couldn't load the log.</p>}

      {!isLoading && !isError && groups.length === 0 && (
        <EmptyState
          icon="🍽️"
          title="Nothing logged yet"
          description={'Tap "+ Log food" after the next meal.'}
        />
      )}

      <div className="flex flex-col gap-4">
        {groups.map(([key, items]) => (
          <section key={key} className="flex flex-col gap-2">
            <h2 className="font-caption uppercase tracking-wide text-[var(--color-text-muted)]">{dayLabel(key)}</h2>
            <ul className="flex flex-col gap-2">
              {items.map((entry) => (
                <LogEntryRow
                  key={entry.id}
                  entry={entry}
                  babyId={activeBaby.id}
                  pendingDeleteId={pendingDeleteId}
                  onRequestDelete={setPendingDeleteId}
                  onCancelDelete={() => setPendingDeleteId(null)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
