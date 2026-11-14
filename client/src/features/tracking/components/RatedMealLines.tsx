import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { MealItem } from "@blw/shared";
import { StarRating } from "../../../components/ui/StarRating.js";
import { useIsOffline } from "../../../lib/online.js";
import { DeletedMark, FoodNames } from "../../catalog/components/DeletedMark.js";
import { mealEditHref, mealLines } from "../../plate/plate.js";
import { ItemPlate } from "../../plate/PlateItemRow.js";
import { useMeals, useUpdateMeal } from "../hooks.js";

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]";
const DETAIL = "text-[13px] leading-[1.35] text-[var(--color-text-muted)]";

/**
 * Each card's own line look. `stars` lines the glyphs up under the name
 * (plate + gap, less the star's 9px inset) while five 44px stars fit
 * beside the plate, and under the plate's edge when they don't (the list
 * is a size container, as the plate's item card is).
 */
const LOOK = {
  // Home's Up next card (ledger 944).
  home: {
    plate: 36,
    row: "gap-2.5",
    li: "py-[7px]",
    divider: "border-t border-[var(--color-divider)]",
    name: "text-[15px] leading-[1.3] font-semibold",
    stars: "ml-[37px] @max-[256px]:-ml-[9px]",
  },
  // A Meal Plan card (ledger 944).
  plan: {
    plate: 24,
    row: "gap-1.5",
    li: "py-0.5",
    divider: "",
    name: "text-[13px] leading-[1.3]",
    stars: "ml-[21px] @max-[240px]:-ml-[9px]",
  },
} as const;

export interface RatedMealLinesProps {
  meal: MealItem;
  look: keyof typeof LOOK;
}

/**
 * A logged meal's items, each with its stars (ledger 944: a served meal's
 * card on Home and on the Meal Plan; the meal page that had them first,
 * 939, is retired, 966). One tap saves that
 * one item's stars (PATCH `itemRatings`, ledger 902) and shows the tapped
 * value while it does; offline every star waits (SPEC §4.4) and says so; a
 * failed save says so. A recipe says what was left out. A container has no
 * line of its own (ledger 977, as the Food log since 973): each food or
 * recipe it held is its own line in its place, with its own stars, and
 * links to the batch (the storage ⇄ meal traceback, item 162). Everything
 * tappable sits above a card's stretched link (relative z-10), never inside
 * it, and nothing else does.
 */
export function RatedMealLines({ meal, look }: RatedMealLinesProps) {
  const updateMeal = useUpdateMeal(meal.babyId);
  const offline = useIsOffline();
  const style = LOOK[look];
  const offlineId = `rate-offline-${meal.id}`;
  // While a tap is saving, show what was tapped rather than the old value.
  const pending =
    updateMeal.isPending && updateMeal.variables?.id === meal.id ? (updateMeal.variables.input.itemRatings ?? {}) : {};

  return (
    <>
      <ul aria-label="On the plate" className="@container flex flex-col">
        {mealLines(meal, { flattenContainers: true }).map((line, at) => (
          <li key={line.key} className={`${style.li} ${at > 0 ? style.divider : ""}`}>
            <div className={`flex items-center ${style.row}`}>
              {/* A two-plate item is positioned, so it paints over the stretched
                  link: let the tap through to the card (968). */}
              <ItemPlate plates={line.plates} size={style.plate} className="pointer-events-none" />
              <div className="min-w-0">
                <p className={`${style.name} break-words text-[var(--color-text)]`}>
                  {line.name}
                  <DeletedMark deleted={line.deleted} />
                </p>
                {line.leftOut.length > 0 && (
                  <p className={DETAIL}>
                    <span className="font-semibold text-[var(--color-apricot-text)]">
                      Left out: <FoodNames foods={line.leftOut} />
                    </span>
                  </p>
                )}
                {line.storageItemId && (
                  <p className={DETAIL}>
                    {/* The 44px box reaches over the name above (plain text)
                        and is painted under the star lines below. */}
                    <Link
                      to={`/storage/${line.storageItemId}`}
                      className={`relative z-10 -mt-3.5 -mb-2.5 inline-flex min-h-11 items-center rounded-[var(--radius-sm)] underline underline-offset-2 ${FOCUS_RING}`}
                    >
                      From storage
                    </Link>
                  </p>
                )}
              </div>
            </div>
            {line.ratings.map((rating) => (
              // Above the stretched link, but only the star buttons take a tap:
              // the row's width beside them falls through
              // to the card (ledger 968: a served card's tap opens Edit).
              <div key={rating.id} className={`pointer-events-none relative z-10 [&_button]:pointer-events-auto ${style.stars}`}>
                <div className="-my-1">
                  <StarRating
                    label={`Rating for ${rating.label}`}
                    value={rating.id in pending ? pending[rating.id]! : rating.rating}
                    onChange={(value) => updateMeal.mutate({ id: meal.id, input: { itemRatings: { [rating.id]: value } } })}
                    disabled={offline}
                  />
                </div>
              </div>
            ))}
          </li>
        ))}
      </ul>
      {offline && (
        <p id={offlineId} className="mt-1 text-xs text-[var(--color-text-muted)]">
          You're offline.
        </p>
      )}
      {updateMeal.isError && !offline && (
        <p role="alert" className="mt-1 text-xs text-[var(--color-danger)]">
          Couldn't save that rating — try again.
        </p>
      )}
    </>
  );
}

/** Where a served planned meal's Add more goes (ledger 944): the logged
 * meal's Edit screen with Add more already open (`add=1`, read once). */
export function addMoreHref(mealId: string): string {
  return `${mealEditHref(mealId)}&add=1`;
}

export interface ServedMealLinesProps {
  babyId: string;
  /** The logged meal a planned meal was served as. */
  mealId: string;
  look: "home" | "plan";
  /** Shown until the logged meal is in the recent meals (or if it never is). */
  fallback: ReactNode;
}

/**
 * A served planned meal's lines with stars (ledger 944): the LOGGED meal's
 * items, found in the recent meals the Food log reads
 * (`useMeals`, last 100), so a tap rates what was served. Mounted only for
 * a served meal, so an unserved plan reads no meals.
 */
export function ServedMealLines({ babyId, mealId, look, fallback }: ServedMealLinesProps) {
  const meals = useMeals(babyId, { limit: 100 });
  const meal = meals.data?.items.find((candidate) => candidate.id === mealId);
  return meal ? <RatedMealLines meal={meal} look={look} /> : <>{fallback}</>;
}
