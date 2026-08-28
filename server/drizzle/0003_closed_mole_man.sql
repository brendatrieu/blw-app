ALTER TABLE "meal_foods" ADD COLUMN "pantry_item_id" uuid;--> statement-breakpoint
ALTER TABLE "pantry_items" ADD COLUMN "servings_total" integer;--> statement-breakpoint
ALTER TABLE "pantry_items" ADD COLUMN "servings_left" integer;--> statement-breakpoint
ALTER TABLE "pantry_items" ADD COLUMN "best_by" date;--> statement-breakpoint
ALTER TABLE "meal_foods" ADD CONSTRAINT "meal_foods_pantry_item_id_pantry_items_id_fk" FOREIGN KEY ("pantry_item_id") REFERENCES "public"."pantry_items"("id") ON DELETE set null ON UPDATE no action;