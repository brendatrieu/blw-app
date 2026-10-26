import { useState, type ReactNode } from "react";
import { CloseGlyph, ICON_BUTTON_CLASSES } from "../../components/ui/iconButton.js";
import { Skeleton } from "../../components/ui/Skeleton.js";
import { StarRating } from "../../components/ui/StarRating.js";
import { DeletedMark, FoodNames } from "../catalog/components/DeletedMark.js";
import { FoodPlate } from "../catalog/components/FoodPlate.js";
import { foodPlate, type Plate } from "../catalog/foodEmoji.js";
import { useRecipe } from "../catalog/hooks.js";
import { servePartHint } from "../storage/format.js";
import {
  entryKey,
  partId,
  type ContainerEntry,
  type ContainerPart,
  type FoodEntry,
  type PlateAction,
  type PlateEntry,
  type PlateFoodRef,
  type RecipeEntry,
} from "./plate.js";

const RECIPE_PLATE: Plate = { emoji: "🍲", tint: "neutral" };

/** One item's card (CD boards): elevated, hairline border, 20px corners. A
 * size container, so its star line can drop below the plate when the name
 * column is too narrow for five 44px stars (ratings A at 320, round 3). */
const ITEM =
  "@container rounded-[var(--radius-lg)] border border-[var(--color-divider)] bg-[var(--color-bg-elevated)] py-2 pr-2 pl-3";
const TITLE = "font-semibold leading-[1.3] break-words text-[var(--color-text)]";
const DETAIL = "text-[13px] leading-[1.35] text-[var(--color-text-muted)]";
const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]";
const STEP_BUTTON =
  "flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm font-medium text-[var(--color-text)] disabled:opacity-60";
const REMOVE_BUTTON = `${ICON_BUTTON_CLASSES} text-[var(--color-text-muted)]`;

const Name = ({ food }: { food: PlateFoodRef }) => (
  <>
    {food.name}
    <DeletedMark deleted={food.deleted} />
  </>
);

interface RowProps<E extends PlateEntry> {
  entry: E;
  dispatch: (action: PlateAction) => void;
  disabled?: boolean;
}

/**
 * One item on the plate (plan SPEC §5): a fresh food, a fresh recipe (with
 * its "Ingredients" to leave some out), or a container from storage (its
 * servings and a star line per food or recipe it holds). Every change goes
 * through `dispatch`, the plate reducer's.
 */
export function PlateItemRow({ entry, dispatch, disabled }: RowProps<PlateEntry>) {
  if (entry.kind === "food") return <FoodItemRow entry={entry} dispatch={dispatch} disabled={disabled} />;
  if (entry.kind === "recipe") return <RecipeItemRow entry={entry} dispatch={dispatch} disabled={disabled} />;
  return <ContainerItemRow entry={entry} dispatch={dispatch} disabled={disabled} />;
}

interface FreshItemProps {
  plate: Plate;
  name: ReactNode;
  /** The item's plain name, for "Rating for …" and "Remove …". */
  label: string;
  detail?: ReactNode;
  rating: number | null;
  onRate: (rating: number | null) => void;
  onRemove: () => void;
  disabled: boolean | undefined;
  children?: ReactNode;
}

/**
 * A fresh item's frame (ratings A, CD-Log-Meal): the 40px plate, the name
 * with its stars right under it, and × at the right. Where the name column
 * is narrower than the stars (under 375 wide), the star line moves below the
 * plate and starts at the item's left edge.
 */
function FreshItem({ plate, name, label, detail, rating, onRate, onRemove, disabled, children }: FreshItemProps) {
  return (
    <li className={ITEM}>
      <div className="grid grid-cols-[40px_minmax(0,1fr)_44px] items-start gap-x-3">
        <FoodPlate {...plate} size={40} className="row-span-2 @max-[319px]:row-span-1" />
        <div className="min-w-0 pt-0.5">
          <p className={TITLE}>{name}</p>
          {detail}
        </div>
        <button
          type="button"
          aria-label={`Remove ${label}`}
          disabled={disabled}
          onClick={onRemove}
          className={`${REMOVE_BUTTON} row-span-2 @max-[319px]:row-span-1`}
        >
          <CloseGlyph />
        </button>
        {/* -9px: the first star's glyph, not its 44px box, lines up with the name. */}
        <div className="col-start-2 -ml-[9px] @max-[319px]:col-span-3 @max-[319px]:col-start-1">
          <StarRating label={`Rating for ${label}`} value={rating} onChange={onRate} disabled={disabled} />
        </div>
      </div>
      {children}
    </li>
  );
}

export function FoodItemRow({ entry, dispatch, disabled }: RowProps<FoodEntry>) {
  const key = entryKey(entry);
  return (
    <FreshItem
      plate={foodPlate(entry.food)}
      name={<Name food={entry.food} />}
      label={entry.food.name}
      rating={entry.rating}
      onRate={(rating) => dispatch({ type: "rate", key, rating })}
      onRemove={() => dispatch({ type: "remove", key })}
      disabled={disabled}
    />
  );
}

/**
 * A fresh recipe (CD-Leave-Out): "Left out: …" once something is unticked,
 * and "Ingredients", which opens the recipe's current ingredients as ticks.
 * They load on the first opening (the recipe detail's cache).
 */
export function RecipeItemRow({ entry, dispatch, disabled }: RowProps<RecipeEntry>) {
  const [open, setOpen] = useState(false);
  const detail = useRecipe(open ? entry.recipe.id : undefined);
  const key = entryKey(entry);
  const { title } = entry.recipe;
  const panelId = `ingredients-${entry.recipe.id}`;
  const leftOut = new Set(entry.leftOut.map((food) => food.id));
  const ingredients = (detail.data?.ingredients ?? [])
    .map((ingredient): PlateFoodRef => ({
      id: ingredient.foodId,
      slug: ingredient.foodSlug,
      name: ingredient.foodName,
      emoji: ingredient.foodEmoji,
      deleted: ingredient.deleted,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <FreshItem
      plate={RECIPE_PLATE}
      name={title}
      label={title}
      rating={entry.rating}
      onRate={(rating) => dispatch({ type: "rate", key, rating })}
      onRemove={() => dispatch({ type: "remove", key })}
      disabled={disabled}
      detail={
        <div className={`flex min-h-5 flex-wrap items-center ${DETAIL}`}>
          {entry.leftOut.length > 0 && (
            <>
              <span className="font-semibold text-[var(--color-apricot-text)]">
                Left out: <FoodNames foods={entry.leftOut} />
              </span>
              <span aria-hidden="true" className="mx-1.5">
                ·
              </span>
            </>
          )}
          {/* The 44px box reaches up over the name (plain text) and is
              painted under the stars below, so it never takes their taps. */}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen(!open)}
            className={`-mt-3.5 -mb-2.5 inline-flex min-h-11 items-center gap-[3px] rounded-[var(--radius-sm)] font-bold text-[var(--color-accent)] ${FOCUS_RING}`}
          >
            <span className="leading-4">Ingredients</span>
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={open ? "rotate-180" : undefined}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
      }
    >
      {open && (
        <div
          id={panelId}
          className="mt-1.5 mr-1 mb-1 ml-[52px] rounded-[var(--radius-md)] bg-[var(--color-bg-inset)] px-3 pt-2 pb-1"
        >
          <p id={`${panelId}-hint`} className="mb-0.5 text-[13px] text-[var(--color-text-muted)]">
            Untick anything you left out this time.
          </p>
          {detail.isError ? (
            <p className="py-2 text-[13px] text-[var(--color-text-muted)]">Couldn't load the ingredients.</p>
          ) : !detail.data ? (
            <Skeleton className="my-3 h-5 w-2/3" />
          ) : (
            <ul aria-label={`Ingredients of ${title}`} aria-describedby={`${panelId}-hint`} className="flex flex-col">
              {ingredients.map((food) => {
                const out = leftOut.has(food.id);
                return (
                  <li key={food.id} className="border-t border-[var(--color-divider)] first:border-t-0">
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
                      <input
                        type="checkbox"
                        checked={!out}
                        disabled={disabled}
                        onChange={() => dispatch({ type: "toggleLeftOut", key, food })}
                        className="size-6 shrink-0 accent-[var(--color-accent)]"
                      />
                      <span
                        className={out ? "text-[var(--color-text-muted)] line-through" : "text-[var(--color-text)]"}
                      >
                        <Name food={food} />
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </FreshItem>
  );
}

/** A container's 40px mark: its food (or first two, overlapped as on the
 * boards), else the recipe pot. */
function ContainerPlate({ parts }: { parts: readonly ContainerPart[] }) {
  const plates = parts.flatMap((part) => (part.kind === "food" ? [foodPlate(part.food)] : []));
  if (plates.length < 2) return <FoodPlate {...(plates[0] ?? RECIPE_PLATE)} size={40} />;
  return (
    <span aria-hidden="true" className="relative block size-10 shrink-0">
      <FoodPlate {...plates[0]!} size={28} className="absolute top-0 left-0" />
      <FoodPlate
        {...plates[1]!}
        size={28}
        className="absolute right-0 bottom-0 ring-2 ring-[var(--color-bg-elevated)]"
      />
    </span>
  );
}

const partLabel = (part: ContainerPart) => (part.kind === "food" ? part.food.name : part.recipe.title);

/**
 * A container (CD-Serve-From-Storage): plate, title over where it is and
 * what is left, the servings stepper, then its stars: right under the title
 * when it holds one thing, else a line per food or recipe (plate, name,
 * stars), as CD-Log-Meal draws them. A container the saved meal already had
 * also gets × (chair decision, SPEC §5), which puts its servings back; one
 * served before servings were recorded gets × only. The stepper stays
 * between 1 and what the container can give (the reducer clamps, as Serve
 * always did). Where the title would get too narrow, the controls wrap
 * below it, at the right.
 */
export function ContainerItemRow({ entry, dispatch, disabled }: RowProps<ContainerEntry>) {
  const key = entryKey(entry);
  const kept = entry.savedServings !== undefined;
  const { servings, title } = entry;
  const stars = (part: ContainerPart) => (
    <StarRating
      label={`Rating for ${partLabel(part)}`}
      value={part.rating}
      onChange={(rating) => dispatch({ type: "rate", key, partId: partId(part), rating })}
      disabled={disabled}
    />
  );
  const [only] = entry.parts;

  return (
    <li className={ITEM}>
      <div className="flex flex-wrap items-center gap-x-3">
        <ContainerPlate parts={entry.parts} />
        <div className="min-w-32 flex-1">
          <p className={TITLE}>{title}</p>
          <p className={DETAIL}>{entry.container ? servePartHint(entry.container) : "From storage"}</p>
        </div>
        {(servings !== null || kept) && (
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {servings !== null && (
              <div className="flex items-center gap-1.5" role="group" aria-label={`Servings: ${title}`}>
                <button
                  type="button"
                  aria-label="Decrease servings"
                  disabled={disabled}
                  onClick={() => dispatch({ type: "servings", key, servings: servings - 1 })}
                  className={STEP_BUTTON}
                >
                  −
                </button>
                <span
                  aria-live="polite"
                  className="min-w-6 text-center text-sm font-medium tabular-nums text-[var(--color-text)]"
                >
                  {servings}
                </span>
                <button
                  type="button"
                  aria-label="Increase servings"
                  disabled={disabled}
                  onClick={() => dispatch({ type: "servings", key, servings: servings + 1 })}
                  className={STEP_BUTTON}
                >
                  +
                </button>
              </div>
            )}
            {kept && (
              <button
                type="button"
                aria-label={`Remove ${title}`}
                disabled={disabled}
                onClick={() => dispatch({ type: "remove", key })}
                className={REMOVE_BUTTON}
              >
                <CloseGlyph />
              </button>
            )}
          </div>
        )}
      </div>
      {entry.parts.length === 1 && only ? (
        <div className="mt-0.5 ml-[43px]">{stars(only)}</div>
      ) : (
        <div className="mt-0.5">
          {entry.parts.map((part) => (
            <div key={partId(part)} className="mt-1 flex items-start gap-3">
              <span className="flex w-10 shrink-0 justify-center">
                <FoodPlate {...(part.kind === "food" ? foodPlate(part.food) : RECIPE_PLATE)} size={24} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-6 font-semibold break-words text-[var(--color-text)]">
                  {part.kind === "food" ? <Name food={part.food} /> : part.recipe.title}
                </p>
                <div className="-mt-0.5 -ml-[9px]">{stars(part)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
