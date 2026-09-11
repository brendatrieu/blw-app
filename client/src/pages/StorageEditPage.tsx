import { Navigate, useParams } from "react-router-dom";
import { useStorageItems } from "../features/storage/hooks.js";
import { EditStorageItemForm } from "../features/storage/components/EditStorageItemForm.js";
import { useBackNavigate } from "../components/ui/BackButton.js";
import { CloseButton } from "../components/ui/CloseButton.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { Skeleton } from "../components/ui/Skeleton.js";

/**
 * Full-screen replacement for the old inline "edit storage item" panel.
 * There's no single-item fetch endpoint, so the item is located by id in the
 * "active" storage list — the only view StoragePage ever exposes an edit
 * affordance from. An id that isn't found there (already finished/discarded,
 * deleted, or just mistyped) redirects to /storage instead of rendering a
 * broken form.
 */
export function StorageEditPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useStorageItems("active");
  const goBack = useBackNavigate("/storage");

  const item = data?.items.find((candidate) => candidate.id === id) ?? null;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <PageHeader title="Edit storage item" emoji="✏️" leading={<CloseButton fallback="/storage" />} />
        <Skeleton className="h-40 w-full rounded-[var(--radius-lg)]" />
      </div>
    );
  }

  if (!item) {
    return <Navigate to="/storage" replace />;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title="Edit storage item" emoji="✏️" leading={<CloseButton fallback="/storage" />} />
      <EditStorageItemForm item={item} onDone={goBack} />
    </div>
  );
}
