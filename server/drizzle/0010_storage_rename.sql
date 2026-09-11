ALTER TYPE "public"."fridge_location" RENAME TO "storage_location";--> statement-breakpoint
ALTER TYPE "public"."fridge_status" RENAME TO "storage_status";--> statement-breakpoint
ALTER TABLE "fridge_items" RENAME TO "storage_items";--> statement-breakpoint
ALTER TABLE "meal_foods" RENAME COLUMN "fridge_item_id" TO "storage_item_id";--> statement-breakpoint
ALTER TABLE "storage_items" RENAME CONSTRAINT "fridge_items_pkey" TO "storage_items_pkey";--> statement-breakpoint
ALTER TABLE "storage_items" RENAME CONSTRAINT "fridge_items_user_id_user_id_fk" TO "storage_items_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "storage_items" RENAME CONSTRAINT "fridge_items_food_id_foods_id_fk" TO "storage_items_food_id_foods_id_fk";--> statement-breakpoint
ALTER TABLE "storage_items" RENAME CONSTRAINT "fridge_items_recipe_id_recipes_id_fk" TO "storage_items_recipe_id_recipes_id_fk";--> statement-breakpoint
ALTER TABLE "meal_foods" RENAME CONSTRAINT "meal_foods_fridge_item_id_fridge_items_id_fk" TO "meal_foods_storage_item_id_storage_items_id_fk";--> statement-breakpoint
ALTER INDEX "fridge_items_user_id_idx" RENAME TO "storage_items_user_id_idx";--> statement-breakpoint
ALTER INDEX "fridge_items_active_idx" RENAME TO "storage_items_active_idx";
