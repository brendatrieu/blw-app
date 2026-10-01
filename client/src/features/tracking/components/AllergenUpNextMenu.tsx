import type { AllergenProgressItem } from "@blw/shared";
import { Menu, MenuLinkItem } from "../../../components/ui/Menu.js";
import { useAllergenDetail } from "../hooks.js";
import { serveFoodId } from "../allergenRow.js";

export interface AllergenUpNextMenuProps {
  babyId: string;
  item: Pick<AllergenProgressItem, "allergenSlug" | "allergenName">;
  /** The kebab's accessible name. */
  label: string;
}

/**
 * The kebab on a due allergen's Up next row (item 660): "Log meal" with the
 * food that carries it already picked, and "Open <Name>". The food comes from
 * the allergen's detail (the same cached query its page reads); until that
 * arrives, or when no food can be logged, Log meal opens an empty form.
 */
export function AllergenUpNextMenu({ babyId, item, label }: AllergenUpNextMenuProps) {
  const { data } = useAllergenDetail(babyId, item.allergenSlug);
  const foodId = data ? serveFoodId(data) : null;

  return (
    <Menu label={label}>
      {(close) => (
        <>
          <MenuLinkItem to={foodId ? `/log-meal?food=${foodId}` : "/log-meal"} onSelect={close}>
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
