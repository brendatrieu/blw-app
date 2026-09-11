import { Navigate, useParams } from "react-router-dom";
import { useStorageItems, useStorageStatusChange } from "../features/storage/hooks.js";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { StorageItemCard, storageItemEmoji } from "../features/storage/components/StorageItemCard.js";
import { StorageItemActionsMenu } from "../features/storage/components/StorageItemActionsMenu.js";
import { StorageStatusBanner } from "../features/storage/components/StorageStatusBanner.js";
import { storageItemTitle } from "../features/storage/format.js";
import { MealsFromBatch } from "../features/tracking/components/MealsFromBatch.js";
import { BackButton } from "../components/ui/BackButton.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { Skeleton, SkeletonList } from "../components/ui/Skeleton.js";

/**
 * Full-screen detail view for a single storage item, reached by tapping a
 * `StorageItemCard` on Home or the Storage page (see the card's `linkable`
 * prop). There's no single-item fetch endpoint, so — like `StorageEditPage` —
 * the item is located by id, here across BOTH the "active" and "history"
 * storage views (an edit only ever targets an active item, but a detail page
 * reached from History must still resolve a finished/discarded one). An id
 * found in neither redirects to /storage instead of rendering a dead page.
 *
 * The body reuses `StorageItemCard` itself (with `linkable={false}` so it
 * doesn't link to the very page it's rendered on) — the same Serve/Edit/
 * Remove/Restore affordances and mutations `StoragePage` wires up, just
 * standing alone under this page's own title instead of inside a list row.
 */
export function StorageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const active = useStorageItems("active");
  const history = useStorageItems("history");
  const { activeBaby } = useActiveBaby();
  const { recentChange, setStatus, undo, isPending } = useStorageStatusChange();

  const isLoading = active.isLoading || history.isLoading;
  const item =
    active.data?.items.find((candidate) => candidate.id === id) ??
    history.data?.items.find((candidate) => candidate.id === id) ??
    null;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <BackButton fallback="/storage" />
        <Skeleton className="h-6 w-2/3" />
        <SkeletonList count={1} />
      </div>
    );
  }

  if (!item) {
    return <Navigate to="/storage" replace />;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title={storageItemTitle(item)}
        emoji={storageItemEmoji(item)}
        leading={<BackButton fallback="/storage" />}
      />

      {recentChange && <StorageStatusBanner change={recentChange} onUndo={undo} />}

      <ul className="flex flex-col gap-2">
        {/* Same kebab as Home and the Storage tab (user: cards carry the
            kebab everywhere); Remove/Restore run through the undoable
            status setter so the banner above still works here. */}
        <StorageItemCard
          item={item}
          busy={isPending}
          linkable={false}
          actions={
            <StorageItemActionsMenu
              item={item}
              babyId={activeBaby?.id}
              busy={isPending}
              onRemove={() => setStatus(item, "discarded", true)}
              onRestore={() => setStatus(item, "active", false)}
            />
          }
        />
      </ul>

      <MealsFromBatch babyId={activeBaby?.id} storageItemId={item.id} />
    </div>
  );
}
