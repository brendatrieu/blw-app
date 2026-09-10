import { AddFridgeItemForm } from "../features/fridge/components/AddFridgeItemForm.js";
import { useBackNavigate } from "../components/ui/BackButton.js";
import { CloseButton } from "../components/ui/CloseButton.js";
import { PageHeader } from "../components/ui/PageHeader.js";

/**
 * Full-screen replacement for the old inline "add to fridge" panel.
 * Reached from Home's "Add to fridge" action, the expiring-soon
 * empty-state CTA, and FridgePage's "+ Add item" button — all three now
 * simply link here instead of opening in-place state.
 */
export function FridgeAddPage() {
  const goBack = useBackNavigate("/fridge");

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title="Add to fridge" emoji="🧊" leading={<CloseButton fallback="/fridge" />} />
      <AddFridgeItemForm onDone={goBack} />
    </div>
  );
}
