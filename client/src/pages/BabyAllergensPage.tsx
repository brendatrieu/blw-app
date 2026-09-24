import { Link, useParams } from "react-router-dom";
import type { AllergenProgressItem } from "@blw/shared";
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

export function BabyAllergensPage() {
  const { id: babyId } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useAllergenProgress(babyId);
  // Due rows lead, so Home's "N allergens due" line lands on them without a
  // scroll through nine rows. Same rule as Home's count (reaction-paused rows
  // are not due); ladder order is kept within each group.
  const due = dueAllergens(data?.items ?? []);
  const rest = (data?.items ?? []).filter((item) => !due.includes(item));

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
        <div className="flex flex-col gap-3">
          {due.length > 0 && (
            <ul aria-label="Due for a serve" className="flex flex-col gap-2">
              {due.map((item) => (
                <AllergenRow key={item.allergenSlug} item={item} babyId={babyId} />
              ))}
            </ul>
          )}
          {due.length > 0 && rest.length > 0 && <hr className="border-[var(--color-divider)]" />}
          {rest.length > 0 && (
            <ul className="flex flex-col gap-2">
              {rest.map((item) => (
                <AllergenRow key={item.allergenSlug} item={item} babyId={babyId} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
