import { useMemo, useState } from "react";
import type { ServeLogItem } from "@blw/shared";
import { useDeleteServeLog, useServeLogs } from "../hooks.js";
import { getFoodEmoji } from "../../catalog/foodEmoji.js";
import { Card } from "../../../components/ui/Card.js";
import { ButtonLink } from "../../../components/ui/Button.js";
import { EmptyState } from "../../../components/ui/EmptyState.js";
import { SkeletonList } from "../../../components/ui/Skeleton.js";

/** yyyy-mm-dd in the viewer's local timezone, used to group the timeline by day. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dayLabel(key: string): string {
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

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
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

export interface ServeLogListProps {
  babyId: string;
}

/**
 * The day-grouped serve-log history, formerly LogPage's list half. Rendered
 * as a Home section; logging itself now happens on the full-screen
 * /log-meal page (see LogFoodPage / LogFoodForm).
 */
export function ServeLogList({ babyId }: ServeLogListProps) {
  const { data, isLoading, isError } = useServeLogs(babyId, { limit: 100 });
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

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-[var(--color-text)]">📖 Food log</h2>

      {isLoading && <SkeletonList count={3} />}
      {isError && <p className="text-sm text-[var(--color-danger)]">Couldn't load the log.</p>}

      {!isLoading && !isError && groups.length === 0 && (
        <EmptyState
          icon="🍽️"
          title="Nothing logged yet"
          description="Log what baby tried so allergen progress stays up to date."
          action={
            <ButtonLink to="/log-meal" size="sm" variant="secondary">
              Log meal
            </ButtonLink>
          }
        />
      )}

      {groups.length > 0 && (
        <div className="flex flex-col gap-4">
          {groups.map(([key, items]) => (
            <div key={key} className="flex flex-col gap-2">
              <h3 className="font-caption uppercase tracking-wide text-[var(--color-text-muted)]">{dayLabel(key)}</h3>
              <ul className="flex flex-col gap-2">
                {items.map((entry) => (
                  <LogEntryRow
                    key={entry.id}
                    entry={entry}
                    babyId={babyId}
                    pendingDeleteId={pendingDeleteId}
                    onRequestDelete={setPendingDeleteId}
                    onCancelDelete={() => setPendingDeleteId(null)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
