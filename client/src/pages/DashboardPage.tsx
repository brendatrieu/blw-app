import { Link } from "react-router-dom";
import { ageInMonths } from "@blw/shared";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { useAllergenProgress } from "../features/tracking/hooks.js";
import { usePantryItems } from "../features/pantry/hooks.js";
import { PantryItemCard } from "../features/pantry/components/PantryItemCard.js";

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
    return <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>;
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

      {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}

      {!isLoading && topFive.length === 0 && (
        <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 text-sm text-[var(--color-text-muted)]">
          Nothing in the pantry yet.{" "}
          <Link to="/pantry" className="underline" style={{ color: "var(--color-primary)" }}>
            Add what you prepped
          </Link>
          .
        </p>
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
    return <p className="p-4 text-sm text-[var(--color-text-muted)]">Loading…</p>;
  }

  if (!activeBaby) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Welcome</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Add a baby profile to start tracking foods, pantry items, and allergens.</p>
        <Link to="/settings" className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-contrast)]">
          Add a baby
        </Link>
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
        <Link
          to="/foods"
          className="flex-1 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-center text-sm font-medium text-[var(--color-primary-contrast)]"
        >
          Log a food
        </Link>
        <Link
          to="/pantry"
          className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-center text-sm font-medium text-[var(--color-text)]"
        >
          Add pantry item
        </Link>
      </div>

      <ExpiringSoon />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Allergen progress</h2>
        <AllergenProgressSummary babyId={activeBaby.id} />
      </section>
    </div>
  );
}
