import { useSearchParams } from "react-router-dom";
import { AddFridgeItemForm, resolveFridgePrefill } from "../features/fridge/components/AddFridgeItemForm.js";
import { useBackNavigate } from "../components/ui/BackButton.js";
import { CloseButton } from "../components/ui/CloseButton.js";
import { PageHeader } from "../components/ui/PageHeader.js";

/**
 * Full-screen replacement for the old inline "add to fridge" panel.
 * Reached from Home's "Add to fridge" action, the expiring-soon
 * empty-state CTA, FridgePage's "+ Add item" button, and — carrying a
 * subject — the "Add to fridge" button on a food or recipe page.
 *
 * That last route arrives as `/fridge/add?food=<id>` or `?recipe=<id>`, the
 * same idiom `/log-meal?food=<id>` uses. The params are read once, here,
 * and handed to the form as its initial state; `resolveFridgePrefill` holds
 * the rule so it can be tested without rendering anything.
 */
export function FridgeAddPage() {
  const goBack = useBackNavigate("/fridge");
  const [searchParams] = useSearchParams();
  const prefill = resolveFridgePrefill(searchParams);

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title="Add to fridge" emoji="🧊" leading={<CloseButton fallback="/fridge" />} />
      <AddFridgeItemForm onDone={goBack} prefill={prefill} />
    </div>
  );
}
