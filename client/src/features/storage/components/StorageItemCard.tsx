import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { StorageItem } from "@blw/shared";
import { Badge } from "../../catalog/components/Badge.js";
import { getFoodEmoji } from "../../catalog/foodEmoji.js";
import { bestByLabel, countdownLabel, LOCATION_LABEL, storageItemTitle, servingsLabel } from "../format.js";

/** Emoji for a storage item: the food's own emoji when it was prepped from a
 * catalog food, otherwise a friendly stand-in for a recipe or free-form entry.
 * Exported so `StorageDetailPage` can reuse it for its own header. */
export function storageItemEmoji(item: StorageItem): string {
  // Storage rows carry no category — a custom food's own emoji, or the
  // slug map, is all there is to go on.
  if (item.foodSlug) return getFoodEmoji(item.foodSlug, null, item.foodEmoji);
  if (item.recipeTitle) return "🍲";
  return "📝";
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

  const info = (
    <>
      <span aria-hidden="true" className="text-xl leading-none">
        {storageItemEmoji(item)}
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
    <li className="relative flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
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
          {item.expired ? (
            <Badge tone="dangerSoft">Expired</Badge>
          ) : item.useSoon ? (
            <Badge tone="sunshine">⏰ Use soon</Badge>
          ) : null}
          {/* A user-entered best-by is shown even beside the safety badges —
              the badges warn, the date informs; neither hides the other. */}
          {(item.bestBy || (!item.expired && !item.useSoon)) && (
            <span className="text-xs text-[var(--color-text-muted)]">
              {item.bestBy ? bestByLabel(item.bestBy) : countdownLabel(item.expiresAt)}
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
