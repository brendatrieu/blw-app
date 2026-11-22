import { useState } from "react";
import { Link } from "react-router-dom";
import type { MealFood, MealItem } from "@blw/shared";
import { useDeleteMeal, useMeals } from "../hooks.js";
import { DeletedMark, FoodNames } from "../../catalog/components/DeletedMark.js";
import { mealLines } from "../../plate/plate.js";
import { ItemPlate } from "../../plate/PlateItemRow.js";
import { MealActionsMenu } from "./MealActionsMenu.js";
import { Badge } from "../../catalog/components/Badge.js";
import { Button, ButtonLink } from "../../../components/ui/Button.js";
import { Sheet } from "../../../components/ui/Sheet.js";
import { StarRatingShown } from "../../../components/ui/StarRating.js";
import { Card, CARD_ROW_DIVIDER } from "../../../components/ui/Card.js";
import { HEADING_CONTROL_INSET, SectionLink } from "../../../components/ui/SectionLink.js";
import { PageTrack, Pager, usePagedTrack } from "../../../components/ui/Pager.js";
import { EmptyState } from "../../../components/ui/EmptyState.js";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog.js";
import { SkeletonList } from "../../../components/ui/Skeleton.js";

/** yyyy-mm-dd in the viewer's local timezone. The log itself is no longer
 * grouped by day (each card carries its own date line), but the key/label
 * pair stays exported — `AllergenDetailPage` renders the same "Today ·
 * 2:05 PM" line for an exposure. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dayLabel(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!);
  const today = new Date();
  const todayKey = dayKey(today.toISOString());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === todayKey) return "Today";
  if (key === dayKey(yesterday.toISOString())) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** The muted "when" line that replaced the old day headers, e.g.
 * "Today · 2:05 PM" or "Wed, Aug 26 · 12:00 PM". */
export function servedLine(servedAt: string): string {
  return `${dayLabel(dayKey(servedAt))} · ${timeLabel(servedAt)}`;
}

/** Whether any food in the meal came from a storage batch — drives the
 * "📦 From storage" badge (one per card, not one per food: the card's job is
 * to say the meal came out of storage, the detail page names which batch). */
export function hasStorageFood(foods: readonly MealFood[]): boolean {
  return foods.some((food) => Boolean(food.storageItemId));
}

/** The badge's rule on a saved meal: a container on its plate, or (a cached
 * body from before items) a food served from one. */
export function fromStorage(meal: Pick<MealItem, "items" | "foods">): boolean {
  return meal.items ? meal.items.some((item) => item.kind === "storage") : hasStorageFood(meal.foods);
}

export interface MealDeleteDialogProps {
  meal: MealItem;
  babyId: string;
  open: boolean;
  onClose: () => void;
}

/**
 * The meal delete question (item 599), one per list (the Food log, a
 * container's meals, ledger 966), for the meal whose kebab asked.
 * Nothing is deleted until the red button is tapped; then the card just goes
 * and the parent stays where they are. A failed delete keeps the pop-up open
 * with the reason, so the parent can try again.
 */
export function MealDeleteDialog({ meal, babyId, open, onClose }: MealDeleteDialogProps) {
  const deleteMeal = useDeleteMeal(babyId);

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title="Delete this meal?"
      confirmLabel="Delete"
      pendingLabel="Deleting…"
      pending={deleteMeal.isPending}
      onConfirm={() =>
        deleteMeal.mutate(meal.id, { onSuccess: onClose })
      }
      error={deleteMeal.isError ? "Couldn't delete that — try again." : undefined}
    >
      <p>This cannot be undone.</p>
    </ConfirmDialog>
  );
}

/** Ledger 966: a line's stars at its end, held off the card's right edge
 * about as far as its text is from the left (the kebab's padding is less). */
const STARS_AT_END = "ml-auto mr-2";

type Line = ReturnType<typeof mealLines>[number];

/** One line's plate, name and (ledger 966) read-only stars. */
function lineParts(line: Line) {
  const own = line.ratings[0]?.rating ?? null;
  return (
    <>
      <ItemPlate plates={line.plates} size={28} />
      <span className={`min-w-0 text-sm leading-[1.3] font-medium break-words text-[var(--color-text)]`}>
        {line.name}
        <DeletedMark deleted={line.deleted} />
      </span>
      {own !== null && <StarRatingShown value={own} className={STARS_AT_END} />}
    </>
  );
}

/** Every line of a meal: the /meals card's and the full-meal sheet's list. */
function MealLineList({ meal }: { meal: MealItem }) {
  // No aria-label: on a card the list sits inside the edit link, and a label
  // there would BE the link's name, hiding the foods and "Rated N stars" (966).
  // Ledger 973: a container's foods and recipes are lines of their own.
  return (
    <ul className="flex flex-col">
      {mealLines(meal, { flattenContainers: true }).map((line) => (
        <li key={line.key} className="flex items-center gap-2 py-[3px]">
          {lineParts(line)}
        </li>
      ))}
    </ul>
  );
}

/** A Home row's food line: the 28px plate plus 3px above and below, as a line on /meals. */
const SLOT = "flex h-[34px] items-center gap-2";

const STRETCHED_TARGET =
  "-mt-1 block rounded-[var(--radius-sm)] after:absolute after:inset-0 after:rounded-[var(--radius-lg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]";

export interface MealCardProps {
  meal: MealItem;
  /** Asks to delete this meal — the list owns the one `MealDeleteDialog`. */
  onRequestDelete: (meal: MealItem) => void;
  /** A row of a grouped list (Home, item 664) instead of a card of its own:
   * no border or fill (the list's card has them), an inset divider, and a
   * kebab named after the meal. */
  grouped?: boolean;
  /** Ledger 1121, Home's paged rows: a fixed height (the date line, then
   * one food line, ledger 1143; no notes) and a tap opens the whole meal
   * through this instead of Edit (which stays in the kebab). */
  onOpen?: (meal: MealItem) => void;
}

/**
 * One meal in the food log (CD-Food-Log, PP-NOTES round 5 decision 8): the
 * muted "Today · 2:05 PM" line with the "From storage" badge and the kebab
 * at the top, then one line per food or recipe on the plate, a container's
 * each on its own in its place (ledger 973; its plate and name, and its
 * stars at a glance once rated, ledger 966), then the notes. On Home (as a
 * fixed-height row that opens `MealSheet`, ledger 1121), on /meals and on a
 * container's page (its meals). Exported standalone-renderable per the app's
 * convention for card-shaped list items.
 */
export function MealCard({ meal, onRequestDelete, grouped = false, onOpen }: MealCardProps) {
  const fixed = onOpen !== undefined;
  let body;
  if (onOpen) {
    // Ledger 1143: one line: the first food's plate, the first two names
    // cut short with an ellipsis, then "+N" for the rest. No stars (the
    // sheet has them). A button, not a link (ledger 1121): it opens the meal
    // in a sheet, named by its content: the two names and "+N more".
    const lines = mealLines(meal, { flattenContainers: true });
    const more = lines.length - 2;
    body = (
      <button type="button" aria-haspopup="dialog" onClick={() => onOpen(meal)} className={`${STRETCHED_TARGET} w-full text-left`}>
        <span className={SLOT}>
          {lines[0] && <ItemPlate plates={lines[0].plates} size={28} />}
          <span className="min-w-0 truncate text-sm leading-[1.3] font-medium text-[var(--color-text)]">
            <FoodNames foods={lines.slice(0, 2)} />
          </span>
          {more > 0 && (
            <span className="mr-2 shrink-0">
              <Badge tone="count">
                +{more}
                <span className="sr-only"> more</span>
              </Badge>
            </span>
          )}
        </span>
      </button>
    );
  } else {
    // Stretched link: the anchor's ::after overlay covers the whole card, so
    // tapping anywhere opens the meal for editing (which is why there is no
    // separate Edit link).
    body = (
      <Link to={`/log-meal?edit=${meal.id}`} className={STRETCHED_TARGET}>
        <MealLineList meal={meal} />
      </Link>
    );
  }

  return (
    <li
      className={
        grouped
          ? `relative flex flex-col pt-1.5 pr-1 pb-2.5 pl-3.5 ${CARD_ROW_DIVIDER}`
          : "app-card relative flex flex-col rounded-[var(--radius-lg)] border pt-1.5 pr-1.5 pb-2.5 pl-3"
      }
    >
      {/* Wraps instead of overflowing (ledger 776): at 320px a long date
          line plus the badge and kebab put those two on a line of their own,
          right-aligned. A fixed row (1121) never wraps: under 360px its badge
          is the 📦 alone (named for screen readers), and the date line is
          cut short before it could push the kebab down. */}
      <div className={fixed ? "flex items-center justify-between gap-x-2" : "flex flex-wrap items-center justify-between gap-x-2"}>
        <span className={fixed ? "min-w-0 truncate text-xs text-[var(--color-text-muted)]" : "text-xs text-[var(--color-text-muted)]"}>
          {servedLine(meal.servedAt)}
        </span>
        {/* Above the stretched target's overlay (relative z-10), as siblings:
            nothing interactive is ever nested inside it (the rule
            `StorageItemCard` follows too). */}
        <div className="relative z-10 flex shrink-0 items-center gap-0.5 ml-auto">
          {fromStorage(meal) &&
            (fixed ? (
              <Badge tone="neutral" title="From storage">
                📦<span className="max-[359px]:sr-only"> From storage</span>
              </Badge>
            ) : (
              <Badge tone="neutral">📦 From storage</Badge>
            ))}
          <MealActionsMenu
            mealId={meal.id}
            onRequestDelete={() => onRequestDelete(meal)}
            {...(grouped && { label: `${meal.foods.map((food) => food.name).join(", ")} actions` })}
          />
        </div>
      </div>

      {body}

      {!fixed && meal.notes && <p className="mt-1 text-xs text-[var(--color-text-muted)]">{meal.notes}</p>}

      {!fixed && meal.reactionNote && <p className="mt-1 text-xs text-[var(--color-danger)]">Reaction: {meal.reactionNote}</p>}
    </li>
  );
}

export interface MealSheetProps {
  /** The meal shown; null = closed. */
  meal: MealItem | null;
  onClose: () => void;
  /** Delete only asks: the list owns `MealDeleteDialog`. */
  onRequestDelete: (meal: MealItem) => void;
}

/**
 * Ledger 1121: the whole meal behind a Home row (the row shows one line, 1143):
 * its date line, the "From storage" badge, every line with its stars, the
 * notes and reaction, and the row kebab's two actions as buttons. The meal
 * page itself is retired (ledger 966), so Edit is the plate page, as before.
 */
export function MealSheet({ meal, onClose, onRequestDelete }: MealSheetProps) {
  return (
    <Sheet open={meal !== null} onClose={onClose} title={meal ? servedLine(meal.servedAt) : undefined} showClose>
      {meal && (
        <>
          {fromStorage(meal) && (
            <div className="flex">
              <Badge tone="neutral">📦 From storage</Badge>
            </div>
          )}
          <MealLineList meal={meal} />
          {meal.notes && <p className="text-sm text-[var(--color-text-muted)]">{meal.notes}</p>}
          {meal.reactionNote && <p className="text-sm text-[var(--color-danger)]">Reaction: {meal.reactionNote}</p>}
          <div className="mt-1 grid grid-cols-2 gap-2">
            <ButtonLink to={`/log-meal?edit=${meal.id}`} variant="secondary">
              Edit
            </ButtonLink>
            <Button type="button" variant="danger-quiet" onClick={() => onRequestDelete(meal)}>
              Delete
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}

export interface ServeLogListProps {
  babyId: string;
  /** Page size (newest first), swiped or ‹ › through — Home passes 3. Omitted = every meal. */
  limit?: number;
  /** Where the header's "See all" link goes; omitted = no link (the full log page). */
  seeAllHref?: string;
  /** False when a page header already titles the list (the full log page). */
  showHeading?: boolean;
  /** One rounded card of divided rows instead of a card per meal (Home's
   * M3 style, item 664). /meals keeps its cards. */
  grouped?: boolean;
}

/** Home's food-log page size (item 694). */
export const HOME_MEAL_LIMIT = 3;

/** The most meals one fetch returns (the API's max); a full fetch reads "of 100+". */
const MEAL_FETCH_LIMIT = 100;

/**
 * The meal history: one flat newest-first list of `MealCard`s (each carrying
 * its own date line — the old per-day `<h3>` headers are gone). Rendered as a
 * Home section paged `HOME_MEAL_LIMIT` at a time, and whole on /meals. Logging
 * itself happens on the full-screen /log-meal page (the plate,
 * features/plate/PlateScreen.tsx), which a card also reopens (as
 * `/log-meal?edit=:id`) to edit that meal in place.
 */
export function ServeLogList({ babyId, limit, seeAllHref, showHeading = true, grouped = false }: ServeLogListProps) {
  const { data, isLoading, isError } = useMeals(babyId, { limit: MEAL_FETCH_LIMIT });
  // The meal itself, not its id: the delete removes the row optimistically,
  // and the question has to outlive it to show a failure.
  const [pendingDelete, setPendingDelete] = useState<MealItem | null>(null);
  // Ledger 1121: the meal open in `MealSheet`, by id, so it follows a refetch
  // and the sheet closes by itself once the meal is gone.
  const [openId, setOpenId] = useState<string | null>(null);
  // The API returns meals newest-first; the slices preserve that order.
  const all = data?.items ?? [];
  const openMeal = all.find((meal) => meal.id === openId) ?? null;
  // After pendingDelete and openId: the handler tests index useState slots by call order.
  // Always called (hook order); without a limit it is one unused page.
  const track = usePagedTrack(all.length, limit ?? Math.max(all.length, 1));
  const pages = limit === undefined ? null : track.pages;
  // Ledger 1121: paged (Home), every row is one fixed height and opens the whole meal.
  const onOpen = pages ? (meal: MealItem) => setOpenId(meal.id) : undefined;

  const renderMeals = (meals: readonly MealItem[]) =>
    grouped ? (
      // h-full: a short last page's card is as tall as a full one (PageTrack `fill`).
      <Card as="ul" padding="none" className={`flex flex-col ${pages ? "h-full" : ""}`}>
        {meals.map((meal) => (
          <MealCard key={meal.id} meal={meal} onRequestDelete={setPendingDelete} grouped onOpen={onOpen} />
        ))}
      </Card>
    ) : (
      <ul className="flex flex-col gap-2">
        {meals.map((meal) => (
          <MealCard key={meal.id} meal={meal} onRequestDelete={setPendingDelete} onOpen={onOpen} />
        ))}
      </ul>
    );

  return (
    <section className="flex flex-col gap-2.5">
      {(showHeading || seeAllHref) && (
        // The row is the heading's height; the controls' 44px targets
        // overhang it (item 696). flex-wrap drops them under it at 320px.
        <div className="flex flex-wrap items-center justify-between gap-x-2">
          {showHeading && <h2 className="font-h2 text-[var(--color-text)]">Food log</h2>}
          <div className={`ml-auto flex shrink-0 items-center gap-2 ${HEADING_CONTROL_INSET}`}>
            {pages && (
              <Pager label="meals" pages={pages} onPage={track.goTo} capped={all.length >= MEAL_FETCH_LIMIT} />
            )}
            {seeAllHref && <SectionLink to={seeAllHref}>See all</SectionLink>}
          </div>
        </div>
      )}

      {isLoading && <SkeletonList count={3} />}
      {isError && <p className="text-sm text-[var(--color-danger)]">Couldn't load the log.</p>}

      {!isLoading && !isError && all.length === 0 && (
        <EmptyState
          icon="🍽️"
          title="Nothing logged yet"
          description="Log what baby tried so allergen progress stays up to date."
          action={
            <ButtonLink to="/log-meal" variant="secondary">
              Log meal
            </ButtonLink>
          }
        />
      )}

      {/* Ledger 1121 (replaces 1105's `fit`): every row is one height, so
          every page is too; `fill` stretches a short last page's card to it.
          The card never changes height on a swipe or ‹ ›, nothing resizes
          mid-gesture, and Home still ends 16px above the tab bar. */}
      {all.length > 0 &&
        (pages ? <PageTrack track={track} items={all} bleed fill renderSlide={renderMeals} /> : renderMeals(all))}
      <MealSheet
        meal={openMeal}
        onClose={() => setOpenId(null)}
        onRequestDelete={(meal) => {
          setOpenId(null);
          setPendingDelete(meal);
        }}
      />
      {pendingDelete && (
        <MealDeleteDialog meal={pendingDelete} babyId={babyId} open onClose={() => setPendingDelete(null)} />
      )}
    </section>
  );
}
