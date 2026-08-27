import { Navigate, useParams } from "react-router-dom";
import { usePantryItems } from "../features/pantry/hooks.js";
import { EditPantryItemForm } from "../features/pantry/components/EditPantryItemForm.js";
import { useBackNavigate } from "../components/ui/BackButton.js";
import { CloseButton } from "../components/ui/CloseButton.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { Skeleton } from "../components/ui/Skeleton.js";

/**
 * Full-screen replacement for the old inline "edit pantry item" panel.
 * There's no single-item fetch endpoint, so the item is located by id in the
 * "active" pantry list — the only view PantryPage ever exposes an edit
 * affordance from. An id that isn't found there (already finished/discarded,
 * deleted, or just mistyped) redirects to /pantry instead of rendering a
 * broken form.
 */
export function PantryEditPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = usePantryItems("active");
  const goBack = useBackNavigate("/pantry");

  const item = data?.items.find((candidate) => candidate.id === id) ?? null;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <PageHeader title="Edit item" emoji="✏️" action={<CloseButton fallback="/pantry" />} />
        <Skeleton className="h-40 w-full rounded-[var(--radius-lg)]" />
      </div>
    );
  }

  if (!item) {
    return <Navigate to="/pantry" replace />;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title="Edit item" emoji="✏️" action={<CloseButton fallback="/pantry" />} />
      <EditPantryItemForm item={item} onDone={goBack} />
    </div>
  );
}
