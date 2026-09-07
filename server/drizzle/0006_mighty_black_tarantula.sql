ALTER TABLE "foods" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "emoji" text;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "foods_owner_id_idx" ON "foods" USING btree ("owner_id");