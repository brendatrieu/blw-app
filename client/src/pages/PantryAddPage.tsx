import { AddPantryItemForm } from "../features/pantry/components/AddPantryItemForm.js";
import { useBackNavigate } from "../components/ui/BackButton.js";
import { CloseButton } from "../components/ui/CloseButton.js";
import { PageHeader } from "../components/ui/PageHeader.js";

/**
 * Full-screen replacement for the old inline "add pantry item" panel.
 * Reached from Home's "Add pantry item" action, the expiring-soon
 * empty-state CTA, and PantryPage's "+ Add item" button — all three now
 * simply link here instead of opening in-place state.
 */
export function PantryAddPage() {
  const goBack = useBackNavigate("/pantry");

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title="Add pantry item" emoji="🧺" action={<CloseButton fallback="/pantry" />} />
      <AddPantryItemForm onDone={goBack} />
    </div>
  );
}
