import { Menu, MenuItem, MenuLinkItem } from "../../../components/ui/Menu.js";

export interface MealActionsMenuProps {
  mealId: string;
  /** Reveals the card's own "Remove this meal?" confirm row (the shared
   * `pendingDeleteId` plumbing) — the menu never deletes anything itself,
   * so the confirmation still happens in the card the user is looking at. */
  onRequestDelete: () => void;
}

/**
 * The food log card's compact three-dot Actions menu: Edit / Delete, mirroring
 * `FridgeItemActionsMenu`'s shape so a meal row and a fridge row offer their
 * actions the same way. Edit is a real `MenuLinkItem` (so modifier-click works
 * like any other in-app link); Delete only *asks* — it hands the request back
 * to `MealCard`, which owns the confirm row and the delete mutation via
 * `MealDeleteControl`.
 */
export function MealActionsMenu({ mealId, onRequestDelete }: MealActionsMenuProps) {
  return (
    <Menu label="Actions">
      {(close) => (
        <>
          <MenuLinkItem to={`/log-meal?edit=${mealId}`} onSelect={close}>
            Edit
          </MenuLinkItem>
          <MenuItem
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
