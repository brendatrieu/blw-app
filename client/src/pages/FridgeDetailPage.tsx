import { Navigate, useParams } from "react-router-dom";
import { useFridgeItems, useFridgeStatusChange } from "../features/fridge/hooks.js";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { FridgeItemCard, fridgeItemEmoji } from "../features/fridge/components/FridgeItemCard.js";
import { FridgeItemActionsMenu } from "../features/fridge/components/FridgeItemActionsMenu.js";
import { FridgeStatusBanner } from "../features/fridge/components/FridgeStatusBanner.js";
import { fridgeItemTitle } from "../features/fridge/format.js";
import { MealsFromBatch } from "../features/tracking/components/MealsFromBatch.js";
import { BackButton } from "../components/ui/BackButton.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { Skeleton, SkeletonList } from "../components/ui/Skeleton.js";

/**
 * Full-screen detail view for a single fridge item, reached by tapping a
 * `FridgeItemCard` on Home or the Fridge page (see the card's `linkable`
 * prop). There's no single-item fetch endpoint, so — like `FridgeEditPage` —
 * the item is located by id, here across BOTH the "active" and "history"
 * fridge views (an edit only ever targets an active item, but a detail page
 * reached from History must still resolve a finished/discarded one). An id
 * found in neither redirects to /fridge instead of rendering a dead page.
 *
 * The body reuses `FridgeItemCard` itself (with `linkable={false}` so it
 * doesn't link to the very page it's rendered on) — the same Serve/Edit/
 * Remove/Restore affordances and mutations `FridgePage` wires up, just
 * standing alone under this page's own title instead of inside a list row.
 */
export function FridgeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const active = useFridgeItems("active");
  const history = useFridgeItems("history");
  const { activeBaby } = useActiveBaby();
  const { recentChange, setStatus, undo, isPending } = useFridgeStatusChange();

  const isLoading = active.isLoading || history.isLoading;
  const item =
    active.data?.items.find((candidate) => candidate.id === id) ??
    history.data?.items.find((candidate) => candidate.id === id) ??
    null;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <BackButton fallback="/fridge" />
        <Skeleton className="h-6 w-2/3" />
        <SkeletonList count={1} />
      </div>
    );
  }

  if (!item) {
    return <Navigate to="/fridge" replace />;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title={fridgeItemTitle(item)}
        emoji={fridgeItemEmoji(item)}
        leading={<BackButton fallback="/fridge" />}
      />

      {recentChange && <FridgeStatusBanner change={recentChange} onUndo={undo} />}

      <ul className="flex flex-col gap-2">
        {/* Same kebab as Home and the Fridge tab (user: cards carry the
            kebab everywhere); Remove/Restore run through the undoable
            status setter so the banner above still works here. */}
        <FridgeItemCard
          item={item}
          busy={isPending}
          linkable={false}
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
      </ul>

      <MealsFromBatch babyId={activeBaby?.id} fridgeItemId={item.id} />
    </div>
  );
}
