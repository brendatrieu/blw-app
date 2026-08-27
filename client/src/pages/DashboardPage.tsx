import { Link } from "react-router-dom";
import { ageInMonths } from "@blw/shared";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { useAllergenProgress } from "../features/tracking/hooks.js";
import { ServeLogList } from "../features/tracking/components/ServeLogList.js";
import { usePantryItems } from "../features/pantry/hooks.js";
import { PantryItemCard } from "../features/pantry/components/PantryItemCard.js";
import { ButtonLink } from "../components/ui/Button.js";
import { Card, CardLink } from "../components/ui/Card.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { ProgressRing } from "../components/ui/ProgressRing.js";
import { Skeleton, SkeletonList } from "../components/ui/Skeleton.js";

const ALLERGEN_TOTAL = 9;

function AllergenProgressSummary({ babyId }: { babyId: string }) {
  const { data, isLoading } = useAllergenProgress(babyId);

  if (isLoading || !data) {
    return <Skeleton className="h-[5.5rem] w-full rounded-[var(--radius-lg)]" />;
  }

  const established = data.items.filter((item) => item.status === "established").length;
  const started = data.items.filter((item) => item.status === "started").length;
  const notStarted = data.items.length - established - started;
  const progressed = Math.min(established + started, ALLERGEN_TOTAL);

  return (
    <CardLink to={`/babies/${babyId}/allergens`} padding="sm" className="flex items-center gap-4">
      <ProgressRing
        value={progressed / ALLERGEN_TOTAL}
        label={`${progressed} of ${ALLERGEN_TOTAL} allergens started or established`}
      >
        <span className="font-h2 text-[var(--color-text)]">
          {progressed}/{ALLERGEN_TOTAL}
        </span>
      </ProgressRing>
      <div className="flex flex-col gap-0.5 text-sm">
        <span className="font-semibold text-[var(--color-text)]">🌟 Allergen ladder</span>
        <span className="text-[var(--color-text-muted)]">
          {established} established, {started} started
        </span>
        <span className="text-[var(--color-text-muted)]">{notStarted} not started yet</span>
      </div>
    </CardLink>
  );
}

function ExpiringSoon() {
  const { data, isLoading } = usePantryItems("active");
  const topFive = (data?.items ?? []).slice(0, 5);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">⏰ Expiring soon</h2>
        <Link to="/pantry" className="text-xs font-medium text-[var(--color-primary)] underline">
          See pantry
        </Link>
      </div>

      {isLoading && <SkeletonList count={2} />}

      {!isLoading && topFive.length === 0 && (
        <EmptyState
          icon="🧺"
          title="Nothing in the pantry yet"
          description="Log what you've prepped so nothing gets forgotten in the fridge."
          action={
            <ButtonLink to="/pantry/add" size="sm" variant="secondary">
              Add what you prepped
            </ButtonLink>
          }
        />
      )}

      {topFive.length > 0 && (
        <ul className="flex flex-col gap-2">
          {topFive.map((item) => (
            <PantryItemCard key={item.id} item={item} busy />
          ))}
        </ul>
      )}
    </section>
  );
}

export function DashboardPage() {
  const { activeBaby, isLoading } = useActiveBaby();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5 p-4">
        <Skeleton className="h-20 w-full rounded-[var(--radius-lg)]" />
        <div className="flex gap-2">
          <Skeleton className="h-11 flex-1 rounded-[var(--radius-md)]" />
          <Skeleton className="h-11 flex-1 rounded-[var(--radius-md)]" />
        </div>
        <SkeletonList count={2} />
      </div>
    );
  }

  if (!activeBaby) {
    return (
      <div className="p-4">
        <EmptyState
          icon="👋"
          title="Welcome"
          description="Add a baby profile to start tracking foods, pantry items, and allergens."
          action={<ButtonLink to="/settings">Add a baby</ButtonLink>}
        />
      </div>
    );
  }

  const months = ageInMonths(activeBaby.birthDate);

  return (
    <div className="flex flex-col gap-5 p-4">
      <Card padding="md" className="flex flex-col gap-1">
        <h1 className="font-display flex items-center gap-2 text-[var(--color-text)]">
          <span aria-hidden="true">👋</span>
          Hi! {activeBaby.name} is {months} {months === 1 ? "month" : "months"} old.
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">Here's what's going on today.</p>
      </Card>

      <div className="flex gap-2">
        <ButtonLink to="/log-meal" className="flex-1">
          🍽️ Log meal
        </ButtonLink>
        <ButtonLink to="/pantry/add" variant="secondary" className="flex-1">
          🧺 Add pantry item
        </ButtonLink>
      </div>

      <ExpiringSoon />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Allergen progress</h2>
        <AllergenProgressSummary babyId={activeBaby.id} />
      </section>

      <ServeLogList babyId={activeBaby.id} />
    </div>
  );
}
