import { Navigate, useParams } from "react-router-dom";
import { useFridgeItems } from "../features/fridge/hooks.js";
import { EditFridgeItemForm } from "../features/fridge/components/EditFridgeItemForm.js";
import { useBackNavigate } from "../components/ui/BackButton.js";
import { CloseButton } from "../components/ui/CloseButton.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { Skeleton } from "../components/ui/Skeleton.js";

/**
 * Full-screen replacement for the old inline "edit fridge item" panel.
 * There's no single-item fetch endpoint, so the item is located by id in the
 * "active" fridge list — the only view FridgePage ever exposes an edit
 * affordance from. An id that isn't found there (already finished/discarded,
 * deleted, or just mistyped) redirects to /fridge instead of rendering a
 * broken form.
 */
export function FridgeEditPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useFridgeItems("active");
  const goBack = useBackNavigate("/fridge");

  const item = data?.items.find((candidate) => candidate.id === id) ?? null;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <PageHeader title="Edit fridge item" emoji="✏️" leading={<CloseButton fallback="/fridge" />} />
        <Skeleton className="h-40 w-full rounded-[var(--radius-lg)]" />
      </div>
    );
  }

  if (!item) {
    return <Navigate to="/fridge" replace />;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title="Edit fridge item" emoji="✏️" leading={<CloseButton fallback="/fridge" />} />
      <EditFridgeItemForm item={item} onDone={goBack} />
    </div>
  );
}
