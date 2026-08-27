import { useEffect, useRef, useState } from "react";
import type { PantryItem, PantryStatus, PantryView } from "@blw/shared";
import { usePantryItems, useUpdatePantryItem } from "../features/pantry/hooks.js";
import { PantryItemCard } from "../features/pantry/components/PantryItemCard.js";
import { pantryItemTitle } from "../features/pantry/format.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { ButtonLink } from "../components/ui/Button.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { SkeletonList } from "../components/ui/Skeleton.js";

const UNDO_WINDOW_MS = 6_000;

interface RecentChange {
  id: string;
  title: string;
  from: PantryStatus;
  to: PantryStatus;
}

export function PantryPage() {
  const [view, setView] = useState<PantryView>("active");
  const [recentChange, setRecentChange] = useState<RecentChange | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>();

  const { data, isLoading, isError } = usePantryItems(view);
  const updateItem = useUpdatePantryItem();

  useEffect(() => {
    return () => clearTimeout(undoTimer.current);
  }, []);

  function announceChange(item: PantryItem, from: PantryStatus, to: PantryStatus) {
    clearTimeout(undoTimer.current);
    setRecentChange({ id: item.id, title: pantryItemTitle(item), from, to });
    undoTimer.current = setTimeout(() => setRecentChange(null), UNDO_WINDOW_MS);
  }

  function setStatus(item: PantryItem, status: PantryStatus, announce: boolean) {
    updateItem.mutate(
      { id: item.id, input: { status } },
      { onSuccess: (updated) => announce && announceChange(updated, item.status, status) },
    );
  }

  function handleUndo() {
    if (!recentChange) return;
    updateItem.mutate({ id: recentChange.id, input: { status: recentChange.from } });
    clearTimeout(undoTimer.current);
    setRecentChange(null);
  }

  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title="Pantry"
        emoji="🧺"
        action={
          <ButtonLink to="/pantry/add" size="sm">
            + Add item
          </ButtonLink>
        }
      />

      <div className="flex gap-1.5">
        {(["active", "history"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setView(tab)}
            aria-pressed={view === tab}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              view === tab
                ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
                : "border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text)]"
            }`}
          >
            {tab === "active" ? "Active" : "History"}
          </button>
        ))}
      </div>

      {recentChange && (
        <div className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-[var(--color-callout-bg)] px-3 py-2 text-sm text-[var(--color-text)]">
          <span>
            {recentChange.to === "finished" ? "Marked finished: " : "Marked discarded: "}
            {recentChange.title}
          </span>
          <button
            type="button"
            onClick={handleUndo}
            className="font-semibold text-[var(--color-primary)] underline"
          >
            Undo
          </button>
        </div>
      )}

      {isLoading && <SkeletonList count={4} />}
      {isError && <p className="text-sm text-[var(--color-danger)]">Couldn't load the pantry.</p>}

      {!isLoading && !isError && items.length === 0 && (
        <EmptyState
          icon="🥣"
          title={view === "active" ? "Nothing in the pantry yet" : "Nothing finished or discarded yet"}
          description={
            view === "active" ? "Add what you prepped so you don't lose track of it." : undefined
          }
          action={
            view === "active" ? (
              <ButtonLink to="/pantry/add" size="sm" variant="secondary">
                + Add item
              </ButtonLink>
            ) : undefined
          }
        />
      )}

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <PantryItemCard
            key={item.id}
            item={item}
            busy={updateItem.isPending}
            onFinish={item.status === "active" ? () => setStatus(item, "finished", true) : undefined}
            onDiscard={item.status === "active" ? () => setStatus(item, "discarded", true) : undefined}
            editHref={item.status === "active" ? `/pantry/${item.id}/edit` : undefined}
            onRestore={item.status !== "active" ? () => setStatus(item, "active", false) : undefined}
          />
        ))}
      </ul>
    </div>
  );
}
