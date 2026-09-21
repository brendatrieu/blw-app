import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { StorageItem } from "@blw/shared";
import { Badge } from "../../catalog/components/Badge.js";
import { emojiCluster, getFoodEmoji, type EmojiCluster } from "../../catalog/foodEmoji.js";
import { bestByLabel, countdownLabel, LOCATION_LABEL, storageItemTitle, servingsLabel } from "../format.js";
import { resolveFreshness } from "../freshness.js";

/** ONE emoji for a storage item: the first food's when it holds foods,
 * otherwise a friendly stand-in for a recipe or free-form entry. Kept as a
 * single glyph (not the cluster below) for the places that have room for
 * exactly one — `StorageDetailPage`'s `PageHeader`. */
export function storageItemEmoji(item: StorageItem): string {
  // Storage rows carry no category — a custom food's own emoji, or the
  // slug map, is all there is to go on.
  const first = item.foods[0];
  if (first) return getFoodEmoji(first.slug, null, first.emoji);
  if (item.recipeTitle) return "🍲";
  return "📝";
}

/**
 * The card's leading glyph run: since item 347 a container holds a whole
 * meal, so it gets the meal row's emoji cluster — at most `max` food emoji
 * plus a "+N" for the rest. A recipe or label container names no foods, so
 * it falls back to the single stand-in `storageItemEmoji` picks, rendered
 * through the same markup rather than a second branch in the JSX.
 */
export function storageItemCluster(item: StorageItem, max = 3): EmojiCluster {
  if (item.foods.length > 0) return emojiCluster(item.foods, max);
  return { emojis: [storageItemEmoji(item)], overflow: 0 };
}

interface StorageItemCardProps {
  item: StorageItem;
  /** Kept for callers' symmetry with the kebab; the card itself renders no
   * button that could be disabled by it. */
  busy: boolean;
  /** Right-hand slot beside the location Badge — the three-dot Actions menu
   * every list AND the detail page pass (item 264). There is no footer
   * button row any more. */
  actions?: ReactNode;
  /** False renders the info block as plain content instead of a Link to
   * `/storage/:id` — for `StorageDetailPage` itself, which must not link to
   * itself. Defaults to true (Home and the Storage list both tap through). */
  linkable?: boolean;
}

export function StorageItemCard({ item, actions, linkable = true }: StorageItemCardProps) {
  const preparedLabel = new Date(item.preparedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const freshness = resolveFreshness(item);
  const { emojis, overflow } = storageItemCluster(item);

  const info = (
    <>
      {/* Byte-for-byte the meal row's cluster markup (`MealCard`) — a
          container and the meal it becomes are the same thing twice. */}
      <span aria-hidden="true" className="flex shrink-0 items-center text-xl leading-none">
        {emojis.join("")}
        {overflow > 0 && <span className="ml-0.5 text-xs font-medium text-[var(--color-text-muted)]">+{overflow}</span>}
      </span>
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-[var(--color-text)]">{storageItemTitle(item)}</span>
        <span className="text-xs text-[var(--color-text-muted)]">
          Prepared {preparedLabel}
          {item.quantityNote ? ` · ${item.quantityNote}` : ""}
          {item.servingsTotal != null && item.servingsLeft != null
            ? ` · ${servingsLabel(item.servingsLeft, item.servingsTotal)}`
            : ""}
        </span>
      </div>
    </>
  );

  return (
    <li className="relative flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-divider)] bg-[var(--color-bg-elevated)] p-3">
      <div className="flex items-start justify-between gap-2">
        {/* Stretched link: the anchor's ::after overlay covers the whole card
            so every edge is tappable, while the kebab/actions slot and the
            Serve/Edit/Remove/Restore footer sit ABOVE it (relative z-10) as
            siblings — nothing interactive is ever nested inside the anchor. */}
        {linkable ? (
          <Link
            to={`/storage/${item.id}`}
            className="flex items-start gap-2 rounded-[var(--radius-sm)] after:absolute after:inset-0 after:rounded-[var(--radius-lg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            {info}
          </Link>
        ) : (
          <div className="flex items-start gap-2">{info}</div>
        )}
        <div className="relative z-10 flex shrink-0 items-center gap-1">
          <Badge tone="neutral">{LOCATION_LABEL[item.location]}</Badge>
          {actions}
        </div>
      </div>

      {item.notes && <p className="text-xs text-[var(--color-text-muted)]">{item.notes}</p>}

      {item.status === "active" && (
        <div className="flex items-center gap-2">
          {freshness.state === "expired" ? (
            <Badge tone="dangerSoft">Expired</Badge>
          ) : freshness.state === "use_soon" ? (
            <Badge tone="sunshine">⏰ Use soon</Badge>
          ) : null}
          {/* The badge and the text are now the SAME fact told twice (item
              333): with a best-by date it decides the badge, so the date is
              always shown beside it — the warning and its reason read
              together. Without one the badge comes from the category storage
              window, and the countdown is shown only while the item is still
              fresh; once it warns, repeating "Expired" under an Expired badge
              would say nothing new. */}
          {(freshness.source === "best_by" || freshness.state === "fresh") && (
            <span className="text-xs text-[var(--color-text-muted)]">
              {freshness.source === "best_by" ? bestByLabel(item.bestBy!) : countdownLabel(item.expiresAt)}
            </span>
          )}
        </div>
      )}

      {item.status !== "active" && (
        <Badge tone={item.status === "finished" ? "primary" : "neutral"}>
          {item.status === "finished" ? "Finished" : "Discarded"}
        </Badge>
      )}

    </li>
  );
}
