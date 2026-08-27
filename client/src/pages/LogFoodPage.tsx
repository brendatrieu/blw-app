import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { LogFoodForm } from "../features/tracking/components/LogFoodForm.js";
import { useBackNavigate } from "../components/ui/BackButton.js";
import { CloseButton } from "../components/ui/CloseButton.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { ButtonLink } from "../components/ui/Button.js";
import { Skeleton } from "../components/ui/Skeleton.js";

/**
 * Full-screen replacement for the old bottom-sheet quick-log flow. Opened
 * from Home's "Log meal" action; closing (via the header X, Cancel, a
 * successful save, or the device/browser back gesture) all resolve through
 * the same history-aware `useBackNavigate` idiom `BackButton` uses elsewhere
 * — pop back to wherever the user came from, falling back to "/" for a
 * direct/deep-linked visit with no history to pop.
 */
export function LogFoodPage() {
  const { activeBaby, isLoading } = useActiveBaby();
  const goBack = useBackNavigate("/");

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title="Log meal" action={<CloseButton fallback="/" />} />

      {isLoading && <Skeleton className="h-40 w-full rounded-[var(--radius-lg)]" />}

      {!isLoading && !activeBaby && (
        <EmptyState
          icon="👋"
          title="Add a baby first"
          description="Once a baby profile exists you can start logging foods."
          action={<ButtonLink to="/settings">Add a baby</ButtonLink>}
        />
      )}

      {!isLoading && activeBaby && <LogFoodForm babyId={activeBaby.id} onDone={goBack} />}
    </div>
  );
}
