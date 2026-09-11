import { useState } from "react";
import type { StorageItem } from "@blw/shared";
import { Menu, MenuItem, MenuLinkItem } from "../../../components/ui/Menu.js";
import { useUpdateStorageItem } from "../hooks.js";
import { resolveStorageItemMenuActions } from "../format.js";
import { ServeSheet } from "./ServeSheet.js";

/** The rows this menu can show, in the order it shows them. */
export type StorageMenuRow = "serve" | "edit" | "remove" | "restore";

/** The single source of truth for each row's visible label — exported so a
 * test names the rows the way a user reads them, not by internal key. */
export const STORAGE_MENU_ROW_LABEL: Record<StorageMenuRow, string> = {
  serve: "Serve",
  edit: "Edit",
  remove: "Remove",
  restore: "Restore to active",
};

/**
 * Exactly which rows a given item's kebab shows, in order. Pure, so item 264
 * ("finished/discarded cards keep Restore to active in the kebab", "Serve is
 * withheld, not the whole menu") is one testable list rather than a chain of
 * `&&`s buried in JSX. The item's own gating comes from
 * `resolveStorageItemMenuActions`; the two CALLER facts — is there a baby to
 * serve as, does this caller handle restoring — come in as flags.
 */
export function storageMenuRows(
  item: Pick<StorageItem, "status" | "foodSlug" | "recipeTitle">,
  { hasBaby, canRestore }: { hasBaby: boolean; canRestore: boolean },
): StorageMenuRow[] {
  const actions = resolveStorageItemMenuActions(item);
  const rows: StorageMenuRow[] = [];
  if (actions.serve && hasBaby) rows.push("serve");
  if (actions.edit) rows.push("edit");
  if (actions.remove) rows.push("remove");
  if (actions.restore && canRestore) rows.push("restore");
  return rows;
}

export interface StorageItemActionsMenuProps {
  item: StorageItem;
  /** The baby to serve as. Optional because a list can render before a baby
   * resolves (and History rows never serve at all) — Serve is simply
   * withheld until there's one, exactly as `StorageItemCard` gates it. */
  babyId?: string;
  /** Overrides the menu's own discard mutation — `StoragePage` passes its
   * undoable `useStorageStatusChange` setter so removing from the Storage tab
   * still raises the undo banner. Omitted on Home, which has no banner. */
  onRemove?: () => void;
  /** Restoring a finished/discarded item to active. Only offered when the
   * caller supplies it (the Storage tab's History view). */
  onRestore?: () => void;
  /** A status mutation is already in flight upstream. */
  busy?: boolean;
}

/**
 * The compact three-dot Actions menu a storage row carries — on Home and,
 * since item 264, on the Storage tab too, replacing that page's
 * Serve/Remove/Edit/Restore footer row so both lists offer one identical
 * action surface. Serve opens the shared `ServeSheet` (item 263); Edit
 * navigates; Remove and Restore are status changes, run by the caller's
 * handler when it has one (so `StoragePage` keeps its undo banner) and by
 * this menu's own mutation otherwise.
 *
 * Which actions are offered is delegated entirely to
 * `resolveStorageItemMenuActions` so the gating logic (active/label-only)
 * has one home, unit-tested there.
 */
export function StorageItemActionsMenu({ item, babyId, onRemove, onRestore, busy = false }: StorageItemActionsMenuProps) {
  const [serveOpen, setServeOpen] = useState(false);
  const updateItem = useUpdateStorageItem();
  const rows = storageMenuRows(item, { hasBaby: Boolean(babyId), canRestore: Boolean(onRestore) });
  const pending = busy || updateItem.isPending;

  return (
    <>
      <Menu label="Actions">
        {(close) => (
          <>
            {rows.includes("serve") && (
              <MenuItem
                onSelect={() => {
                  setServeOpen(true);
                  close();
                }}
              >
                {STORAGE_MENU_ROW_LABEL.serve}
              </MenuItem>
            )}
            {rows.includes("edit") && (
              <MenuLinkItem to={`/storage/${item.id}/edit`} onSelect={close}>
                {STORAGE_MENU_ROW_LABEL.edit}
              </MenuLinkItem>
            )}
            {rows.includes("remove") && (
              <MenuItem
                disabled={pending}
                onSelect={() => {
                  // Manual removal = discarded; "finished" is reserved for
                  // automatic depletion when tracked servings reach zero.
                  if (onRemove) onRemove();
                  else updateItem.mutate({ id: item.id, input: { status: "discarded" } });
                  close();
                }}
              >
                {STORAGE_MENU_ROW_LABEL.remove}
              </MenuItem>
            )}
            {rows.includes("restore") && (
              <MenuItem
                disabled={pending}
                onSelect={() => {
                  onRestore?.();
                  close();
                }}
              >
                {STORAGE_MENU_ROW_LABEL.restore}
              </MenuItem>
            )}
          </>
        )}
      </Menu>

      {babyId && <ServeSheet item={item} babyId={babyId} open={serveOpen} onClose={() => setServeOpen(false)} />}
    </>
  );
}
