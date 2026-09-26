-- Item 536: `foods.deleted_at` — a parent's own custom food can be deleted
-- without breaking the meals, storage items and recipes that still name it.
-- The row stays; choosing and browsing reads filter it out, history reads
-- keep it and mark it "(deleted)".
--
-- Generated, not hand-written: wholly additive, one nullable column with no
-- default, so no existing row is touched and every food reads as not deleted.
ALTER TABLE "foods" ADD COLUMN "deleted_at" timestamp with time zone;
