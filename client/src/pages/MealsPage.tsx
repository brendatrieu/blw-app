import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { ServeLogList } from "../features/tracking/components/ServeLogList.js";
import { BackButton } from "../components/ui/BackButton.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { ButtonLink } from "../components/ui/Button.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { SkeletonList } from "../components/ui/Skeleton.js";

/**
 * The full food log (/meals), reached from Home's "See all". Home shows only
 * the newest few meals; this page is the same flat newest-first list, uncapped.
 */
export function MealsPage() {
  const { activeBaby, isLoading } = useActiveBaby();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <PageHeader title="Food log" emoji="📖" leading={<BackButton fallback="/" />} />
        <SkeletonList count={3} />
      </div>
    );
  }

  if (!activeBaby) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <PageHeader title="Food log" emoji="📖" leading={<BackButton fallback="/" />} />
        <EmptyState
          icon="👋"
          title="Welcome"
          description="Add a baby profile to start logging meals."
          action={<ButtonLink to="/settings">Add a baby</ButtonLink>}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title="Food log"
        emoji="📖"
        leading={<BackButton fallback="/" />}
        action={
          <ButtonLink to="/log-meal" size="sm">
            Log meal
          </ButtonLink>
        }
      />
      <ServeLogList babyId={activeBaby.id} showHeading={false} />
    </div>
  );
}
