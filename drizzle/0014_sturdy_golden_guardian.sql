CREATE TABLE "companion_memories" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companion_memories_pkey" PRIMARY KEY("user_id","id"),
	CONSTRAINT "companion_memories_text_check" CHECK (char_length("companion_memories"."text") between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "saved_prompt_tags" (
	"user_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"normalized_name" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "saved_prompt_tags_pkey" PRIMARY KEY("user_id","prompt_id","normalized_name"),
	CONSTRAINT "saved_prompt_tags_name_check" CHECK (char_length("saved_prompt_tags"."name") between 1 and 32)
);
--> statement-breakpoint
CREATE TABLE "saved_prompts" (
	"id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"content" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "saved_prompts_pkey" PRIMARY KEY("user_id","id"),
	CONSTRAINT "saved_prompts_title_check" CHECK (char_length("saved_prompts"."title") between 1 and 120),
	CONSTRAINT "saved_prompts_description_check" CHECK (char_length("saved_prompts"."description") between 1 and 280),
	CONSTRAINT "saved_prompts_content_check" CHECK (char_length("saved_prompts"."content") between 1 and 20000),
	CONSTRAINT "saved_prompts_version_check" CHECK ("saved_prompts"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "companion_profiles" DROP CONSTRAINT "companion_profiles_communication_style_check";--> statement-breakpoint
ALTER TABLE "companion_profiles" ADD COLUMN "daily_mode" text;--> statement-breakpoint
ALTER TABLE "companion_profiles" ADD COLUMN "daily_mode_date" date;--> statement-breakpoint
ALTER TABLE "companion_memories" ADD CONSTRAINT "companion_memories_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_prompt_tags" ADD CONSTRAINT "saved_prompt_tags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_prompts" ADD CONSTRAINT "saved_prompts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companion_memories_user_created_idx" ON "companion_memories" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "saved_prompt_tags_user_name_idx" ON "saved_prompt_tags" USING btree ("user_id","normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_prompt_tags_display_idx" ON "saved_prompt_tags" USING btree ("user_id","prompt_id","name");--> statement-breakpoint
CREATE INDEX "saved_prompts_user_active_updated_idx" ON "saved_prompts" USING btree ("user_id","archived_at","updated_at");--> statement-breakpoint
ALTER TABLE "companion_profiles" ADD CONSTRAINT "companion_profiles_communication_style_check" CHECK ("companion_profiles"."communication_style" in ('warm', 'focused', 'direct'));