import { Link, useParams } from "react-router-dom";
import type { AllergenProgressItem } from "@blw/shared";
import { useAllergenProgress } from "../features/tracking/hooks.js";
import {
  ALLERGEN_STATUS_LABEL,
  ALLERGEN_STATUS_TONE,
  formatAllergenDate,
  resolveAllergenRowAction,
  resolveAllergenRecency,
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

  // Info-region pattern (ServeLogList / PantryItemCard): everything that
  // describes the allergen is one anchor to its detail page, and the
  // Mark/Undo controls are SIBLINGS outside it — so the row stays a
  // single-tap open while marking stays a single tap too, with zero
  // interactive elements nested inside a link.
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
        {/* No chevron: pantry rows open on tap without one, and the two
            lists should read alike. */}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)]">
        <span>{item.exposures === 1 ? "1 exposure" : `${item.exposures} exposures`}</span>
        <span>First: {formatAllergenDate(item.firstAt)}</span>
        {recency.fact && <span>{recency.fact}</span>}
      </div>
      <p className="text-sm text-[var(--color-text)]">{item.introGuidance}</p>
      {recency.hint && <p className="text-xs text-[var(--color-text-muted)]">{recency.hint}</p>}
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

  return (
    <div className="flex flex-col gap-4 p-4">
      <BackButton fallback="/" />
      <PageHeader
        title="Allergen ladder"
        emoji="🪜"
        description={
          <>
            Introduce one new allergen at a time, in the morning at home, and wait a few days before
            the next one.
            <span className="mt-1 block">Already established? Mark it so your progress reflects it.</span>
          </>
        }
      />

      {isLoading && <SkeletonList count={4} />}
      {isError && <p className="text-sm text-[var(--color-danger)]">Couldn't find that baby's allergen progress.</p>}

      {data && (
        <ul className="flex flex-col gap-2">
          {data.items.map((item) => (
            <AllergenRow key={item.allergenSlug} item={item} babyId={babyId} />
          ))}
        </ul>
      )}
    </div>
  );
}
