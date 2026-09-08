ALTER TABLE "recipes" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipes_owner_id_idx" ON "recipes" USING btree ("owner_id");