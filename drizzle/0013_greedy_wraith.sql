CREATE TABLE "companion_behavior_summaries" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"summary" jsonb NOT NULL,
	"window_started_on" date NOT NULL,
	"window_ended_on" date NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companion_behavior_summaries_schema_version_check" CHECK ("companion_behavior_summaries"."schema_version" = 1),
	CONSTRAINT "companion_behavior_summaries_document_check" CHECK (jsonb_typeof("companion_behavior_summaries"."summary") = 'object'),
	CONSTRAINT "companion_behavior_summaries_window_check" CHECK ("companion_behavior_summaries"."window_ended_on" >= "companion_behavior_summaries"."window_started_on")
);
--> statement-breakpoint
CREATE TABLE "companion_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"total_xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"proactive_messages" text DEFAULT 'enabled' NOT NULL,
	"communication_style" text DEFAULT 'warm' NOT NULL,
	"last_daily_prompt_date" date,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companion_profiles_total_xp_check" CHECK ("companion_profiles"."total_xp" >= 0),
	CONSTRAINT "companion_profiles_level_check" CHECK ("companion_profiles"."level" between 1 and 3),
	CONSTRAINT "companion_profiles_proactive_messages_check" CHECK ("companion_profiles"."proactive_messages" in ('enabled', 'muted')),
	CONSTRAINT "companion_profiles_communication_style_check" CHECK ("companion_profiles"."communication_style" in ('warm', 'direct')),
	CONSTRAINT "companion_profiles_schema_version_check" CHECK ("companion_profiles"."schema_version" = 1),
	CONSTRAINT "companion_profiles_version_check" CHECK ("companion_profiles"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "companion_xp_events" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"source_key" text NOT NULL,
	"xp" integer NOT NULL,
	"local_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companion_xp_events_pkey" PRIMARY KEY("user_id","id"),
	CONSTRAINT "companion_xp_events_xp_check" CHECK ("companion_xp_events"."xp" > 0 and "companion_xp_events"."xp" <= 25),
	CONSTRAINT "companion_xp_events_action_type_check" CHECK ("companion_xp_events"."action_type" in ('task_completed', 'planner_applied', 'daily_checkin', 'habit_completed', 'focus_completed')),
	CONSTRAINT "companion_xp_events_source_key_check" CHECK (char_length("companion_xp_events"."source_key") between 1 and 180)
);
--> statement-breakpoint
ALTER TABLE "companion_behavior_summaries" ADD CONSTRAINT "companion_behavior_summaries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companion_profiles" ADD CONSTRAINT "companion_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companion_xp_events" ADD CONSTRAINT "companion_xp_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companion_xp_events_source_idx" ON "companion_xp_events" USING btree ("user_id","action_type","source_key");--> statement-breakpoint
CREATE INDEX "companion_xp_events_user_date_idx" ON "companion_xp_events" USING btree ("user_id","local_date");