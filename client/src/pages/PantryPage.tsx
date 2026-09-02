import { useState } from "react";
import type { PantryView } from "@blw/shared";
import { usePantryItems, usePantryStatusChange } from "../features/pantry/hooks.js";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { PantryItemCard } from "../features/pantry/components/PantryItemCard.js";
import { PantryStatusBanner } from "../features/pantry/components/PantryStatusBanner.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { ButtonLink } from "../components/ui/Button.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { SkeletonList } from "../components/ui/Skeleton.js";

export function PantryPage() {
  const [view, setView] = useState<PantryView>("active");
  const { data, isLoading, isError } = usePantryItems(view);
  const { recentChange, setStatus, undo, isPending } = usePantryStatusChange();
  const { activeBaby } = useActiveBaby();

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

      {recentChange && <PantryStatusBanner change={recentChange} onUndo={undo} />}

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
            busy={isPending}
            onRemove={item.status === "active" ? () => setStatus(item, "discarded", true) : undefined}
            editHref={item.status === "active" ? `/pantry/${item.id}/edit` : undefined}
            onRestore={item.status !== "active" ? () => setStatus(item, "active", false) : undefined}
            babyId={activeBaby?.id}
          />
        ))}
      </ul>
    </div>
  );
}
