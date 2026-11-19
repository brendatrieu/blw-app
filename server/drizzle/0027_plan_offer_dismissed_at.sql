-- Ledger 995: `user_preferences.plan_offer_dismissed_at` — when the parent
-- tapped "Not now" on Home's one-time planning offer (Up next, for an account
-- that has never planned food). Null: not dismissed.
--
-- Generated, not hand-written: wholly additive, one nullable column with no
-- default, so no existing row is touched and nobody reads as dismissed.
ALTER TABLE "user_preferences" ADD COLUMN "plan_offer_dismissed_at" timestamp with time zone;
