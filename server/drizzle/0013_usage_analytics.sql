CREATE TABLE "admin_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"target_user_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deploys" (
	"sha" text PRIMARY KEY NOT NULL,
	"deployed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"props" jsonb NOT NULL,
	"route" text,
	"app_version" text NOT NULL,
	"context" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'parent' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "share_usage_data" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_audit" ADD CONSTRAINT "admin_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit" ADD CONSTRAINT "admin_audit_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_at_idx" ON "admin_audit" USING btree ("at");--> statement-breakpoint
CREATE INDEX "usage_events_name_occurred_at_idx" ON "usage_events" USING btree ("name","occurred_at");--> statement-breakpoint
CREATE INDEX "usage_events_user_id_occurred_at_idx" ON "usage_events" USING btree ("user_id","occurred_at");