ALTER TYPE "public"."pantry_location" RENAME TO "fridge_location";--> statement-breakpoint
ALTER TYPE "public"."pantry_status" RENAME TO "fridge_status";--> statement-breakpoint
ALTER TABLE "pantry_items" RENAME TO "fridge_items";--> statement-breakpoint
ALTER TABLE "meal_foods" RENAME COLUMN "pantry_item_id" TO "fridge_item_id";--> statement-breakpoint
ALTER TABLE "fridge_items" RENAME CONSTRAINT "pantry_items_pkey" TO "fridge_items_pkey";--> statement-breakpoint
ALTER TABLE "fridge_items" RENAME CONSTRAINT "pantry_items_user_id_user_id_fk" TO "fridge_items_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "fridge_items" RENAME CONSTRAINT "pantry_items_food_id_foods_id_fk" TO "fridge_items_food_id_foods_id_fk";--> statement-breakpoint
ALTER TABLE "fridge_items" RENAME CONSTRAINT "pantry_items_recipe_id_recipes_id_fk" TO "fridge_items_recipe_id_recipes_id_fk";--> statement-breakpoint
ALTER TABLE "meal_foods" RENAME CONSTRAINT "meal_foods_pantry_item_id_pantry_items_id_fk" TO "meal_foods_fridge_item_id_fridge_items_id_fk";--> statement-breakpoint
ALTER INDEX "pantry_items_user_id_idx" RENAME TO "fridge_items_user_id_idx";--> statement-breakpoint
ALTER INDEX "pantry_items_active_idx" RENAME TO "fridge_items_active_idx";
