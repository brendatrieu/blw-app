import { Navigate, useParams } from "react-router-dom";
import { usePantryItems, usePantryStatusChange } from "../features/pantry/hooks.js";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { PantryItemCard, pantryItemEmoji } from "../features/pantry/components/PantryItemCard.js";
import { PantryStatusBanner } from "../features/pantry/components/PantryStatusBanner.js";
import { pantryItemTitle } from "../features/pantry/format.js";
import { MealsFromBatch } from "../features/tracking/components/MealsFromBatch.js";
import { BackButton } from "../components/ui/BackButton.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { Skeleton, SkeletonList } from "../components/ui/Skeleton.js";

/**
 * Full-screen detail view for a single pantry item, reached by tapping a
 * `PantryItemCard` on Home or the Pantry page (see the card's `linkable`
 * prop). There's no single-item fetch endpoint, so — like `PantryEditPage` —
 * the item is located by id, here across BOTH the "active" and "history"
 * pantry views (an edit only ever targets an active item, but a detail page
 * reached from History must still resolve a finished/discarded one). An id
 * found in neither redirects to /pantry instead of rendering a dead page.
 *
 * The body reuses `PantryItemCard` itself (with `linkable={false}` so it
 * doesn't link to the very page it's rendered on) — the same Serve/Edit/
 * Remove/Restore affordances and mutations `PantryPage` wires up, just
 * standing alone under this page's own title instead of inside a list row.
 */
export function PantryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const active = usePantryItems("active");
  const history = usePantryItems("history");
  const { activeBaby } = useActiveBaby();
  const { recentChange, setStatus, undo, isPending } = usePantryStatusChange();

  const isLoading = active.isLoading || history.isLoading;
  const item =
    active.data?.items.find((candidate) => candidate.id === id) ??
    history.data?.items.find((candidate) => candidate.id === id) ??
    null;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <BackButton fallback="/pantry" />
        <Skeleton className="h-6 w-2/3" />
        <SkeletonList count={1} />
      </div>
    );
  }

  if (!item) {
    return <Navigate to="/pantry" replace />;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <BackButton fallback="/pantry" />
      <PageHeader title={pantryItemTitle(item)} emoji={pantryItemEmoji(item)} />

      {recentChange && <PantryStatusBanner change={recentChange} onUndo={undo} />}

      <ul className="flex flex-col gap-2">
        <PantryItemCard
          item={item}
          busy={isPending}
          linkable={false}
          onRemove={item.status === "active" ? () => setStatus(item, "discarded", true) : undefined}
          editHref={item.status === "active" ? `/pantry/${item.id}/edit` : undefined}
          onRestore={item.status !== "active" ? () => setStatus(item, "active", false) : undefined}
          babyId={activeBaby?.id}
        />
      </ul>

      <MealsFromBatch babyId={activeBaby?.id} pantryItemId={item.id} />
    </div>
  );
}
