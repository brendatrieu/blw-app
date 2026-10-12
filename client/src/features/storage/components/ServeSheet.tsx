import { useState, type ReactNode } from "react";
import type { FoodListItem, ServeStorageInput, StorageItem } from "@blw/shared";
import { useStorageServe } from "../hooks.js";
import { clampServings, servePartHint, storageItemTitle } from "../format.js";
import { AddMoreSheet } from "./AddMoreSheet.js";
import { storageItemCluster } from "./StorageItemCard.js";
import { Badge } from "../../../components/ui/Badge.js";
import { Button } from "../../../components/ui/Button.js";
import { DateTimeField, nowAtMinute } from "../../../components/ui/DateTimeField.js";
import { Field, OptionalLabel } from "../../../components/ui/Field.js";
import { CloseGlyph, ICON_BUTTON_CLASSES } from "../../../components/ui/iconButton.js";
import { Textarea } from "../../../components/ui/Input.js";
import { Sheet } from "../../../components/ui/Sheet.js";
import { FoodPlate } from "../../catalog/components/FoodPlate.js";
import { foodPlate } from "../../catalog/foodEmoji.js";
import { useRecipeDetails } from "../../catalog/hooks.js";
import { HowToLink } from "../../safety/HowToLink.js";
import { useIsOffline } from "../../../lib/online.js";
import { ignoreTapsBriefly } from "../../../lib/tapGuard.js";
import { MealRatingsField, RECIPE_ROW_PREFIX, type MealRatingRow } from "../../tracking/components/MealRatingsField.js";

/** Ceiling for the serve stepper on an untracked item (no servingsLeft to
 * bound it by) — generous enough never to feel like a real limit. */
const UNTRACKED_SERVINGS_MAX = 99;

/** One container in the Serving list and how many servings it gives. */
export interface ServePart {
  item: StorageItem;
  servings: number;
}

/** A fresh food: what its row and the request need. */
export type FreshFood = Pick<FoodListItem, "id" | "slug" | "name" | "category" | "emoji">;

/** A fresh recipe (owner 2026-10-07): made now, not from storage. */
export interface FreshRecipe {
  id: string;
  title: string;
}

/**
 * The meal's recipes, in the server's order (DESIGN-B §5): each container's
 * recipes in Serving-list order, then the fresh ones. A recipe that comes
 * twice (fridge and freezer containers, or a fresh one also in storage) is
 * ONE recipe on the meal, so one star row.
 */
export function servedRecipes(parts: readonly ServePart[], freshRecipes: readonly FreshRecipe[]): FreshRecipe[] {
  const titles = new Map<string, string>();
  for (const { item } of parts) {
    const recipes =
      item.recipes && item.recipes.length > 0
        ? item.recipes
        : item.recipeId
          ? [{ id: item.recipeId, title: item.recipeTitle ?? storageItemTitle(item) }]
          : [];
    for (const recipe of recipes) if (!titles.has(recipe.id)) titles.set(recipe.id, recipe.title);
  }
  for (const recipe of freshRecipes) if (!titles.has(recipe.id)) titles.set(recipe.id, recipe.title);
  return [...titles].map(([id, title]) => ({ id, title }));
}

/**
 * The star rows (DESIGN-B §2's one rule, with nothing on the meal before):
 * one per recipe, then one per food that is not an ingredient of ANY of the
 * meal's recipes — the foods a container holds and the fresh foods. A
 * recipe-only container's foods ARE its recipe's ingredients, so they never
 * get a row (MR-Serve: Egg sits in "Broccoli + Egg" and in Salmon Cakes, so
 * it is rated through the recipe).
 *
 * `ingredientFoodIds` is null while a recipe's ingredients are still
 * loading: no food can be told rateable yet, and a guess would let a parent
 * rate a food the server then refuses, so no food row shows until they land.
 */
export function serveRatingRows(
  parts: readonly ServePart[],
  freshFoods: readonly FreshFood[],
  freshRecipes: readonly FreshRecipe[],
  ingredientFoodIds: ReadonlySet<string> | null,
  ratings: Readonly<Record<string, number | null>>,
): MealRatingRow[] {
  const recipes = servedRecipes(parts, freshRecipes);
  const rows: MealRatingRow[] = recipes.map((recipe) => ({
    key: `${RECIPE_ROW_PREFIX}${recipe.id}`,
    label: recipe.title,
    value: ratings[`${RECIPE_ROW_PREFIX}${recipe.id}`] ?? null,
  }));
  if (recipes.length > 0 && !ingredientFoodIds) return rows;
  const seen = new Set<string>();
  for (const food of [...parts.flatMap((part) => part.item.foods), ...freshFoods]) {
    if (seen.has(food.id) || ingredientFoodIds?.has(food.id)) continue;
    seen.add(food.id);
    rows.push({ key: food.id, label: food.name, value: ratings[food.id] ?? null });
  }
  return rows;
}

/**
 * The rating half of a serve, read off the VISIBLE rows (item 718): only
 * stars the parent chose are sent, so an unrated serve sends no rating key
 * at all, and a star on a row that has since gone (its food became a
 * recipe's ingredient) never leaks out.
 */
export function serveRatingsInput(rows: readonly MealRatingRow[]): Pick<ServeStorageInput, "foodRatings" | "recipeRatings"> {
  const foodRatings: Record<string, number> = {};
  const recipeRatings: Record<string, number> = {};
  for (const row of rows) {
    if (row.value == null) continue;
    if (row.key.startsWith(RECIPE_ROW_PREFIX)) recipeRatings[row.key.slice(RECIPE_ROW_PREFIX.length)] = row.value;
    else foodRatings[row.key] = row.value;
  }
  return {
    ...(Object.keys(foodRatings).length > 0 ? { foodRatings } : {}),
    ...(Object.keys(recipeRatings).length > 0 ? { recipeRatings } : {}),
  };
}

/**
 * The serve request (POST /api/storage/serve). `servedAt` is required on
 * purpose (item 354): the server defaults an omitted one to now, so an
 * optional parameter could silently drop the parent's chosen time. Fresh
 * foods and recipes are sent only when there are some.
 */
export function buildServeInput(
  babyId: string,
  parts: readonly ServePart[],
  freshFoods: readonly FreshFood[],
  freshRecipes: readonly FreshRecipe[],
  reactionNote: string,
  notes: string,
  servedAt: Date,
): ServeStorageInput {
  return {
    babyId,
    parts: parts.map(({ item, servings }) => ({ storageItemId: item.id, servings })),
    ...(freshFoods.length > 0 ? { foodIds: freshFoods.map((food) => food.id) } : {}),
    ...(freshRecipes.length > 0 ? { recipeIds: freshRecipes.map((recipe) => recipe.id) } : {}),
    servedAt: servedAt.toISOString(),
    reactionNote: reactionNote.trim() || null,
    notes: notes.trim() || null,
  };
}

/** One Serving row's frame (MR-Serve): plate, name over a quiet line, and
 * the control on the right. */
function ServingRow({ plate, title, detail, control }: { plate: ReactNode; title: string; detail: ReactNode; control: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-divider)] bg-[var(--color-bg-elevated)] py-2 pr-2 pl-3">
      {plate}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold break-words text-[var(--color-text)]">{title}</span>
        {detail}
      </span>
      {control}
    </li>
  );
}

const STEP_BUTTON =
  "flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm font-medium text-[var(--color-text)] disabled:opacity-60";

const FRESH_TAG = (
  <span className="flex">
    <Badge tone="leaf">Fresh, not from storage</Badge>
  </span>
);

interface ServeControlProps {
  item: StorageItem;
  babyId: string;
  /** Fired after a successful serve, so the sheet can close. */
  onServed?: () => void;
}

/**
 * The Serve sheet's BODY (MR-Serve, ledger 760): the "Serving" list — the
 * tapped container first, each container with its own −/+ servings, fresh
 * foods and recipes with ✕ and the "Fresh, not from storage" tag — and
 * "+ Add more" under it; then When, the star rows, the optional notes, and
 * one "Serve" that posts the whole sitting as ONE meal, all or nothing.
 */
export function ServeControl({ item, babyId, onServed }: ServeControlProps) {
  const [parts, setParts] = useState<ServePart[]>(() => [{ item, servings: 1 }]);
  const [freshFoods, setFreshFoods] = useState<FreshFood[]>([]);
  const [freshRecipes, setFreshRecipes] = useState<FreshRecipe[]>([]);
  const [addingMore, setAddingMore] = useState(false);
  // Defaults to the current minute, so a parent who just fed the baby can
  // ignore the field entirely (item 354). The future-time guard is
  // DateTimeField's own.
  const [servedAt, setServedAt] = useState(() => nowAtMinute());
  const [reactionNote, setReactionNote] = useState("");
  const [notes, setNotes] = useState("");
  const [ratings, setRatings] = useState<Record<string, number | null>>({});
  const serve = useStorageServe(babyId);
  // Ledger 766: offline, the mutation would pause and sit on "Serving…"
  // forever; Serve waits instead, with everything entered kept.
  const offline = useIsOffline();

  const recipeDetails = useRecipeDetails(servedRecipes(parts, freshRecipes).map((recipe) => recipe.id));
  const ingredientFoodIds = recipeDetails.every((detail) => detail.data)
    ? new Set(recipeDetails.flatMap((detail) => detail.data!.ingredients.map((ingredient) => ingredient.foodId)))
    : null;
  const rows = serveRatingRows(parts, freshFoods, freshRecipes, ingredientFoodIds, ratings);

  function step(index: number, by: number) {
    setParts((current) =>
      current.map((part, i) =>
        i === index
          ? { ...part, servings: clampServings(part.servings + by, part.item.servingsLeft ?? UNTRACKED_SERVINGS_MAX) }
          : part,
      ),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Item 714: the link's 44px box is wedged between the header's X and
          the list with no slack, so `pb-[5px]` lifts its text 2.5px above
          center, keeping the box 44px. */}
      <HowToLink slug="how-to-serve-from-storage" className="pb-[5px]" />

      <div role="group" aria-labelledby="serve-serving" className="flex flex-col gap-1.5">
        <span id="serve-serving" className="text-sm font-medium text-[var(--color-text)]">
          Serving
        </span>
        <ul className="flex flex-col gap-2">
          {parts.map((part, index) => {
            const title = storageItemTitle(part.item);
            return (
              <ServingRow
                key={part.item.id}
                plate={<FoodPlate {...storageItemCluster(part.item).plates[0]!} size={40} />}
                title={title}
                detail={<span className="text-xs text-[var(--color-text-muted)]">{servePartHint(part.item)}</span>}
                control={
                  <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label={`Servings: ${title}`}>
                    <button
                      type="button"
                      aria-label="Decrease servings"
                      disabled={serve.isPending}
                      onClick={() => step(index, -1)}
                      className={STEP_BUTTON}
                    >
                      −
                    </button>
                    <span
                      aria-live="polite"
                      className="min-w-6 text-center text-sm font-medium tabular-nums text-[var(--color-text)]"
                    >
                      {part.servings}
                    </span>
                    <button
                      type="button"
                      aria-label="Increase servings"
                      disabled={serve.isPending}
                      onClick={() => step(index, 1)}
                      className={STEP_BUTTON}
                    >
                      +
                    </button>
                  </div>
                }
              />
            );
          })}
          {freshFoods.map((food) => (
            <ServingRow
              key={`food-${food.id}`}
              plate={<FoodPlate {...foodPlate(food)} size={40} />}
              title={food.name}
              detail={FRESH_TAG}
              control={
                <button
                  type="button"
                  aria-label={`Remove ${food.name}`}
                  disabled={serve.isPending}
                  onClick={() => setFreshFoods((current) => current.filter((entry) => entry.id !== food.id))}
                  className={`${ICON_BUTTON_CLASSES} text-[var(--color-text-muted)]`}
                >
                  <CloseGlyph />
                </button>
              }
            />
          ))}
          {freshRecipes.map((recipe) => (
            <ServingRow
              key={`recipe-${recipe.id}`}
              plate={<FoodPlate emoji="🍲" tint="neutral" size={40} />}
              title={recipe.title}
              detail={FRESH_TAG}
              control={
                <button
                  type="button"
                  aria-label={`Remove ${recipe.title}`}
                  disabled={serve.isPending}
                  onClick={() => setFreshRecipes((current) => current.filter((entry) => entry.id !== recipe.id))}
                  className={`${ICON_BUTTON_CLASSES} text-[var(--color-text-muted)]`}
                >
                  <CloseGlyph />
                </button>
              }
            />
          ))}
        </ul>
        <button
          type="button"
          disabled={serve.isPending}
          onClick={() => setAddingMore(true)}
          className="flex min-h-12 items-center justify-center rounded-[var(--radius-md)] border-[1.5px] border-dashed border-[var(--color-border)] text-[15px] font-semibold text-[var(--color-accent)] disabled:opacity-60"
        >
          + Add more
        </button>
      </div>

      {/* Serving from storage is usually a "that already happened" action,
          so the sheet asks when, above the notes (item 354). */}
      <Field label="When" htmlFor="serve-when">
        <DateTimeField id="serve-when" value={servedAt} onChange={setServedAt} disabled={serve.isPending} />
      </Field>

      {/* Item 718: optional, where Log meal has it (after When, above the
          reaction note). Blank sends no rating. */}
      <MealRatingsField
        rows={rows}
        onChange={(key, value) => setRatings((current) => ({ ...current, [key]: value }))}
        disabled={serve.isPending}
      />

      {/* Always visible, above the button (item 263). The reaction note is
          what feeds allergen tracking, so it is never behind a tap. */}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-text)]">
          <OptionalLabel label="Reaction (optional)" />
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">Only for hives, vomiting, rash or other reaction signs.</span>
        <Textarea
          value={reactionNote}
          onChange={(e) => setReactionNote(e.target.value)}
          rows={2}
          placeholder="e.g. mild rash around mouth"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-text)]">
          <OptionalLabel label="Note (optional)" />
        </span>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="e.g. ate the whole thing" />
      </label>

      {serve.isError && !offline && <span className="text-xs text-[var(--color-danger)]">Couldn't serve — try again.</span>}

      {/* No gap: the empty live region must add no space while online. */}
      <div className="flex flex-col">
        <Button
          type="button"
          disabled={serve.isPending || offline}
          aria-describedby={offline ? "serve-offline" : undefined}
          className="w-full"
          onClick={() =>
            serve.mutate(
              {
                ...buildServeInput(babyId, parts, freshFoods, freshRecipes, reactionNote, notes, servedAt),
                ...serveRatingsInput(rows),
              },
              { onSuccess: () => onServed?.() },
            )
          }
        >
          {serve.isPending && !offline ? "Serving…" : "Serve"}
        </Button>
        <div role="status">
          {offline && (
            <p id="serve-offline" className="mt-1.5 text-center text-xs text-[var(--color-text-muted)]">
              You're offline.
            </p>
          )}
        </div>
      </div>

      {addingMore && (
        <AddMoreSheet
          servingIds={parts.map((part) => part.item.id)}
          onClose={() => setAddingMore(false)}
          onAdd={(picks) => {
            setParts((current) => [...current, ...picks.items.map((picked) => ({ item: picked, servings: 1 }))]);
            setFreshFoods((current) => [...current, ...picks.foods.filter((food) => !current.some((entry) => entry.id === food.id))]);
            setFreshRecipes((current) => [
              ...current,
              ...picks.recipes.filter((recipe) => !current.some((entry) => entry.id === recipe.id)),
            ]);
            setAddingMore(false);
          }}
        />
      )}
    </div>
  );
}

interface ServeSheetProps {
  item: StorageItem;
  babyId: string;
  open: boolean;
  onClose: () => void;
}

/**
 * The one Serve surface in the app (item 263): a bottom sheet titled "Serve"
 * (MR-Serve), opened from a storage row's kebab with that container first in
 * the list. Closed by the X at the LEFT of its header, an overlay tap, or
 * Escape; it closes itself after a serve.
 */
export function ServeSheet({ item, babyId, open, onClose }: ServeSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Serve" showClose>
      <ServeControl
        item={item}
        babyId={babyId}
        onServed={() => {
          onClose();
          // Ledger 767: a fast double tap's second tap must not land on the
          // bottom nav that was under Serve.
          ignoreTapsBriefly();
        }}
      />
    </Sheet>
  );
}
