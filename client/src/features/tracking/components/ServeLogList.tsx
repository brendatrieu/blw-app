import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { MealFood, MealItem } from "@blw/shared";
import { useDeleteMeal, useMeals } from "../hooks.js";
import { getFoodEmoji } from "../../catalog/foodEmoji.js";
import { MealActionsMenu } from "./MealActionsMenu.js";
import { Badge } from "../../catalog/components/Badge.js";
import { ButtonLink } from "../../../components/ui/Button.js";
import { EmptyState } from "../../../components/ui/EmptyState.js";
import { KeepButton } from "../../../components/ui/KeepButton.js";
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

/** The card's title line: every food's name, comma-joined. Deliberately NOT
 * `MealDetailPage`'s meal-level `mealTitle` (which prefers the recipe title) —
 * in the list the recipe gets its own line underneath, so the title always
 * answers "what did baby eat?". */
export function mealTitle(foods: readonly MealFood[]): string {
  return foods.map((food) => food.name).join(", ");
}

export interface EmojiCluster {
  /** One emoji per food, capped at `max`. */
  emojis: string[];
  /** How many foods the cluster couldn't show (0 when nothing is hidden). */
  overflow: number;
}

/** The leading emoji stack, the meal-row answer to `storageItemEmoji`: at most
 * `max` food emoji, plus a "+N" count for the rest so a big meal stays one
 * compact glyph run instead of wrapping the row. */
export function emojiCluster(foods: readonly MealFood[], max = 3): EmojiCluster {
  const shown = foods.slice(0, Math.max(0, max));
  return {
    emojis: shown.map((food) => getFoodEmoji(food.slug, food.category, food.emoji)),
    overflow: Math.max(0, foods.length - shown.length),
  };
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

export interface MealDeleteControlProps {
  meal: MealItem;
  babyId: string;
  confirming: boolean;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  /** Fired on a successful delete, in addition to the always-run
   * `onCancelDelete` settle — `MealDetailPage` uses this to navigate away;
   * the list (`MealCard`) leaves it unset since the row just disappears. */
  onDeleted?: () => void;
}

/**
 * The Delete → "Remove this meal?" confirm idiom, extracted so `MealCard`'s
 * list row (one shared `pendingDeleteId` per list) and `MealDetailPage`'s
 * standalone actions (its own local boolean) render the exact same markup
 * instead of forking it. Only the `confirming` source and what happens after
 * a successful delete differ between the two call sites.
 *
 * `MealCard` now reaches the confirming branch through its kebab menu
 * (`MealActionsMenu` → `onRequestDelete`) and so renders this control only
 * while confirming; `MealDetailPage` still shows the plain Delete button
 * beside its Edit link, which is why the non-confirming branch stays.
 */
export function MealDeleteControl({ meal, babyId, confirming, onRequestDelete, onCancelDelete, onDeleted }: MealDeleteControlProps) {
  const deleteMeal = useDeleteMeal(babyId);

  if (confirming) {
    return (
      <div className="flex items-center gap-2 border-t border-[var(--color-border)] pt-2">
        <span className="text-xs text-[var(--color-text-muted)]">Remove this meal?</span>
        <button
          type="button"
          disabled={deleteMeal.isPending}
          onClick={() => deleteMeal.mutate(meal.id, { onSuccess: onDeleted, onSettled: onCancelDelete })}
          className="rounded-[var(--radius-md)] bg-[var(--color-danger)] px-2 py-1 text-xs font-medium text-[var(--color-danger-contrast)] disabled:opacity-60"
        >
          {deleteMeal.isPending ? "Removing…" : "Yes, delete"}
        </button>
        {/* The one dismiss that survives item 257: a destructive confirm has
            no other way out, so backing out stays reachable — as an icon-only
            × rather than a text button competing with "Yes, delete". */}
        <KeepButton onClick={onCancelDelete} disabled={deleteMeal.isPending} />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onRequestDelete}
      className="rounded px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
    >
      Delete
    </button>
  );
}

export interface MealCardProps {
  meal: MealItem;
  babyId: string;
  pendingDeleteId: string | null;
  onRequestDelete: (id: string) => void;
  onCancelDelete: () => void;
  /** False renders the info block as plain content instead of a Link to
   * `/log-meal?edit=:id` — for a page that must not link to itself.
   * Defaults to true (the food log taps through). Mirrors
   * `StorageItemCard`'s `linkable` prop precisely. */
  linkable?: boolean;
  /** Controls rendered next to the "From storage" badge. Defaults to the
   * kebab `MealActionsMenu` (Edit / Delete); pass `null` for a read-only
   * card with no actions at all. Mirrors `StorageItemCard`'s `actions` slot. */
  actions?: ReactNode;
}

/**
 * One meal in the food log, styled after `StorageItemCard`: an emoji cluster
 * and the food names on the left, the "From storage" badge plus the kebab on
 * the right, and a muted "Today · 2:05 PM" line where the list used to have
 * day headers. Exported standalone-renderable per the app's convention for
 * card-shaped list items.
 */
export function MealCard({
  meal,
  babyId,
  pendingDeleteId,
  onRequestDelete,
  onCancelDelete,
  linkable = true,
  actions,
}: MealCardProps) {
  const confirming = pendingDeleteId === meal.id;
  const { emojis, overflow } = emojiCluster(meal.foods);
  // `undefined` (the prop omitted) means "the standard kebab"; an explicit
  // `null` means "no actions" — hence the default lives here, not in the
  // destructuring above.
  const actionsSlot =
    actions === undefined ? (
      <MealActionsMenu mealId={meal.id} onRequestDelete={() => onRequestDelete(meal.id)} />
    ) : (
      actions
    );

  const info = (
    <>
      <span aria-hidden="true" className="flex shrink-0 items-center text-xl leading-none">
        {emojis.join("")}
        {overflow > 0 && <span className="ml-0.5 text-xs font-medium text-[var(--color-text-muted)]">+{overflow}</span>}
      </span>
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-[var(--color-text)]">{mealTitle(meal.foods)}</span>
        {meal.recipeTitle && (
          <span className="text-xs font-medium text-[var(--color-text-muted)]">🍳 {meal.recipeTitle}</span>
        )}
        <span className="text-xs text-[var(--color-text-muted)]">{servedLine(meal.servedAt)}</span>
      </div>
    </>
  );

  return (
    <li className="relative flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
      <div className="flex items-start justify-between gap-2">
        {/* Stretched link: the anchor's ::after overlay covers the whole card
            so tapping anywhere opens the meal for editing (which is why there
            is no separate Edit link). The kebab and the confirm row sit ABOVE
            the overlay (relative z-10) as siblings — nothing interactive is
            ever nested inside the anchor (same rule `StorageItemCard` follows). */}
        {linkable ? (
          <Link
            to={`/log-meal?edit=${meal.id}`}
            className="flex items-start gap-2 rounded-[var(--radius-sm)] after:absolute after:inset-0 after:rounded-[var(--radius-lg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            {info}
          </Link>
        ) : (
          <div className="flex items-start gap-2">{info}</div>
        )}
        <div className="relative z-10 flex shrink-0 items-center gap-1">
          {hasStorageFood(meal.foods) && <Badge tone="neutral">📦 From storage</Badge>}
          {actionsSlot}
        </div>
      </div>

      {meal.notes && <p className="text-xs text-[var(--color-text-muted)]">{meal.notes}</p>}

      {meal.reactionNote && <p className="text-xs text-[var(--color-danger)]">Reaction: {meal.reactionNote}</p>}

      {confirming && (
        <div className="relative z-10">
          <MealDeleteControl
            meal={meal}
            babyId={babyId}
            confirming
            onRequestDelete={() => onRequestDelete(meal.id)}
            onCancelDelete={onCancelDelete}
          />
        </div>
      )}
    </li>
  );
}

export interface ServeLogListProps {
  babyId: string;
  /** Show at most this many meals (newest first) — Home passes 3. */
  limit?: number;
  /** Where the header's "See all" link goes; omitted = no link (the full log page). */
  seeAllHref?: string;
  /** False when a page header already titles the list (the full log page). */
  showHeading?: boolean;
}

/** The meals Home shows before "See all" takes over. */
export const HOME_MEAL_LIMIT = 3;

/** Newest-first slice used by the Home section; the API already orders by servedAt desc. */
export function limitMeals<T>(items: readonly T[], limit: number | undefined): T[] {
  return limit === undefined ? [...items] : items.slice(0, Math.max(0, limit));
}

/**
 * The meal history: one flat newest-first list of `MealCard`s (each carrying
 * its own date line — the old per-day `<h3>` headers are gone). Rendered as a
 * Home section capped at `HOME_MEAL_LIMIT`, and uncapped on /meals. Logging
 * itself happens on the full-screen /log-meal page (see LogFoodPage /
 * LogFoodForm), which a card also reopens (as `/log-meal?edit=:id`) to edit
 * that meal in place.
 */
export function ServeLogList({ babyId, limit, seeAllHref, showHeading = true }: ServeLogListProps) {
  const { data, isLoading, isError } = useMeals(babyId, { limit: 100 });
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // The API returns meals newest-first; the slice preserves that order.
  const meals = useMemo(() => limitMeals(data?.items ?? [], limit), [data, limit]);

  return (
    <section className="flex flex-col gap-2">
      {(showHeading || seeAllHref) && (
        <div className="flex items-center justify-between">
          {showHeading && <h2 className="text-sm font-semibold text-[var(--color-text)]">📖 Food log</h2>}
          {seeAllHref && (
            <Link to={seeAllHref} className="text-xs font-medium text-[var(--color-accent)] underline">
              See all
            </Link>
          )}
        </div>
      )}

      {isLoading && <SkeletonList count={3} />}
      {isError && <p className="text-sm text-[var(--color-danger)]">Couldn't load the log.</p>}

      {!isLoading && !isError && meals.length === 0 && (
        <EmptyState
          icon="🍽️"
          title="Nothing logged yet"
          description="Log what baby tried so allergen progress stays up to date."
          action={
            <ButtonLink to="/log-meal" size="sm" variant="secondary">
              Log meal
            </ButtonLink>
          }
        />
      )}

      {meals.length > 0 && (
        <ul className="flex flex-col gap-2">
          {meals.map((meal) => (
            <MealCard
              key={meal.id}
              meal={meal}
              babyId={babyId}
              pendingDeleteId={pendingDeleteId}
              onRequestDelete={setPendingDeleteId}
              onCancelDelete={() => setPendingDeleteId(null)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
