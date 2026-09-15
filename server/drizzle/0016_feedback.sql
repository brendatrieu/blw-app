-- Item 358: parent feedback to the admins.
--
-- Wholly additive, so the generated statement order stands as drizzle wrote
-- it: a new enum, a new table with its two FKs and two indexes, and one new
-- nullable column on `admin_audit` (`target_ref`, the feedback id a
-- `feedback_*` audit row is about — plain text with no FK so the trail
-- outlives the row it names).
CREATE TYPE "public"."feedback_status" AS ENUM('new', 'read', 'resolved');--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"message" text NOT NULL,
	"route_pattern" text,
	"app_version" text NOT NULL,
	"status" "feedback_status" DEFAULT 'new' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by" text
);
--> statement-breakpoint
ALTER TABLE "admin_audit" ADD COLUMN "target_ref" text;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_status_created_at_idx" ON "feedback" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "feedback_user_id_created_at_idx" ON "feedback" USING btree ("user_id","created_at");