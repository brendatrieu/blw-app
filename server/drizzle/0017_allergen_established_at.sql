-- Item 363: `allergen_overrides.established_at` — when the parent says the
-- allergen was established, as opposed to when they told us.
--
-- Hand-EXTENDED, not hand-written: the generated statement below is exactly
-- as drizzle wrote it, and the backfill after it is the part a generator
-- cannot know. `DEFAULT now()` alone would stamp every existing mark with the
-- moment of the deploy, which would silently reset the new maintenance
-- countdown for every parent who has ever used the button — a mark made in
-- March would read "established today" and go un-due for a week.
--
--   add the column, defaulted so the NOT NULL holds for existing rows
--   -> overwrite those rows with the only date we actually have: created_at
--
-- The UPDATE touches every row, and that is deliberate: at this point in the
-- migration `established_at` is `now()` everywhere, so `created_at` is
-- strictly better information for all of them. Rows written after this
-- migration take their value from the route (or the column default), never
-- from here. No row is added or removed.
ALTER TABLE "allergen_overrides" ADD COLUMN "established_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "allergen_overrides" SET "established_at" = "created_at";
