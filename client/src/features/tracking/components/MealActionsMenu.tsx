import { Menu, MenuItem, MenuLinkItem } from "../../../components/ui/Menu.js";

export interface MealActionsMenuProps {
  mealId: string;
  /** Opens the list's "Delete this meal?" pop-up (`MealDeleteDialog`) — the
   * menu never deletes anything itself. */
  onRequestDelete: () => void;
  /** The kebab's accessible name; defaults to "Actions". */
  label?: string;
  /** Delete waits (the meal page offline: a delete is a plate write, SPEC §4.4). */
  deleteDisabled?: boolean;
  /** The id of the visible line saying why Delete waits ("You're offline."). */
  deleteDescribedBy?: string;
}

/**
 * The food log card's compact three-dot Actions menu: Edit / Delete, mirroring
 * `StorageItemActionsMenu`'s shape so a meal row and a storage row offer their
 * actions the same way. Edit is a real `MenuLinkItem` (so modifier-click works
 * like any other in-app link); Delete only *asks* — it hands the request back
 * through `MealCard` to the list, which owns the delete question and its
 * mutation (`MealDeleteDialog`).
 */
export function MealActionsMenu({ mealId, onRequestDelete, label = "Actions", deleteDisabled, deleteDescribedBy }: MealActionsMenuProps) {
  return (
    <Menu label={label}>
      {(close) => (
        <>
          <MenuLinkItem to={`/log-meal?edit=${mealId}`} onSelect={close}>
            Edit
          </MenuLinkItem>
          <MenuItem
            disabled={deleteDisabled}
            describedBy={deleteDescribedBy}
            onSelect={() => {
              onRequestDelete();
              close();
            }}
          >
            Delete
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
