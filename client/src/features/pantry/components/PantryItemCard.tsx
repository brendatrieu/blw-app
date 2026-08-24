import type { PantryItem } from "@blw/shared";
import { Badge } from "../../catalog/components/Badge.js";
import { countdownLabel, LOCATION_LABEL, pantryItemTitle } from "../format.js";

interface PantryItemCardProps {
  item: PantryItem;
  busy: boolean;
  onFinish?: () => void;
  onDiscard?: () => void;
  onEdit?: () => void;
  onRestore?: () => void;
}

export function PantryItemCard({ item, busy, onFinish, onDiscard, onEdit, onRestore }: PantryItemCardProps) {
  const preparedLabel = new Date(item.preparedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-[var(--color-text)]">{pantryItemTitle(item)}</span>
          <span className="text-xs text-[var(--color-text-muted)]">
            Prepared {preparedLabel}
            {item.quantityNote ? ` · ${item.quantityNote}` : ""}
          </span>
        </div>
        <Badge tone="neutral">{LOCATION_LABEL[item.location]}</Badge>
      </div>

      {item.status === "active" && (
        <div className="flex items-center gap-2">
          {item.expired ? (
            <Badge tone="danger">Expired — discard?</Badge>
          ) : item.useSoon ? (
            <Badge tone="accent">Use soon</Badge>
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

      {(onFinish || onDiscard || onEdit || onRestore) && (
      <div className="flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-2">
        {onFinish && (
          <button
            type="button"
            disabled={busy}
            onClick={onFinish}
            className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-text)] disabled:opacity-60"
          >
            Mark finished
          </button>
        )}
        {onDiscard && (
          <button
            type="button"
            disabled={busy}
            onClick={onDiscard}
            className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-text)] disabled:opacity-60"
          >
            Mark discarded
          </button>
        )}
        {onEdit && (
          <button
            type="button"
            disabled={busy}
            onClick={onEdit}
            className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-text)] disabled:opacity-60"
          >
            Edit
          </button>
        )}
        {onRestore && (
          <button
            type="button"
            disabled={busy}
            onClick={onRestore}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] disabled:opacity-60"
          >
            Restore to active
          </button>
        )}
      </div>
      )}
    </li>
  );
}
