import type { AllergenProgressItem } from "@blw/shared";
import { Menu, MenuLinkItem } from "../../../components/ui/Menu.js";

export interface AllergenUpNextMenuProps {
  babyId: string;
  item: Pick<AllergenProgressItem, "allergenSlug" | "allergenName">;
  /** The kebab's accessible name. */
  label: string;
}

/**
 * The kebab on a due allergen's Up next row (item 660): "Log meal" and
 * "Open <Name>". Log meal opens an empty form like everywhere else: the
 * parent picks the food (owner, ledger 890 — no pre-picked suggestion).
 */
export function AllergenUpNextMenu({ babyId, item, label }: AllergenUpNextMenuProps) {
  return (
    <Menu label={label}>
      {(close) => (
        <>
          <MenuLinkItem to="/log-meal" onSelect={close}>
            Log meal
          </MenuLinkItem>
          <MenuLinkItem to={`/babies/${babyId}/allergens/${item.allergenSlug}`} onSelect={close}>
            Open {item.allergenName}
          </MenuLinkItem>
        </>
      )}
    </Menu>
  );
}
