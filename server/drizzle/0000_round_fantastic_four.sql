CREATE TYPE "public"."age_stage" AS ENUM('6', '9', '12');--> statement-breakpoint
CREATE TYPE "public"."chat_kind" AS ENUM('recipe', 'blw');--> statement-breakpoint
CREATE TYPE "public"."chat_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."food_category" AS ENUM('protein', 'veg', 'fruit', 'grain', 'dairy', 'legume');--> statement-breakpoint
CREATE TYPE "public"."level" AS ENUM('high', 'moderate', 'low');--> statement-breakpoint
CREATE TYPE "public"."pantry_location" AS ENUM('fridge', 'freezer', 'counter');--> statement-breakpoint
CREATE TYPE "public"."pantry_status" AS ENUM('active', 'finished', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."triage_level" AS ENUM('monitor_at_home', 'contact_doctor_24h', 'urgent_care', 'emergency');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"issuer" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allergen_ladder_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"step" integer NOT NULL,
	"allergen_id" uuid NOT NULL,
	"starter_food_id" uuid NOT NULL,
	"how_to" text NOT NULL,
	"wait_days" integer NOT NULL,
	CONSTRAINT "allergen_ladder_steps_step_unique" UNIQUE("step")
);
--> statement-breakpoint
CREATE TABLE "allergens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"intro_guidance" text NOT NULL,
	CONSTRAINT "allergens_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "babies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"birth_date" date NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" "chat_role" NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"baby_id" uuid,
	"kind" "chat_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" text NOT NULL,
	"recipe_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_recipe_id_pk" PRIMARY KEY("user_id","recipe_id")
);
--> statement-breakpoint
CREATE TABLE "food_allergens" (
	"food_id" uuid NOT NULL,
	"allergen_id" uuid NOT NULL,
	CONSTRAINT "food_allergens_food_id_allergen_id_pk" PRIMARY KEY("food_id","allergen_id")
);
--> statement-breakpoint
CREATE TABLE "food_pairings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"iron_food_id" uuid NOT NULL,
	"vit_c_food_id" uuid NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" "food_category" NOT NULL,
	"iron_level" "level" NOT NULL,
	"vitamin_c_level" "level" NOT NULL,
	"choking_risk" "level" NOT NULL,
	"min_age_months" integer NOT NULL,
	"prep_6m" text NOT NULL,
	"prep_9m" text NOT NULL,
	"prep_12m" text NOT NULL,
	"choking_notes" text,
	"notes" text,
	"image_url" text,
	"storage_category" text NOT NULL,
	CONSTRAINT "foods_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "pantry_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"food_id" uuid,
	"recipe_id" uuid,
	"label" text,
	"prepared_at" timestamp with time zone NOT NULL,
	"location" "pantry_location" NOT NULL,
	"status" "pantry_status" DEFAULT 'active' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"quantity_note" text
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"quantity_note" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"age_stage" "age_stage" NOT NULL,
	"texture_note" text NOT NULL,
	"instructions" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"min_age_months" integer NOT NULL,
	"prep_minutes" integer NOT NULL,
	"iron_focus" boolean DEFAULT false NOT NULL,
	"image_url" text,
	"fridge_hours_override" integer,
	"freezer_days_override" integer,
	"extra_ingredients" text[],
	CONSTRAINT "recipes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "serve_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"baby_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"recipe_id" uuid,
	"served_at" timestamp with time zone NOT NULL,
	"reaction_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "storage_guidelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"fridge_hours" integer NOT NULL,
	"freezer_days" integer,
	"room_temp_hours" integer NOT NULL,
	"notes" text NOT NULL,
	CONSTRAINT "storage_guidelines_category_unique" UNIQUE("category")
);
--> statement-breakpoint
CREATE TABLE "symptom_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"baby_id" uuid NOT NULL,
	"survey" jsonb NOT NULL,
	"window_hours" integer NOT NULL,
	"foods_considered" jsonb NOT NULL,
	"triage_level" "triage_level" NOT NULL,
	"result" jsonb NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_ai_keys" (
	"user_id" text PRIMARY KEY NOT NULL,
	"encrypted_key" text NOT NULL,
	"key_last4" text NOT NULL,
	"last_validated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allergen_ladder_steps" ADD CONSTRAINT "allergen_ladder_steps_allergen_id_allergens_id_fk" FOREIGN KEY ("allergen_id") REFERENCES "public"."allergens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allergen_ladder_steps" ADD CONSTRAINT "allergen_ladder_steps_starter_food_id_foods_id_fk" FOREIGN KEY ("starter_food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "babies" ADD CONSTRAINT "babies_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_baby_id_babies_id_fk" FOREIGN KEY ("baby_id") REFERENCES "public"."babies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_allergens" ADD CONSTRAINT "food_allergens_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_allergens" ADD CONSTRAINT "food_allergens_allergen_id_allergens_id_fk" FOREIGN KEY ("allergen_id") REFERENCES "public"."allergens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_pairings" ADD CONSTRAINT "food_pairings_iron_food_id_foods_id_fk" FOREIGN KEY ("iron_food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_pairings" ADD CONSTRAINT "food_pairings_vit_c_food_id_foods_id_fk" FOREIGN KEY ("vit_c_food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_storage_category_storage_guidelines_category_fk" FOREIGN KEY ("storage_category") REFERENCES "public"."storage_guidelines"("category") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_variants" ADD CONSTRAINT "recipe_variants_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serve_logs" ADD CONSTRAINT "serve_logs_baby_id_babies_id_fk" FOREIGN KEY ("baby_id") REFERENCES "public"."babies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serve_logs" ADD CONSTRAINT "serve_logs_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serve_logs" ADD CONSTRAINT "serve_logs_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symptom_checks" ADD CONSTRAINT "symptom_checks_baby_id_babies_id_fk" FOREIGN KEY ("baby_id") REFERENCES "public"."babies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ai_keys" ADD CONSTRAINT "user_ai_keys_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_account_id_idx" ON "account" USING btree ("issuer","account_id");--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "babies_user_id_idx" ON "babies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_messages_thread_id_idx" ON "chat_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "chat_threads_user_id_idx" ON "chat_threads" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "food_pairings_iron_vitc_idx" ON "food_pairings" USING btree ("iron_food_id","vit_c_food_id");--> statement-breakpoint
CREATE INDEX "foods_iron_level_idx" ON "foods" USING btree ("iron_level");--> statement-breakpoint
CREATE INDEX "foods_category_idx" ON "foods" USING btree ("category");--> statement-breakpoint
CREATE INDEX "pantry_items_user_id_idx" ON "pantry_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pantry_items_active_idx" ON "pantry_items" USING btree ("user_id","status") WHERE "pantry_items"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_ingredients_recipe_food_idx" ON "recipe_ingredients" USING btree ("recipe_id","food_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_variants_recipe_stage_idx" ON "recipe_variants" USING btree ("recipe_id","age_stage");--> statement-breakpoint
CREATE INDEX "serve_logs_baby_id_served_at_idx" ON "serve_logs" USING btree ("baby_id","served_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "symptom_checks_baby_id_idx" ON "symptom_checks" USING btree ("baby_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");