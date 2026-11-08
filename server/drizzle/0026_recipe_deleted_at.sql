-- Ledger 957: `recipes.deleted_at` — a parent's own recipe can be deleted
-- even when logged meals or storage containers name it. That row stays;
-- choosing and browsing reads filter it out, history reads keep it and mark
-- it "(deleted)". A recipe nothing logged or stored is still deleted for good.
--
-- Generated, not hand-written: wholly additive, one nullable column with no
-- default, so no existing row is touched and every recipe reads as not deleted.
ALTER TABLE "recipes" ADD COLUMN "deleted_at" timestamp with time zone;
