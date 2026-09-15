-- Item 345: a storage item holds a whole meal, not one food.
--
-- Hand-ORDERED, not hand-written: drizzle-kit emits the DROP COLUMN (and the
-- FK drop that goes with it) in the same breath as the CREATE TABLE, which
-- would throw every existing container's food away. The statements below are
-- the generated ones, resequenced so the backfill runs while `food_id` is
-- still there:
--
--   create the join table, its foreign keys and its index
--   -> copy every storage_items.food_id into it at position 0
--   -> only then drop the old column and its constraint
--
-- `meal_foods.storage_item_id` is never touched, so a meal logged by serving
-- a container keeps pointing at that same container row: provenance survives
-- by construction, not by rewriting anything.
CREATE TABLE "storage_item_foods" (
	"storage_item_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "storage_item_foods_storage_item_id_food_id_pk" PRIMARY KEY("storage_item_id","food_id")
);
--> statement-breakpoint
ALTER TABLE "storage_item_foods" ADD CONSTRAINT "storage_item_foods_storage_item_id_storage_items_id_fk" FOREIGN KEY ("storage_item_id") REFERENCES "public"."storage_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_item_foods" ADD CONSTRAINT "storage_item_foods_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "storage_item_foods_food_id_idx" ON "storage_item_foods" USING btree ("food_id");--> statement-breakpoint
-- The backfill. Every food-sourced container becomes a one-food container;
-- recipe-sourced and label-only rows had no food_id and get no row here.
INSERT INTO "storage_item_foods" ("storage_item_id", "food_id", "position")
SELECT "id", "food_id", 0 FROM "storage_items" WHERE "food_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "storage_items" DROP CONSTRAINT "storage_items_food_id_foods_id_fk";
--> statement-breakpoint
ALTER TABLE "storage_items" DROP COLUMN "food_id";
