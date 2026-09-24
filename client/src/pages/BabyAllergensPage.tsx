import { Link, useParams } from "react-router-dom";
import type { AllergenProgressItem, AllergenStatus } from "@blw/shared";
import { useAllergenProgress } from "../features/tracking/hooks.js";
import {
  ALLERGEN_RULE_COPY,
  ALLERGEN_STATUS_LABEL,
  ALLERGEN_STATUS_TONE,
  DUE_BADGE_LABEL,
  REACTION_BADGE_LABEL,
  REACTION_HINT_COPY,
  RECENCY_HINT_COPY,
  dueAllergens,
  formatAllergenDate,
  resolveAllergenRowAction,
  resolveAllergenRecency,
  servingsProgressLabel,
  showsReactionBadge,
} from "../features/tracking/allergenRow.js";
import { allergenEmoji } from "../features/tracking/allergenEmoji.js";
import { MarkEstablishedAction, OverriddenHint } from "../features/tracking/components/AllergenActions.js";
import { Badge } from "../features/catalog/components/Badge.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { BackButton } from "../components/ui/BackButton.js";
import { Card } from "../components/ui/Card.js";
import { SkeletonList } from "../components/ui/Skeleton.js";

function AllergenRow({ item, babyId }: { item: AllergenProgressItem; babyId: string | undefined }) {
  const action = resolveAllergenRowAction(item);
  const recency = resolveAllergenRecency(item);
  const servings = servingsProgressLabel(item);
  const reaction = showsReactionBadge(item);

  // Info-region pattern (ServeLogList / StorageItemCard): everything that
  // describes the allergen is one anchor to its detail page, and the
  // Mark/Undo controls are SIBLINGS outside it — so the row stays a
  // single-tap open, with zero interactive elements nested inside a link.
  // (Mark now opens a sheet to ask WHEN, item 365; Undo is still one tap.)
  const info = (
    <div className="flex flex-1 flex-col gap-2">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-inset)] text-lg leading-none"
        >
          {allergenEmoji(item.allergenSlug)}
        </span>
        <span className="flex-1 text-sm font-semibold text-[var(--color-text)]">{item.allergenName}</span>
        <Badge tone={ALLERGEN_STATUS_TONE[item.status]}>{ALLERGEN_STATUS_LABEL[item.status]}</Badge>
        {/* No chevron: storage rows open on tap without one, and the two
            lists should read alike. */}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)]">
        <span>{item.exposures === 1 ? "1 exposure" : `${item.exposures} exposures`}</span>
        <span>First: {formatAllergenDate(item.firstAt)}</span>
        {/* The rule the header states, counted out on the row it applies to. */}
        {servings && <span>{servings}</span>}
        {recency.fact && <span>{recency.fact}</span>}
      </div>
      <p className="text-sm text-[var(--color-text)]">{item.introGuidance}</p>
      {/* Due is a chip, not a sentence (item 365): the whole point is that it
          catches the eye in a list of nine rows. The sentence it replaced is
          still here — as the chip's tooltip and its screen-reader text — so
          nothing an assistive reader used to hear has been dropped. */}
      {recency.due ? (
        <span className="w-fit">
          <Badge tone="sunshine" title={RECENCY_HINT_COPY}>
            {DUE_BADGE_LABEL}
            <span className="sr-only">{` — ${RECENCY_HINT_COPY}`}</span>
          </Badge>
        </span>
      ) : (
        recency.countdown && <p className="text-xs text-[var(--color-text-muted)]">{recency.countdown}</p>
      )}
      {/* A reaction on the log, said once: the chip catches the eye and the
          sentence is VISIBLE under it rather than tucked into a tooltip the
          way the due nudge is — this is the line that sends a parent to a
          clinician. Shown on started and established rows alike; the parent's
          own mark is what clears it (`showsReactionBadge`). */}
      {reaction && (
        <div className="flex flex-col gap-1">
          <span className="w-fit">
            <Badge tone="sunshine">{REACTION_BADGE_LABEL}</Badge>
          </span>
          <p className="text-xs text-[var(--color-text)]">{REACTION_HINT_COPY}</p>
        </div>
      )}
    </div>
  );

  return (
    <Card as="li" padding="sm" className="flex flex-col gap-2">
      {babyId ? (
        <Link
          to={`/babies/${babyId}/allergens/${item.allergenSlug}`}
          className="flex rounded-[var(--radius-sm)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          {info}
        </Link>
      ) : (
        <div className="flex">{info}</div>
      )}

      {babyId && action === "mark" && <MarkEstablishedAction babyId={babyId} allergenSlug={item.allergenSlug} />}
      {babyId && action === "undo" && <OverriddenHint babyId={babyId} allergenSlug={item.allergenSlug} />}
    </Card>
  );
}

/** The status sections after "Due for a serve", in page order. A Record, so a
 * new ladder status fails typecheck here instead of dropping off the page. */
const STATUS_SECTIONS: Record<AllergenStatus, true> = { started: true, not_started: true, established: true };

export function BabyAllergensPage() {
  const { id: babyId } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useAllergenProgress(babyId);
  // Sectioned by what the parent does next: serve the due ones, keep going
  // with the started ones, introduce the rest, and nothing for the done ones.
  // "Due" is Home's rule (reaction-paused rows are not due, so they stay in
  // their status section); ladder order is kept within each section.
  const items = data?.items ?? [];
  const due = dueAllergens(items);
  const notDue = items.filter((item) => !due.includes(item));
  const sections = [
    { key: "due", title: "Due for a serve", items: due },
    ...(Object.keys(STATUS_SECTIONS) as AllergenStatus[]).map((status) => ({
      key: status,
      title: ALLERGEN_STATUS_LABEL[status],
      items: notDue.filter((item) => item.status === status),
    })),
  ].filter((section) => section.items.length > 0);

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title="Allergen ladder"
        emoji="🪜"
        leading={<BackButton fallback="/" />}
        description={
          <>
            {ALLERGEN_RULE_COPY}
            <span className="mt-1 block">Already established? Mark it so your progress reflects it.</span>
          </>
        }
      />

      {isLoading && <SkeletonList count={4} />}
      {isError && <p className="text-sm text-[var(--color-danger)]">Couldn't find that baby's allergen progress.</p>}

      {data && (
        <div className="flex flex-col gap-5">
          {sections.map((section) => (
            <section key={section.key} aria-labelledby={`ladder-${section.key}`} className="flex flex-col gap-2">
              <h2 id={`ladder-${section.key}`} className="text-sm font-semibold text-[var(--color-text)]">
                {section.title}
              </h2>
              <ul className="flex flex-col gap-2">
                {section.items.map((item) => (
                  <AllergenRow key={item.allergenSlug} item={item} babyId={babyId} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
