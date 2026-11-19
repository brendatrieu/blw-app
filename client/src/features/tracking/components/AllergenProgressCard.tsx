import { useAllergenProgress } from "../hooks.js";
import { dueAllergens } from "../allergenRow.js";
import { Card, CardLink } from "../../../components/ui/Card.js";
import { ProgressRing } from "../../../components/ui/ProgressRing.js";
import { Skeleton } from "../../../components/ui/Skeleton.js";

const ALLERGEN_TOTAL = 9;
const LAYOUT = "flex items-center gap-4 px-4 py-3.5";

/**
 * The allergen ring with its counts written out (items 663, 747). Home's is a
 * link to the ladder; the ladder page shows the same card, plain (ledger 1011).
 */
export function AllergenProgressCard({ babyId, link = true }: { babyId: string; link?: boolean }) {
  const { data, isLoading } = useAllergenProgress(babyId);

  if (isLoading || !data) {
    return <Skeleton className="h-[6.5rem] w-full rounded-[var(--radius-lg)]" />;
  }

  const established = data.items.filter((item) => item.status === "established").length;
  const started = data.items.filter((item) => item.status === "started").length;
  const notStarted = data.items.length - established - started;
  // Reminders' rule (item 747): only established rows have a due date, and a
  // row paused for a reaction is not due.
  const due = dueAllergens(data.items).length;
  // One segment per allergen (items 663, 747): established and not due,
  // established and due, started, then the empty track, clockwise from the top.
  const segments = Array.from({ length: ALLERGEN_TOTAL }, (_, index) =>
    index < established - due
      ? "var(--color-ring-established)"
      : index < established
        ? "var(--color-apricot-graphic)"
        : index < established + started
          ? "var(--color-ring-started)"
          : "var(--color-ring-empty)",
  );
  const dueText = due > 0 ? `${due} due for a serve` : null;

  const content = (
    <>
      <ProgressRing
        segments={segments}
        label={`${established} of ${ALLERGEN_TOTAL} allergens established, ${dueText ? `${dueText}, ` : ""}${started} started`}
      >
        <span className="text-xl font-extrabold tabular-nums text-[var(--color-text)]">
          {established}/{ALLERGEN_TOTAL}
        </span>
      </ProgressRing>
      <div className="flex flex-col gap-1 text-sm">
        <span className="text-base font-bold text-[var(--color-text)]">{established} established</span>
        {dueText && (
          <span className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-[var(--color-apricot-graphic)]" />
            {dueText}
          </span>
        )}
        <span className="text-[var(--color-text-muted)]">
          {started} started · {notStarted} not started yet
        </span>
      </div>
    </>
  );

  return link ? (
    <CardLink to={`/babies/${babyId}/allergens`} padding="none" className={LAYOUT}>
      {content}
    </CardLink>
  ) : (
    <Card padding="none" className={LAYOUT}>
      {content}
    </Card>
  );
}
