import { useState } from "react";
import type { FridgeView } from "@blw/shared";
import { useFridgeItems, useFridgeStatusChange } from "../features/fridge/hooks.js";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { FridgeItemCard } from "../features/fridge/components/FridgeItemCard.js";
import { FridgeItemActionsMenu } from "../features/fridge/components/FridgeItemActionsMenu.js";
import { FridgeStatusBanner } from "../features/fridge/components/FridgeStatusBanner.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { ButtonLink } from "../components/ui/Button.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { SkeletonList } from "../components/ui/Skeleton.js";

export function FridgePage() {
  const [view, setView] = useState<FridgeView>("active");
  const { data, isLoading, isError } = useFridgeItems(view);
  const { recentChange, setStatus, undo, isPending } = useFridgeStatusChange();
  const { activeBaby } = useActiveBaby();

  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title="Fridge"
        emoji="🧊"
        action={
          <ButtonLink to="/fridge/add" size="sm">
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

      {recentChange && <FridgeStatusBanner change={recentChange} onUndo={undo} />}

      {isLoading && <SkeletonList count={4} />}
      {isError && <p className="text-sm text-[var(--color-danger)]">Couldn't load the fridge.</p>}

      {!isLoading && !isError && items.length === 0 && (
        <EmptyState
          icon="🥣"
          title={view === "active" ? "Nothing in the fridge yet" : "Nothing finished or discarded yet"}
          description={
            view === "active" ? "Add what you prepped so you don't lose track of it." : undefined
          }
          action={
            view === "active" ? (
              <ButtonLink to="/fridge/add" size="sm" variant="secondary">
                + Add item
              </ButtonLink>
            ) : undefined
          }
        />
      )}

      <ul className="flex flex-col gap-2">
        {/* Item 264: the Fridge tab's cards carry the same kebab Home does
            instead of their own Serve/Remove/Edit footer row — Remove and
            Restore still run through `useFridgeStatusChange` so the undo
            banner above keeps working. */}
        {items.map((item) => (
          <FridgeItemCard
            key={item.id}
            item={item}
            busy={isPending}
            actions={
              <FridgeItemActionsMenu
                item={item}
                babyId={activeBaby?.id}
                busy={isPending}
                onRemove={() => setStatus(item, "discarded", true)}
                onRestore={() => setStatus(item, "active", false)}
              />
            }
          />
        ))}
      </ul>
    </div>
  );
}
