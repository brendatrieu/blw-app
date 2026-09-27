-- Item 571: star ratings (1-5) per baby, through the meal's baby.
-- `meal_foods.rating` rates one food on a loose-food meal (recipe_id NULL);
-- `meals.recipe_rating` rates the recipe on a recipe meal. NULL = not rated;
-- there is no 0-star state, and the CHECKs refuse 0 and anything above 5.
--
-- Generated, not hand-written: wholly additive, two nullable columns with no
-- default plus two CHECKs that every existing row (NULL) already satisfies,
-- so no existing row is touched and every meal reads as not rated.
ALTER TABLE "meal_foods" ADD COLUMN "rating" smallint;--> statement-breakpoint
ALTER TABLE "meals" ADD COLUMN "recipe_rating" smallint;--> statement-breakpoint
ALTER TABLE "meal_foods" ADD CONSTRAINT "meal_foods_rating_range" CHECK ("meal_foods"."rating" BETWEEN 1 AND 5);--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_recipe_rating_range" CHECK ("meals"."recipe_rating" BETWEEN 1 AND 5);