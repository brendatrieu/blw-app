import type { PantryItem } from "@blw/shared";
import { Badge } from "../../catalog/components/Badge.js";
import { getFoodEmoji } from "../../catalog/foodEmoji.js";
import { countdownLabel, LOCATION_LABEL, pantryItemTitle } from "../format.js";
import { Button, ButtonLink } from "../../../components/ui/Button.js";

/** Emoji for a pantry item: the food's own emoji when it was prepped from a
 * catalog food, otherwise a friendly stand-in for a recipe or free-form entry. */
function pantryItemEmoji(item: PantryItem): string {
  if (item.foodSlug) return getFoodEmoji(item.foodSlug);
  if (item.recipeTitle) return "🍲";
  return "📝";
}

interface PantryItemCardProps {
  item: PantryItem;
  busy: boolean;
  onFinish?: () => void;
  onDiscard?: () => void;
  /** Route to the full-screen edit page (e.g. `/pantry/${item.id}/edit`); omit to hide the Edit affordance. */
  editHref?: string;
  onRestore?: () => void;
}

export function PantryItemCard({ item, busy, onFinish, onDiscard, editHref, onRestore }: PantryItemCardProps) {
  const preparedLabel = new Date(item.preparedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <li className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span aria-hidden="true" className="text-xl leading-none">
            {pantryItemEmoji(item)}
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-[var(--color-text)]">{pantryItemTitle(item)}</span>
            <span className="text-xs text-[var(--color-text-muted)]">
              Prepared {preparedLabel}
              {item.quantityNote ? ` · ${item.quantityNote}` : ""}
            </span>
          </div>
        </div>
        <Badge tone="neutral">{LOCATION_LABEL[item.location]}</Badge>
      </div>

      {item.status === "active" && (
        <div className="flex items-center gap-2">
          {item.expired ? (
            <Badge tone="danger">Expired — discard?</Badge>
          ) : item.useSoon ? (
            <Badge tone="sunshine">⏰ Use soon</Badge>
          ) : (
            <span className="text-xs text-[var(--color-text-muted)]">{countdownLabel(item.expiresAt)}</span>
          )}
        </div>
      )}

      {item.status !== "active" && (
        <Badge tone={item.status === "finished" ? "primary" : "neutral"}>
          {item.status === "finished" ? "Finished" : "Discarded"}
        </Badge>
      )}

      {(onFinish || onDiscard || editHref || onRestore) && (
      <div className="flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-2">
        {onFinish && (
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onFinish}>
            Mark finished
          </Button>
        )}
        {onDiscard && (
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onDiscard}>
            Mark discarded
          </Button>
        )}
        {editHref && (
          <ButtonLink to={editHref} size="sm" variant="secondary">
            Edit
          </ButtonLink>
        )}
        {onRestore && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={onRestore}
            className="text-[var(--color-primary)]"
          >
            Restore to active
          </Button>
        )}
      </div>
      )}
    </li>
  );
}
