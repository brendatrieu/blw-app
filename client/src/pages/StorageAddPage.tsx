import { useSearchParams } from "react-router-dom";
import { AddStorageItemForm, resolveStoragePrefill } from "../features/storage/components/AddStorageItemForm.js";
import { useBackNavigate } from "../components/ui/BackButton.js";
import { CloseButton } from "../components/ui/CloseButton.js";
import { PageHeader } from "../components/ui/PageHeader.js";

/**
 * Full-screen replacement for the old inline "add to storage" panel.
 * Reached from Home's "Add to storage" action, the expiring-soon
 * empty-state CTA, StoragePage's "+ Add item" button, and — carrying a
 * subject — the "Add to storage" button on a food or recipe page.
 *
 * That last route arrives as `/storage/add?food=<id>` or `?recipe=<id>`, the
 * same idiom `/log-meal?food=<id>` uses. The params are read once, here,
 * and handed to the form as its initial state; `resolveStoragePrefill` holds
 * the rule so it can be tested without rendering anything.
 */
export function StorageAddPage() {
  const goBack = useBackNavigate("/storage");
  const [searchParams] = useSearchParams();
  const prefill = resolveStoragePrefill(searchParams);

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title="Add to storage" emoji="📦" leading={<CloseButton fallback="/storage" />} />
      <AddStorageItemForm onDone={goBack} prefill={prefill} />
    </div>
  );
}
