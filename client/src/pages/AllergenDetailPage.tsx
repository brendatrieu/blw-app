import { Link, Navigate, useParams } from "react-router-dom";
import type { AllergenDetail, AllergenDetailExposure, AllergenDetailFood } from "@blw/shared";
import { useAllergenDetail } from "../features/tracking/hooks.js";
import {
  ALLERGEN_STATUS_LABEL,
  ALLERGEN_STATUS_TONE,
  formatAllergenDate,
  resolveAllergenRecency,
  resolveAllergenRowAction,
} from "../features/tracking/allergenRow.js";
import { allergenEmoji } from "../features/tracking/allergenEmoji.js";
import { MarkEstablishedAction, OverriddenHint } from "../features/tracking/components/AllergenActions.js";
import { dayKey, dayLabel, timeLabel } from "../features/tracking/components/ServeLogList.js";
import { getFoodEmoji } from "../features/catalog/foodEmoji.js";
import { Badge } from "../components/ui/Badge.js";
import { ButtonLink } from "../components/ui/Button.js";
import { BackButton } from "../components/ui/BackButton.js";
import { Card, CardLink } from "../components/ui/Card.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { Skeleton, SkeletonList } from "../components/ui/Skeleton.js";

/** Focus ring shared by both info-region anchors on this page. */
const LINK_FOCUS =
  "rounded-[var(--radius-sm)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]";

function FoodRow({ food }: { food: AllergenDetailFood }) {
  return (
    // Info-region pattern (ServeLogList / PantryItemCard): only the emoji +
    // name block is the anchor to the food page; the "Log meal" CTA is a
    // SIBLING outside it, so nothing interactive is ever nested in a link.
    <Card as="li" padding="sm" className="flex items-center gap-2">
      <Link to={`/foods/${food.slug}`} className={`flex flex-1 items-center gap-2 ${LINK_FOCUS}`}>
        <span aria-hidden="true" className="text-lg leading-none">
          {getFoodEmoji(food.slug, food.category, food.emoji)}
        </span>
        <span className="flex-1 text-sm font-medium text-[var(--color-text)]">{food.name}</span>
        {food.isCustom && <Badge tone="neutral">Custom</Badge>}
      </Link>
      <div className="flex shrink-0 items-center gap-1">
        <ButtonLink to={`/log-meal?food=${food.id}`} size="sm">
          Log meal
        </ButtonLink>
      </div>
    </Card>
  );
}

function ExposureRow({ exposure }: { exposure: AllergenDetailExposure }) {
  return (
    // Whole row is the link (tap → edit that meal, the same destination
    // `MealCard` uses) and carries nothing interactive inside it, so a
    // `CardLink` is safe here where the food rows need the split.
    <li>
      <CardLink to={`/log-meal?edit=${exposure.mealId}`} padding="sm" className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-[var(--color-text)]">
          {dayLabel(dayKey(exposure.servedAt))} · {timeLabel(exposure.servedAt)}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">
          {exposure.foods.map((food) => (food.emoji ? `${food.emoji} ${food.name}` : food.name)).join(", ")}
        </span>
        {exposure.reaction && (
          <span className="w-fit">
            <Badge tone="dangerSoft">Reaction: {exposure.reaction}</Badge>
          </span>
        )}
      </CardLink>
    </li>
  );
}

function AllergenDetailBody({ detail, babyId }: { detail: AllergenDetail; babyId: string }) {
  const { progress, foods, exposures } = detail;
  const recency = resolveAllergenRecency(progress);
  const action = resolveAllergenRowAction(progress);

  return (
    <>
      <PageHeader
        title={progress.allergenName}
        emoji={allergenEmoji(progress.allergenSlug)}
        action={<Badge tone={ALLERGEN_STATUS_TONE[progress.status]}>{ALLERGEN_STATUS_LABEL[progress.status]}</Badge>}
      />

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)]">
        <span>{progress.exposures === 1 ? "1 exposure" : `${progress.exposures} exposures`}</span>
        <span>First: {formatAllergenDate(progress.firstAt)}</span>
        {/* Exact date when there is one — a detail page can afford it where
            the ladder row only has room for "last served 3d ago". With no
            serve at all (an override-only row) the recency helper's own
            phrasing says more than "Last served: —". */}
        {progress.lastServedAt ? (
          <span>Last served: {formatAllergenDate(progress.lastServedAt)}</span>
        ) : (
          recency.fact && <span>{recency.fact}</span>
        )}
      </div>
      {recency.hint && <p className="text-xs text-[var(--color-text-muted)]">{recency.hint}</p>}

      <p className="text-sm text-[var(--color-text)]">{progress.introGuidance}</p>

      {foods.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-h2 text-[var(--color-text)]">Foods with {progress.allergenName.toLowerCase()}</h2>
          <ul className="flex flex-col gap-2">
            {foods.map((food) => (
              <FoodRow key={food.id} food={food} />
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        {/* "Meals", not "Exposures": the facts line counts allergen-food
            SERVINGS (a meal with two egg foods is two exposures) while this
            list is one row per meal, so the two must not share a noun. */}
        <h2 className="font-h2 text-[var(--color-text)]">Meals with {progress.allergenName.toLowerCase()}</h2>
        {exposures.length === 0 ? (
          <EmptyState
            icon={allergenEmoji(progress.allergenSlug)}
            title="No exposures logged yet"
            description={progress.introGuidance}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {exposures.map((exposure) => (
              <ExposureRow key={exposure.mealId} exposure={exposure} />
            ))}
          </ul>
        )}
      </section>

      {action === "mark" && <MarkEstablishedAction babyId={babyId} allergenSlug={progress.allergenSlug} />}
      {action === "undo" && <OverriddenHint babyId={babyId} allergenSlug={progress.allergenSlug} />}
    </>
  );
}

/**
 * One allergen's full story, reached by tapping its row on the ladder
 * (`BabyAllergensPage`): the same status + facts the row shows, the guidance,
 * every food that carries the allergen (catalog plus this parent's own custom
 * foods), the meals that exposed this baby to it, and the same single-tap
 * Mark/Undo control the row offers — literally the same components, imported,
 * so the two surfaces can never drift.
 *
 * States follow `PantryDetailPage`: skeletons while the query is pending
 * (which includes an OFFLINE-paused fetch — it must never be mistaken for a
 * missing allergen), and a redirect out rather than a dead page when the
 * route somehow has no baby. An unknown slug 404s, and per ledger 189 that
 * renders "Couldn't find that allergen." with a way back instead of
 * redirecting — the URL is legible, so the message beats a silent bounce.
 */
export function AllergenDetailPage() {
  const { id: babyId, slug } = useParams<{ id: string; slug: string }>();
  const { data, isPending, isError } = useAllergenDetail(babyId, slug);
  const ladderPath = `/babies/${babyId}/allergens`;

  if (!babyId || !slug) {
    return <Navigate to="/" replace />;
  }

  if (isPending) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <BackButton fallback={ladderPath} />
        <Skeleton className="h-6 w-2/3" />
        <SkeletonList count={3} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <BackButton fallback={ladderPath} />
        <p className="text-sm text-[var(--color-danger)]">Couldn't find that allergen.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <BackButton fallback={ladderPath} />
      <AllergenDetailBody detail={data} babyId={babyId} />
    </div>
  );
}
