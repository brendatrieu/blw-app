import type { ReactNode } from "react";
import { DELETED_FOOD_MARK } from "../constants.js";

/**
 * The muted " (deleted)" after a food name wherever history renders one its
 * owner deleted (ledger 543/555). Renders nothing for a food that still
 * exists. `withDeletedMark` is the plain-string twin, kept ONLY where a
 * string is unavoidable: a picker option label (options are strings), the
 * custom-recipe quantity field label (`Field` only de-emphasizes
 * "(optional)" on a string), the serve sheet's title (it doubles as the
 * dialog's aria-label) and the storage undo banner's state.
 */
export function DeletedMark({ deleted }: { deleted: boolean | undefined }) {
  if (!deleted) return null;
  // A no-break space, so a wrapping title never strands "(deleted)" on a line
  // of its own — it moves with the last word of the name it marks.
  return <span className="font-normal text-[var(--color-text-muted)]">{"\u00a0"}{DELETED_FOOD_MARK}</span>;
}

/** "A, B (deleted), C": food names comma-joined, each deleted one carrying
 * the muted mark — for every title or line that lists a meal's, container's
 * or recipe's foods. The names between marks stay ONE text node, so a list
 * with nothing deleted renders exactly the plain "A, B" it always did. With
 * a mark, the pieces are wrapped in ONE span: a flex parent (PageHeader's h1)
 * would otherwise lay each piece out as its own column. */
export function FoodNames({ foods }: { foods: readonly { name: string; deleted?: boolean | undefined }[] }) {
  const parts: ReactNode[] = [];
  let text = "";
  foods.forEach((food, index) => {
    text += `${index > 0 ? ", " : ""}${food.name}`;
    if (food.deleted) {
      parts.push(text, <DeletedMark key={index} deleted />);
      text = "";
    }
  });
  if (text) parts.push(text);
  return parts.length > 1 ? <span>{parts}</span> : <>{parts}</>;
}
