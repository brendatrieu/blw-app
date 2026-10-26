// Ledger 901: the plate corpus (plan SPEC §8 row 1), every kind of meal a real
// account holds, as SQL against the 0023 schema (it runs on head too: it never
// writes `meal_items`, so a heal or the 0024 backfill gives them their items).
// Shared by meal-items-migration.test.ts and plate.test.ts.

export const id = (prefix: string, n: number) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const F = (n: number) => id("f", n); // foods
export const R = (n: number) => id("e", n); // recipes
export const X = (n: number) => id("a", n); // storage containers
export const M = (n: number) => id("c", n); // meals
export const B1 = id("b", 1);
export const B2 = id("b", 2);

// Foods: 1 Banana, 2 Egg (egg), 3 Carrot, 4 Oats, 5 Yogurt (milk), 6 Whole
// Milk (info; milk counts only on its own, ledger 864), 7 Unsalted Butter
// (ingredient; milk never counts), 8 Broccoli, 9 Peas, 10 My mash (custom,
// deleted), 11-60 fillers. Recipes: 1 Banana Pancakes (banana, egg), 2 Egg
// Bake (egg, milk, butter), 3 Carrot Mash (carrot), 4 Oatmeal (oats, banana),
// 5 My Eggs (custom: egg), 6 Broccoli Egg (broccoli, egg).
export function plateCorpusSql(U: string, { withUser }: { withUser: boolean }): string {
  return `
  ${withUser ? `INSERT INTO "user" ("id", "name", "email") VALUES ('${U}', 'Parent', 'parent@example.com');` : ""}
  INSERT INTO "storage_guidelines" ("category", "fridge_hours", "freezer_days", "room_temp_hours", "notes")
  VALUES ('produce_cooked_soft', 72, 90, 2, 'Steamed veg.');
  INSERT INTO "allergens" ("id", "slug", "name", "intro_guidance") VALUES
    ('${id("d", 1)}', 'egg', 'Egg', 'Well-cooked egg.'), ('${id("d", 2)}', 'milk', 'Milk', 'Yogurt or cheese.');
  INSERT INTO "foods" ("id", "slug", "name", "category", "iron_level", "vitamin_c_level", "choking_risk",
                       "min_age_months", "prep_6m", "prep_9m", "prep_12m", "storage_category", "owner_id", "deleted_at", "kind")
  VALUES
    ('${F(1)}', 'banana', 'Banana', 'fruit', 'low', 'moderate', 'low', 6, 'a', 'b', 'c', 'produce_cooked_soft', NULL, NULL, 'food'),
    ('${F(2)}', 'egg', 'Egg', 'protein', 'moderate', 'low', 'low', 6, 'a', 'b', 'c', 'produce_cooked_soft', NULL, NULL, 'food'),
    ('${F(3)}', 'carrot', 'Carrot', 'veg', 'low', 'low', 'high', 6, 'a', 'b', 'c', 'produce_cooked_soft', NULL, NULL, 'food'),
    ('${F(4)}', 'oats', 'Oats', 'grain', 'high', 'low', 'low', 6, 'a', 'b', 'c', 'produce_cooked_soft', NULL, NULL, 'food'),
    ('${F(5)}', 'yogurt', 'Yogurt', 'dairy', 'low', 'low', 'low', 6, 'a', 'b', 'c', 'produce_cooked_soft', NULL, NULL, 'food'),
    ('${F(6)}', 'milk', 'Whole Milk', 'dairy', 'low', 'low', 'low', 12, 'a', 'b', 'c', 'produce_cooked_soft', NULL, NULL, 'info'),
    ('${F(7)}', 'unsalted_butter', 'Unsalted Butter', 'dairy', 'low', 'low', 'low', 6, 'a', 'b', 'c', 'produce_cooked_soft', NULL, NULL, 'ingredient'),
    ('${F(8)}', 'broccoli', 'Broccoli', 'veg', 'moderate', 'high', 'low', 6, 'a', 'b', 'c', 'produce_cooked_soft', NULL, NULL, 'food'),
    ('${F(9)}', 'peas', 'Peas', 'legume', 'moderate', 'moderate', 'moderate', 6, 'a', 'b', 'c', 'produce_cooked_soft', NULL, NULL, 'food'),
    ('${F(10)}', 'my-mash-u1', 'My mash', 'fruit', 'low', 'low', 'low', 6, 'a', 'b', 'c', 'produce_cooked_soft', '${U}', now(), 'food');
  INSERT INTO "foods" ("id", "slug", "name", "category", "iron_level", "vitamin_c_level", "choking_risk",
                       "min_age_months", "prep_6m", "prep_9m", "prep_12m", "storage_category")
  SELECT ('f0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'filler-' || n, 'Filler ' || lpad(n::text, 2, '0'),
         'veg', 'low', 'low', 'low', 6, 'a', 'b', 'c', 'produce_cooked_soft'
    FROM generate_series(11, 60) n;
  INSERT INTO "food_allergens" ("food_id", "allergen_id", "counts_toward_progress", "counts_when_alone") VALUES
    ('${F(2)}', '${id("d", 1)}', true, false), ('${F(5)}', '${id("d", 2)}', true, false),
    ('${F(6)}', '${id("d", 2)}', false, true), ('${F(7)}', '${id("d", 2)}', false, false);
  INSERT INTO "babies" ("id", "user_id", "name", "birth_date") VALUES
    ('${B1}', '${U}', 'Robin', '2025-01-15'), ('${B2}', '${U}', 'Wren', '2025-03-01');
  INSERT INTO "recipes" ("id", "slug", "title", "min_age_months", "prep_minutes", "owner_id") VALUES
    ('${R(1)}', 'banana-pancakes', 'Banana Pancakes', 6, 10, NULL),
    ('${R(2)}', 'egg-bake', 'Egg Bake', 9, 30, NULL),
    ('${R(3)}', 'carrot-mash', 'Carrot Mash', 6, 15, NULL),
    ('${R(4)}', 'oatmeal', 'Oatmeal', 6, 10, NULL),
    ('${R(5)}', 'my-eggs-a1b2c3', 'My Eggs', 6, 5, '${U}'),
    ('${R(6)}', 'broccoli-egg', 'Broccoli Egg', 6, 15, NULL);
  INSERT INTO "recipe_ingredients" ("recipe_id", "food_id", "quantity_note") VALUES
    ('${R(1)}', '${F(1)}', '1'), ('${R(1)}', '${F(2)}', '1'),
    ('${R(2)}', '${F(2)}', '4'), ('${R(2)}', '${F(6)}', '1 cup'), ('${R(2)}', '${F(7)}', '1 tbsp'),
    ('${R(3)}', '${F(3)}', '2'),
    ('${R(4)}', '${F(4)}', '1/2 cup'), ('${R(4)}', '${F(1)}', '1'),
    ('${R(5)}', '${F(2)}', '2'),
    ('${R(6)}', '${F(8)}', '1'), ('${R(6)}', '${F(2)}', '1');

  -- Containers. a12 was Banana Pancakes when served and is Broccoli Egg now;
  -- a14 held Banana when served and holds Carrot now (both: orphans).
  INSERT INTO "storage_items" ("id", "user_id", "recipe_id", "prepared_at", "location", "status", "servings_total", "servings_left") VALUES
    ('${X(1)}', '${U}', NULL, now(), 'fridge', 'active', 4, 3),
    ('${X(2)}', '${U}', '${R(2)}', now(), 'fridge', 'active', 3, 2),
    ('${X(3)}', '${U}', '${R(4)}', now(), 'freezer', 'active', 6, 4),
    ('${X(4)}', '${U}', NULL, now(), 'fridge', 'active', NULL, NULL),
    ('${X(5)}', '${U}', '${R(1)}', now(), 'fridge', 'active', 3, 1),
    ('${X(6)}', '${U}', '${R(1)}', now(), 'freezer', 'active', 4, 3),
    ('${X(7)}', '${U}', NULL, now(), 'fridge', 'active', 2, 1),
    ('${X(8)}', '${U}', NULL, now(), 'fridge', 'active', 2, 1),
    ('${X(9)}', '${U}', NULL, now(), 'fridge', 'active', 2, 1),
    ('${X(10)}', '${U}', NULL, now(), 'fridge', 'active', 2, 1),
    ('${X(11)}', '${U}', '${R(4)}', now(), 'fridge', 'active', 2, 1),
    ('${X(12)}', '${U}', '${R(6)}', now(), 'fridge', 'active', 2, 1),
    ('${X(13)}', '${U}', NULL, now(), 'fridge', 'active', 2, 1),
    ('${X(14)}', '${U}', NULL, now(), 'fridge', 'active', 2, 1),
    ('${X(15)}', '${U}', '${R(1)}', now(), 'freezer', 'active', 2, 1),
    ('${X(16)}', '${U}', '${R(3)}', now(), 'fridge', 'active', 2, 1),
    ('${X(17)}', '${U}', NULL, now(), 'fridge', 'active', 2, 1),
    ('${X(18)}', '${U}', NULL, now(), 'fridge', 'finished', 1, 0);
  INSERT INTO "storage_item_foods" ("storage_item_id", "food_id", "position") VALUES
    ('${X(1)}', '${F(1)}', 0), ('${X(1)}', '${F(2)}', 1), ('${X(4)}', '${F(5)}', 0),
    ('${X(7)}', '${F(1)}', 0), ('${X(7)}', '${F(2)}', 1), ('${X(8)}', '${F(1)}', 0),
    ('${X(9)}', '${F(1)}', 0), ('${X(9)}', '${F(2)}', 1), ('${X(10)}', '${F(1)}', 0),
    ('${X(13)}', '${F(1)}', 0), ('${X(14)}', '${F(3)}', 0), ('${X(16)}', '${F(9)}', 0),
    ('${X(17)}', '${F(2)}', 0), ('${X(18)}', '${F(8)}', 0);
  INSERT INTO "storage_item_recipes" ("storage_item_id", "recipe_id", "position") VALUES
    ('${X(3)}', '${R(4)}', 0), ('${X(3)}', '${R(3)}', 1), ('${X(15)}', '${R(1)}', 0), ('${X(15)}', '${R(2)}', 1);

  INSERT INTO "meals" ("id", "baby_id", "recipe_id", "recipe_rating", "served_at", "reaction_note", "notes")
  SELECT ('c0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, CASE WHEN n IN (27, 28) THEN '${B2}'::uuid ELSE '${B1}'::uuid END,
         NULL, NULL, '2026-09-01T08:00:00Z'::timestamptz + (n || ' hours')::interval,
         CASE WHEN n IN (1, 9, 27) THEN 'rash' END, CASE WHEN n = 1 THEN 'ate it all' END
    FROM generate_series(1, 29) n;
  INSERT INTO "meal_recipes" ("meal_id", "recipe_id", "position", "rating") VALUES
    ('${M(2)}', '${R(1)}', 0, 4),                                 -- egg left out
    ('${M(3)}', '${R(1)}', 0, 3), ('${M(3)}', '${R(3)}', 1, 5),   -- several recipes
    ('${M(4)}', '${R(4)}', 0, NULL),                              -- rated extra, later an ingredient
    ('${M(6)}', '${R(2)}', 0, 2),                                 -- recipe container, pre-0020
    ('${M(7)}', '${R(4)}', 0, 4), ('${M(7)}', '${R(3)}', 1, NULL), ('${M(7)}', '${R(5)}', 2, NULL), -- multi-part
    ('${M(9)}', '${R(2)}', 0, NULL),                              -- milk through a recipe
    ('${M(10)}', '${R(3)}', 0, NULL),                             -- recipe lost an ingredient since
    ('${M(11)}', '${R(2)}', 0, NULL),                             -- recipe gained one since
    ('${M(12)}', '${R(1)}', 0, NULL),                             -- fridge + freezer of one recipe
    ('${M(15)}', '${R(4)}', 0, NULL),                             -- merged serve
    ('${M(16)}', '${R(1)}', 0, NULL),                             -- orphan recipe container
    ('${M(20)}', '${R(2)}', 0, NULL),                             -- cup of milk beside the egg bake
    ('${M(21)}', '${R(1)}', 0, NULL), ('${M(21)}', '${R(3)}', 1, NULL), ('${M(21)}', '${R(2)}', 2, NULL), -- split
    ('${M(22)}', '${R(3)}', 0, NULL),                             -- container of foods AND a recipe
    ('${M(24)}', '${R(1)}', 0, 5),                                -- recipe container + an overlapping food one
    ('${M(29)}', '${R(5)}', 0, NULL);                             -- food container + a fresh recipe sharing a food
  -- The legacy mirror, as every writer leaves it; plus the V4 meal (a rating
  -- with no recipe, no app path makes one).
  UPDATE "meals" m SET "recipe_id" = mr."recipe_id", "recipe_rating" = mr."rating"
    FROM "meal_recipes" mr WHERE mr."meal_id" = m."id" AND mr."position" = 0;
  UPDATE "meals" SET "recipe_rating" = 3 WHERE "id" = '${M(23)}';
  INSERT INTO "meal_foods" ("meal_id", "food_id", "storage_item_id", "rating") VALUES
    ('${M(1)}', '${F(1)}', NULL, 5), ('${M(1)}', '${F(3)}', NULL, NULL),
    ('${M(2)}', '${F(1)}', NULL, NULL),
    ('${M(3)}', '${F(1)}', NULL, NULL), ('${M(3)}', '${F(2)}', NULL, NULL), ('${M(3)}', '${F(3)}', NULL, NULL),
    ('${M(4)}', '${F(4)}', NULL, NULL), ('${M(4)}', '${F(1)}', NULL, 4),
    ('${M(5)}', '${F(1)}', '${X(1)}', 4), ('${M(5)}', '${F(2)}', '${X(1)}', NULL),
    ('${M(6)}', '${F(2)}', '${X(2)}', NULL), ('${M(6)}', '${F(6)}', '${X(2)}', NULL), ('${M(6)}', '${F(7)}', '${X(2)}', NULL),
    ('${M(7)}', '${F(4)}', '${X(3)}', NULL), ('${M(7)}', '${F(1)}', '${X(3)}', NULL), ('${M(7)}', '${F(3)}', '${X(3)}', NULL),
    ('${M(7)}', '${F(5)}', '${X(4)}', NULL), ('${M(7)}', '${F(2)}', NULL, NULL), ('${M(7)}', '${F(8)}', NULL, 3),
    ('${M(8)}', '${F(10)}', NULL, 3), ('${M(8)}', '${F(1)}', NULL, NULL),
    ('${M(9)}', '${F(2)}', NULL, NULL), ('${M(9)}', '${F(6)}', NULL, NULL), ('${M(9)}', '${F(7)}', NULL, NULL),
    ('${M(10)}', '${F(3)}', NULL, NULL), ('${M(10)}', '${F(9)}', NULL, NULL),
    ('${M(11)}', '${F(2)}', NULL, NULL), ('${M(11)}', '${F(6)}', NULL, NULL),
    -- the serve's first part was the FREEZER (a6), which links the foods
    ('${M(12)}', '${F(1)}', '${X(6)}', NULL), ('${M(12)}', '${F(2)}', '${X(6)}', NULL),
    -- a8's one food overlapped a7, so a8 has no link
    ('${M(13)}', '${F(1)}', '${X(7)}', NULL), ('${M(13)}', '${F(2)}', '${X(7)}', NULL),
    -- the same before 0020: a10 left no trace at all
    ('${M(14)}', '${F(1)}', '${X(9)}', NULL), ('${M(14)}', '${F(2)}', '${X(9)}', NULL),
    ('${M(15)}', '${F(4)}', '${X(11)}', NULL), ('${M(15)}', '${F(1)}', '${X(11)}', NULL),
    ('${M(16)}', '${F(1)}', '${X(12)}', NULL), ('${M(16)}', '${F(2)}', '${X(12)}', NULL),
    ('${M(17)}', '${F(1)}', '${X(13)}', NULL),
    ('${M(19)}', '${F(6)}', NULL, NULL), ('${M(19)}', '${F(1)}', NULL, NULL),
    ('${M(20)}', '${F(2)}', NULL, NULL), ('${M(20)}', '${F(6)}', NULL, NULL), ('${M(20)}', '${F(7)}', NULL, NULL),
    ('${M(20)}', '${F(5)}', NULL, 2),
    ('${M(21)}', '${F(1)}', '${X(15)}', NULL), ('${M(21)}', '${F(2)}', '${X(15)}', NULL),
    ('${M(21)}', '${F(6)}', '${X(15)}', NULL), ('${M(21)}', '${F(7)}', '${X(15)}', NULL), ('${M(21)}', '${F(3)}', NULL, NULL),
    ('${M(22)}', '${F(9)}', '${X(16)}', NULL),
    ('${M(23)}', '${F(2)}', NULL, NULL),
    ('${M(24)}', '${F(1)}', '${X(5)}', NULL), ('${M(24)}', '${F(2)}', '${X(5)}', NULL),
    ('${M(25)}', '${F(8)}', '${X(18)}', NULL),
    ('${M(26)}', '${F(5)}', NULL, NULL),
    ('${M(27)}', '${F(2)}', NULL, 2), ('${M(27)}', '${F(5)}', NULL, NULL),
    ('${M(28)}', '${F(6)}', NULL, NULL),
    ('${M(29)}', '${F(1)}', '${X(1)}', NULL), ('${M(29)}', '${F(2)}', '${X(1)}', NULL);
  -- The 50-food meal.
  INSERT INTO "meal_foods" ("meal_id", "food_id")
  SELECT '${M(18)}', ('f0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid FROM generate_series(11, 60) n;
  INSERT INTO "meal_storage_items" ("meal_id", "storage_item_id", "servings") VALUES
    ('${M(5)}', '${X(1)}', 1),
    ('${M(7)}', '${X(3)}', 2), ('${M(7)}', '${X(4)}', 0),
    ('${M(12)}', '${X(5)}', 1), ('${M(12)}', '${X(6)}', 1),
    ('${M(13)}', '${X(7)}', 1), ('${M(13)}', '${X(8)}', 1),
    ('${M(15)}', '${X(11)}', 1),
    ('${M(16)}', '${X(12)}', 1),
    ('${M(17)}', '${X(13)}', 1), ('${M(17)}', '${X(14)}', 1),
    ('${M(21)}', '${X(15)}', 1),
    ('${M(22)}', '${X(16)}', 1),
    ('${M(24)}', '${X(5)}', 1), ('${M(24)}', '${X(17)}', 1),
    ('${M(25)}', '${X(18)}', 1),
    ('${M(29)}', '${X(1)}', 1);
`;
}
// m26 is a plain one-food meal (Yogurt); m27-28 are the second baby's; m29
// is a1 (Banana, Egg) served with a fresh My Eggs, so Egg is counted by the
// recipe AND held by the container its link names.

