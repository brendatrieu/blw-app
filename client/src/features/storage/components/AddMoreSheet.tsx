import { useMemo, useState, type ReactNode } from "react";
import type { FoodListItem, MealItem, RecipeListItem, StorageItem } from "@blw/shared";
import { Button } from "../../../components/ui/Button.js";
import { Input } from "../../../components/ui/Input.js";
import { SegmentedControl, type SegmentedControlOption } from "../../../components/ui/SegmentedControl.js";
import { Sheet } from "../../../components/ui/Sheet.js";
import { focusFieldById } from "../../../lib/forms.js";
import { FoodPlate } from "../../catalog/components/FoodPlate.js";
import { foodPlate } from "../../catalog/foodEmoji.js";
import { useFoods, useRecipes } from "../../catalog/hooks.js";
import { useMeals } from "../../tracking/hooks.js";
import { mealRecipes } from "../../tracking/mealRecipes.js";
import { hasNoServingsLeft, isLabelOnly, servePartHint, storageItemTitle } from "../format.js";
import { useStorageItems } from "../hooks.js";
import { addMoreCanApply, addMoreDiff, addMoreNeedsContainer, type AddMoreChange, type AddMoreIds } from "../addMoreSelection.js";
import { storageItemCluster } from "./StorageItemCard.js";

type AddMoreTab = "storage" | "recipe" | "food";

/** Owner-approved tabs (MR2, 2026-10-11). */
export const ADD_MORE_TABS: SegmentedControlOption<AddMoreTab>[] = [
  { value: "storage", label: "In storage", icon: null },
  { value: "recipe", label: "Recipes", icon: null },
  { value: "food", label: "Foods", icon: null },
];

/**
 * Ledger 794 (owner's option A): while the search box has text the row gains
 * "All" in front, so the highlighted tab always says what the list holds.
 */
export const ADD_MORE_SEARCH_TABS: SegmentedControlOption<AddMoreTab | "all">[] = [
  { value: "all", label: "All", icon: null, id: "add-more-all" },
  ...ADD_MORE_TABS,
];

/** Ledger 921: "No matches in {name}." for a narrowed search. */
const NARROWED_NAME: Record<AddMoreTab, string> = { storage: "storage", recipe: "recipes", food: "foods" };

/** How many recent recipes or foods head their tab (the MR2 board shows three). */
export const RECENT_LIMIT = 3;

/**
 * The containers "In storage" lists (items 730/760): every one already on
 * the plate (shown ticked, ledger 878, whatever it has left), and any
 * other that is active, servable (a Free-form label has nothing to log) and
 * has a serving left (a tracked container at 0 — after a Restore or a resize
 * — is the server's 409 at routes/storage.ts, which would sink the whole
 * sitting).
 */
export function addMoreStorageItems(items: readonly StorageItem[], servingIds: readonly string[]): StorageItem[] {
  return items.filter(
    (item) =>
      servingIds.includes(item.id) || (item.status === "active" && !isLabelOnly(item) && !hasNoServingsLeft(item)),
  );
}

/**
 * Ledger 789: this baby's recipes and foods, most recently served or logged
 * first, from the meals list Home already caches (newest first). A food
 * counts only when it was on the plate in its own right, not as an
 * ingredient of one of the meal's recipes. Ids only: the caller keeps the
 * ones its lists still offer (a deleted custom food or recipe drops out).
 */
export function recentIds(meals: readonly MealItem[]): { recipeIds: string[]; foodIds: string[] } {
  const recipeIds = new Set<string>();
  const foodIds = new Set<string>();
  for (const meal of meals) {
    for (const recipe of mealRecipes(meal)) recipeIds.add(recipe.id);
    for (const food of meal.foods) if (!food.inRecipe) foodIds.add(food.id);
  }
  return { recipeIds: [...recipeIds], foodIds: [...foodIds] };
}

/** The picks (or recent ids) in their own order, resolved against what is loaded. */
function resolveIds<T extends { id: string }>(ids: readonly string[], list: readonly T[]): T[] {
  return ids.flatMap((id) => list.find((entry) => entry.id === id) ?? []);
}

const byLabel = <T,>(label: (entry: T) => string) => (a: T, b: T) => label(a).localeCompare(label(b));
const matches = (label: string, query: string) => label.toLowerCase().includes(query);

function GroupLabel({ children }: { children: ReactNode }) {
  return <h3 className="pb-0.5 text-[13px] font-bold tracking-[0.04em] text-[var(--color-text-muted)]">{children}</h3>;
}

interface PickRowProps {
  checked: boolean;
  onToggle: (checked: boolean) => void;
  plate: ReactNode;
  title: string;
  detail?: string;
}

/** One tickable row; the whole row is the checkbox's label, so the row is the tap target. */
function PickRow({ checked, onToggle, plate, title, detail }: PickRowProps) {
  return (
    <li className="border-t border-[var(--color-divider)] first:border-t-0">
      <label className="flex min-h-14 cursor-pointer items-center gap-3 py-1">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onToggle(event.target.checked)}
          className="size-6 shrink-0 accent-[var(--color-accent)]"
        />
        {plate}
        <span className="flex min-w-0 flex-col">
          <span className="font-semibold text-[var(--color-text)]">{title}</span>
          {detail ? <span className="text-xs text-[var(--color-text-muted)]">{detail}</span> : null}
        </span>
      </label>
    </li>
  );
}

/** One Add more sheet is open at a time. */
const SEARCH_ID = "add-more-search";

interface AddMoreSheetProps {
  babyId: string;
  /** What is already on the plate: it opens ticked. */
  serving: AddMoreIds;
  /** Serve: Done waits while no container is ticked, and says why (878b). */
  requireContainer: boolean;
  /** Done: what to take off the plate and what to put on it. */
  onDone: (change: AddMoreChange) => void;
  onClose: () => void;
}

/**
 * The plate's "Add more", its only way to add an item (MR2 boards, ledger
 * 789; plan SPEC §5): one search box over three tabs — "In storage"
 * (containers), "Recipes" and "Foods" made fresh, each of the last two
 * opening with this baby's recent ones, then A–Z. Typing searches the tab
 * the parent picked, or all three ("All", grouped) before they pick one; the
 * row then offers All or one kind, keeping the text (ledger 794, 920). It
 * opens with the plate ticked, each in its own row (ledger 878); ticks are
 * kept across tabs and searches until "Done", pinned at the bottom, which
 * adds the new ones and takes off the unticked ones. Nothing on the plate
 * hides anything else (799): a fresh recipe is offered beside a container
 * of it. The sheet is a fixed height from the start, so nothing moves while
 * typing, switching tabs or as the results change. Rendered only while
 * open, so every opening starts from the plate; closing without Done
 * changes nothing.
 */
export function AddMoreSheet({ babyId, serving, requireContainer, onDone, onClose }: AddMoreSheetProps) {
  const [tab, setTab] = useState<AddMoreTab>("storage");
  const [query, setQuery] = useState("");
  // Which kind a search shows. A new search stays in the tab the parent
  // picked (owner, 2026-11-03); before they pick one it covers "All".
  const [searchTab, setSearchTab] = useState<AddMoreTab | "all">("all");
  const [itemIds, setItemIds] = useState<string[]>(() => [...serving.itemIds]);
  const [foodIds, setFoodIds] = useState<string[]>(() => [...serving.foodIds]);
  const [recipeIds, setRecipeIds] = useState<string[]>(() => [...serving.recipeIds]);
  const [tabPicked, setTabPicked] = useState(false);
  const storage = useStorageItems("active");
  const foods = useFoods();
  // `fresh` like Log meal's picker (item 353): a recipe written moments ago
  // must be pickable now.
  const recipes = useRecipes({}, { fresh: true });
  // Home's food-log query (same key), so this is normally already cached.
  const meals = useMeals(babyId, { limit: 100 });

  const available = addMoreStorageItems(storage.data?.items ?? [], serving.itemIds);
  const allFoods = useMemo(() => [...(foods.data?.foods ?? [])].sort(byLabel((food) => food.name)), [foods.data]);
  const allRecipes = useMemo(
    () => [...(recipes.data?.recipes ?? [])].sort(byLabel((recipe: RecipeListItem) => recipe.title)),
    [recipes.data],
  );
  const recent = useMemo(() => recentIds(meals.data?.items ?? []), [meals.data]);
  const recentRecipes = resolveIds(recent.recipeIds, allRecipes).slice(0, RECENT_LIMIT);
  const recentFoods = resolveIds(recent.foodIds, allFoods).slice(0, RECENT_LIMIT);
  const ticks = { itemIds, recipeIds, foodIds };
  const needsContainer = requireContainer && addMoreNeedsContainer(ticks);
  const q = query.trim().toLowerCase();

  const toggle = (set: (update: (current: string[]) => string[]) => void, id: string) => (checked: boolean) =>
    set((current) => (checked ? [...current, id] : current.filter((entry) => entry !== id)));

  const storageRows = (list: readonly StorageItem[]) =>
    list.map((item) => (
      <PickRow
        key={item.id}
        checked={itemIds.includes(item.id)}
        onToggle={toggle(setItemIds, item.id)}
        plate={<FoodPlate {...storageItemCluster(item).plates[0]!} size={40} />}
        title={storageItemTitle(item)}
        detail={servePartHint(item)}
      />
    ));
  const recipeRows = (list: readonly RecipeListItem[]) =>
    list.map((recipe) => (
      <PickRow
        key={recipe.id}
        checked={recipeIds.includes(recipe.id)}
        onToggle={toggle(setRecipeIds, recipe.id)}
        plate={<FoodPlate emoji="🍲" tint="neutral" size={40} />}
        title={recipe.title}
      />
    ));
  const foodRows = (list: readonly FoodListItem[]) =>
    list.map((food) => (
      <PickRow
        key={food.id}
        checked={foodIds.includes(food.id)}
        onToggle={toggle(setFoodIds, food.id)}
        plate={<FoodPlate {...foodPlate(food)} size={40} />}
        title={food.name}
      />
    ));
  const group = (label: string, rows: ReactNode[]) =>
    rows.length > 0 ? (
      <section key={label} className="mt-3 first:mt-0">
        <GroupLabel>{label}</GroupLabel>
        <ul className="flex flex-col">{rows}</ul>
      </section>
    ) : null;

  let body: ReactNode;
  if (q) {
    const hits = {
      storage: storageRows(available.filter((item) => matches(storageItemTitle(item), q))),
      recipe: recipeRows(allRecipes.filter((recipe) => matches(recipe.title, q))),
      food: foodRows(allFoods.filter((food) => matches(food.name, q))),
    };
    const shows = (kind: AddMoreTab) => searchTab === "all" || searchTab === kind;
    const found = [
      shows("storage") && group("In storage", hits.storage),
      shows("recipe") && group("Recipes", hits.recipe),
      shows("food") && group("Foods", hits.food),
    ].filter(Boolean);
    // Ledger 921: a narrowed search that misses here but hits another kind
    // says which kind it searched and offers to widen, keeping the text.
    const elsewhere = searchTab !== "all" && Object.values(hits).some((list) => list.length > 0);
    body =
      found.length > 0 ? (
        found
      ) : elsewhere ? (
        // Centered, 20px all round and between the line and the button (ledger 935, 952).
        <div className="flex flex-col items-center gap-5 p-5 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">{`No matches in ${NARROWED_NAME[searchTab]}.`}</p>
          <Button type="button" variant="quiet" onClick={() => {
              setSearchTab("all");
              // The button goes with the miss. Focus lands on All, not the
              // search box, so a phone keyboard stays down over the widened
              // results (ledger 929).
              focusFieldById("add-more-all");
            }}
          >
            Search all
          </Button>
        </div>
      ) : (
        <p className="p-5 text-center text-sm text-[var(--color-text-muted)]">No matches</p>
      );
  } else if (tab === "storage") {
    body =
      available.length > 0 ? (
        <ul className="flex flex-col">{storageRows(available)}</ul>
      ) : storage.isLoading ? null : (
        <p className="text-sm text-[var(--color-text-muted)]">Nothing in storage to add.</p>
      );
  } else if (tab === "recipe") {
    body = [group("Recent", recipeRows(recentRecipes)), group("All recipes", recipeRows(allRecipes))];
  } else {
    body = [group("Recent", foodRows(recentFoods)), group("All foods", foodRows(allFoods))];
  }

  return (
    <Sheet open onClose={onClose} title="Add more" showClose fixedHeight>
      <Input
        id={SEARCH_ID}
        type="search"
        value={query}
        onChange={(event) => {
          if (!q && event.target.value.trim()) setSearchTab(tabPicked ? tab : "all");
          setQuery(event.target.value);
        }}
        placeholder="Search storage, recipes, foods…"
        aria-label="Search storage, recipes, foods"
        className="shrink-0"
      />
      {/* While searching: All · In storage · Recipes · Foods, narrowing the
          results and never clearing the text. Clearing the search brings back
          the three tabs, on the one open before it. Same row height either
          way, so the list never moves: at 320 px the four labels only fit on
          one line with slimmer side padding, and kept from wrapping (else
          "In storage" breaks in two and the row grows 12 px). */}
      <div className="shrink-0 [&_[role=radio]]:px-2 [&_[role=radio]]:whitespace-nowrap">
        <SegmentedControl
          aria-label="Add more"
          options={q ? ADD_MORE_SEARCH_TABS : ADD_MORE_TABS}
          value={q ? searchTab : tab}
          onChange={(next) => {
            if (q || next === "all") setSearchTab(next);
            else {
              setTab(next);
              setTabPicked(true);
            }
          }}
        />
      </div>

      {/* The only part that scrolls; keyed so a new tab, a new search or a
          new narrowing starts at the top. */}
      <div key={q ? `search-${searchTab}` : tab} className="scroll-momentum scroll-thin -mx-4 min-h-0 flex-1 overflow-y-auto px-4">
        {body}
      </div>

      <div className="-mx-4 shrink-0 border-t border-[var(--color-border)] px-4 pt-3">
        {/* Ledger 878b: why Done is off when no container is ticked. The live
            region is always there, so the line is announced as it appears. */}
        <div role="status">
          {needsContainer ? (
            <p id="add-more-needs-storage" className="pb-2 text-center text-xs text-[var(--color-text-muted)]">
              Serve needs at least one item from storage.
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          className="w-full"
          disabled={!addMoreCanApply(serving, ticks, requireContainer)}
          aria-describedby={needsContainer ? "add-more-needs-storage" : undefined}
          onClick={() => {
            const { added, removed } = addMoreDiff(serving, ticks);
            onDone({
              removed,
              items: resolveIds(added.itemIds, available),
              foods: resolveIds(added.foodIds, allFoods),
              recipes: resolveIds(added.recipeIds, allRecipes).map(({ id, title }) => ({ id, title })),
            });
          }}
        >
          Done
        </Button>
      </div>
    </Sheet>
  );
}
