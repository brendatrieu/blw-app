-- Item 298: `recipes.extra_ingredients` becomes `{ name, quantityNote }[]`.
--
-- Hand-edited. drizzle-kit generated a bare
--   ALTER TABLE "recipes" ALTER COLUMN "extra_ingredients" SET DATA TYPE jsonb;
-- which Postgres rejects outright (no cast from text[] to jsonb), and its
-- fallback shape — drop the column, add a new one — would throw the seeded
-- catalog's extras away. Converting through a side column keeps every value:
-- each existing string becomes a NAME with no quantity, and the seed data is
-- where a leading "a pinch of"/"1 tsp" gets split off instead.
--
-- A NULL column (the catalog's "this recipe has no extras") stays NULL; the
-- routes already read it as `?? []`.
ALTER TABLE "recipes" ADD COLUMN "extra_ingredients_jsonb" jsonb;--> statement-breakpoint
UPDATE "recipes"
SET "extra_ingredients_jsonb" = (
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('name', "extra"."value", 'quantityNote', '') ORDER BY "extra"."ordinality"),
    '[]'::jsonb
  )
  FROM unnest("recipes"."extra_ingredients") WITH ORDINALITY AS "extra"("value", "ordinality")
)
WHERE "extra_ingredients" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" DROP COLUMN "extra_ingredients";--> statement-breakpoint
ALTER TABLE "recipes" RENAME COLUMN "extra_ingredients_jsonb" TO "extra_ingredients";
