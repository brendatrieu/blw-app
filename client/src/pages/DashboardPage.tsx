import { Link } from "react-router-dom";
import { ageInMonths } from "@blw/shared";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { useAllergenProgress } from "../features/tracking/hooks.js";
import { usePantryItems } from "../features/pantry/hooks.js";
import { PantryItemCard } from "../features/pantry/components/PantryItemCard.js";
import { ButtonLink } from "../components/ui/Button.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { Skeleton, SkeletonList } from "../components/ui/Skeleton.js";

const RING_RADIUS = 40;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const ALLERGEN_TOTAL = 9;

interface AllergenRingProps {
  established: number;
  started: number;
}

function AllergenRing({ established, started }: AllergenRingProps) {
  const progressed = Math.min(established + started, ALLERGEN_TOTAL);
  const offset = RING_CIRCUMFERENCE * (1 - progressed / ALLERGEN_TOTAL);

  return (
    <svg viewBox="0 0 100 100" className="h-20 w-20 shrink-0" role="img" aria-label={`${progressed} of ${ALLERGEN_TOTAL} allergens started or established`}>
      <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="var(--color-border)" strokeWidth="10" />
      <circle
        cx="50"
        cy="50"
        r={RING_RADIUS}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={offset}
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="54" textAnchor="middle" fontSize="22" fill="var(--color-text)" fontWeight="600">
        {progressed}/{ALLERGEN_TOTAL}
      </text>
    </svg>
  );
}

function AllergenProgressSummary({ babyId }: { babyId: string }) {
  const { data, isLoading } = useAllergenProgress(babyId);

  if (isLoading || !data) {
    return <Skeleton className="h-[5.5rem] w-full rounded-xl" />;
  }

  const established = data.items.filter((item) => item.status === "established").length;
  const started = data.items.filter((item) => item.status === "started").length;
  const notStarted = data.items.length - established - started;

  return (
    <Link
      to={`/babies/${babyId}/allergens`}
      className="flex items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 transition-colors hover:border-[var(--color-primary)]"
    >
      <AllergenRing established={established} started={started} />
      <div className="flex flex-col gap-0.5 text-sm">
        <span className="font-semibold text-[var(--color-text)]">Allergen ladder</span>
        <span className="text-[var(--color-text-muted)]">{established} established, {started} started</span>
        <span className="text-[var(--color-text-muted)]">{notStarted} not started yet</span>
      </div>
    </Link>
  );
}

function ExpiringSoon() {
  const { data, isLoading } = usePantryItems("active");
  const topFive = (data?.items ?? []).slice(0, 5);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Expiring soon</h2>
        <Link to="/pantry" className="text-xs font-medium underline" style={{ color: "var(--color-primary)" }}>
          See pantry
        </Link>
      </div>

      {isLoading && <SkeletonList count={2} />}

      {!isLoading && topFive.length === 0 && (
        <EmptyState
          title="Nothing in the pantry yet"
          description="Log what you've prepped so nothing gets forgotten in the fridge."
          action={
            <ButtonLink to="/pantry" size="sm" variant="secondary">
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
        <Skeleton className="h-6 w-2/3" />
        <div className="flex gap-2">
          <Skeleton className="h-11 flex-1 rounded-lg" />
          <Skeleton className="h-11 flex-1 rounded-lg" />
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
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">
          Hi! {activeBaby.name} is {months} {months === 1 ? "month" : "months"} old.
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">Here's what's going on today.</p>
      </div>

      <div className="flex gap-2">
        <ButtonLink to="/foods" className="flex-1">
          Log a food
        </ButtonLink>
        <ButtonLink to="/pantry" variant="secondary" className="flex-1">
          Add pantry item
        </ButtonLink>
      </div>

      <ExpiringSoon />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Allergen progress</h2>
        <AllergenProgressSummary babyId={activeBaby.id} />
      </section>
    </div>
  );
}
