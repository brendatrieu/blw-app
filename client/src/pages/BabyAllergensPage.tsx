import { useParams } from "react-router-dom";
import type { AllergenProgressItem, AllergenStatus } from "@blw/shared";
import { useBabies } from "../features/babies/hooks.js";
import { useAllergenProgress, useMarkAllergenEstablished, useUndoAllergenEstablished } from "../features/tracking/hooks.js";
import { resolveAllergenRowAction, resolveAllergenRecency } from "../features/tracking/allergenRow.js";
import { Badge, type BadgeTone } from "../features/catalog/components/Badge.js";
import { Button } from "../components/ui/Button.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { BackButton } from "../components/ui/BackButton.js";
import { Card } from "../components/ui/Card.js";
import { SkeletonList } from "../components/ui/Skeleton.js";

const STATUS_LABEL: Record<AllergenStatus, string> = {
  not_started: "Not started",
  started: "Started",
  established: "Established",
};

const STATUS_TONE: Record<AllergenStatus, BadgeTone> = {
  not_started: "neutral",
  started: "sunshine",
  established: "leaf",
};

/** One emoji per top-9 allergen slug (see `ALLERGEN_SLUGS` in catalog/constants.ts). */
const ALLERGEN_EMOJI: Record<string, string> = {
  milk: "🥛",
  egg: "🥚",
  peanut: "🥜",
  tree_nut: "🌰",
  fish: "🐟",
  shellfish: "🍤",
  wheat: "🌾",
  soy: "🫘",
  sesame: "🫙",
};

function allergenEmoji(slug: string): string {
  return ALLERGEN_EMOJI[slug] ?? "🍽️";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

interface MarkEstablishedActionProps {
  babyId: string;
  allergenSlug: string;
}

/**
 * Single-tap backfill: writes the override immediately — the row's
 * "Marked by you · Undo" affordance is the safety net (undo beats a
 * confirm step). The explanatory copy lives once at the top of the page.
 */
function MarkEstablishedAction({ babyId, allergenSlug }: MarkEstablishedActionProps) {
  const mark = useMarkAllergenEstablished(babyId);

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={mark.isPending}
        onClick={() => mark.mutate(allergenSlug)}
      >
        {mark.isPending ? "Marking…" : "Mark as established"}
      </Button>
      {mark.isError && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          Couldn't save that — try again.
        </p>
      )}
    </div>
  );
}

interface OverriddenHintProps {
  babyId: string;
  allergenSlug: string;
}

/**
 * Muted "marked by you" hint + Undo for a row established only via a parent
 * override. Never shown once the meal log itself establishes the allergen —
 * the override un-flags itself the moment real exposures catch up (see
 * `unionAllergenStatus` in shared/src/tracking.ts).
 */
function OverriddenHint({ babyId, allergenSlug }: OverriddenHintProps) {
  const undo = useUndoAllergenEstablished(babyId);

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-[var(--color-text-muted)]">Marked by you</span>
      <button
        type="button"
        disabled={undo.isPending}
        onClick={() => undo.mutate(allergenSlug)}
        className="font-semibold text-[var(--color-accent)] underline disabled:opacity-60"
      >
        {undo.isPending ? "Undoing…" : "Undo"}
      </button>
      {undo.isError && <span className="text-[var(--color-danger)]">Couldn't undo — try again.</span>}
    </div>
  );
}

function AllergenRow({ item, babyId }: { item: AllergenProgressItem; babyId: string | undefined }) {
  const action = resolveAllergenRowAction(item);
  const recency = resolveAllergenRecency(item);

  return (
    <Card as="li" padding="sm" className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-inset)] text-lg leading-none"
        >
          {allergenEmoji(item.allergenSlug)}
        </span>
        <span className="flex-1 text-sm font-semibold text-[var(--color-text)]">{item.allergenName}</span>
        <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)]">
        <span>{item.exposures === 1 ? "1 exposure" : `${item.exposures} exposures`}</span>
        <span>First: {formatDate(item.firstAt)}</span>
        {recency.fact && <span>{recency.fact}</span>}
      </div>
      <p className="text-sm text-[var(--color-text)]">{item.introGuidance}</p>
      {recency.hint && <p className="text-xs text-[var(--color-text-muted)]">{recency.hint}</p>}

      {babyId && action === "mark" && <MarkEstablishedAction babyId={babyId} allergenSlug={item.allergenSlug} />}
      {babyId && action === "undo" && <OverriddenHint babyId={babyId} allergenSlug={item.allergenSlug} />}
    </Card>
  );
}

export function BabyAllergensPage() {
  const { id: babyId } = useParams<{ id: string }>();
  const { data: babies } = useBabies();
  const baby = babies?.find((b) => b.id === babyId);
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
