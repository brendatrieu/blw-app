import { useState } from "react";
import type { PantryItem } from "@blw/shared";
import { Menu, MenuItem, MenuLinkItem } from "../../../components/ui/Menu.js";
import { Sheet } from "../../../components/ui/Sheet.js";
import { useUpdatePantryItem } from "../hooks.js";
import { pantryItemTitle, resolvePantryItemMenuActions } from "../format.js";
import { ServeControl } from "./PantryItemCard.js";

export interface PantryItemActionsMenuProps {
  item: PantryItem;
  /** The baby to serve as — Home only renders this menu once a baby is
   * already resolved, so this is required (unlike `PantryItemCard`'s own
   * optional `babyId`, which also covers a "no baby yet" render). */
  babyId: string;
}

/**
 * Home's compact three-dot Actions menu for a pantry row: Serve / Edit /
 * Mark finished, none of which require leaving Home. Reuses
 * `ServeControl` verbatim (opened in a small `Sheet` rather than forked)
 * so Serve behaves identically to the Pantry page's own inline control —
 * same stepper, same notes, same success/error handling. Which actions
 * are offered is delegated entirely to `resolvePantryItemMenuActions` so
 * the gating logic (active/label-only) has one home, unit-tested there.
 */
export function PantryItemActionsMenu({ item, babyId }: PantryItemActionsMenuProps) {
  const [serveOpen, setServeOpen] = useState(false);
  const updateItem = useUpdatePantryItem();
  const { serve, edit, finish } = resolvePantryItemMenuActions(item);

  return (
    <>
      <Menu label="Actions">
        {(close) => (
          <>
            {serve && (
              <MenuItem
                onSelect={() => {
                  setServeOpen(true);
                  close();
                }}
              >
                Serve
              </MenuItem>
            )}
            {edit && (
              <MenuLinkItem to={`/pantry/${item.id}/edit`} onSelect={close}>
                Edit
              </MenuLinkItem>
            )}
            {finish && (
              <MenuItem
                disabled={updateItem.isPending}
                onSelect={() => {
                  updateItem.mutate({ id: item.id, input: { status: "finished" } });
                  close();
                }}
              >
                Mark finished
              </MenuItem>
            )}
          </>
        )}
      </Menu>

      <Sheet open={serveOpen} onClose={() => setServeOpen(false)} title={pantryItemTitle(item)}>
        <ServeControl item={item} babyId={babyId} startExpanded />
      </Sheet>
    </>
  );
}
