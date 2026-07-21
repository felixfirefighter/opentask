CREATE TABLE "task_occurrence_events" (
	"id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"occurrence_key" text NOT NULL,
	"state" text NOT NULL,
	"task_version" integer NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_occurrence_events_pkey" PRIMARY KEY("user_id","id"),
	CONSTRAINT "task_occurrence_events_user_task_version_unique" UNIQUE("user_id","task_id","task_version"),
	CONSTRAINT "task_occurrence_events_key_check" CHECK (char_length("task_occurrence_events"."occurrence_key") between 1 and 80),
	CONSTRAINT "task_occurrence_events_state_check" CHECK ("task_occurrence_events"."state" in ('completed', 'skipped', 'open')),
	CONSTRAINT "task_occurrence_events_version_check" CHECK ("task_occurrence_events"."task_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "task_recurrences" (
	"user_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"rrule" text NOT NULL,
	"timezone" text NOT NULL,
	"generation_mode" text DEFAULT 'schedule' NOT NULL,
	"projection_start_date" date,
	"projection_start_at" timestamp with time zone,
	"projection_end_date" date,
	"projection_end_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_recurrences_pkey" PRIMARY KEY("user_id","task_id"),
	CONSTRAINT "task_recurrences_generation_mode_check" CHECK ("task_recurrences"."generation_mode" = 'schedule'),
	CONSTRAINT "task_recurrences_rrule_check" CHECK (char_length("task_recurrences"."rrule") between 1 and 512
          and "task_recurrences"."rrule" ~ '^[A-Z0-9=;,]+$'
          and "task_recurrences"."rrule" !~ '(^|;)(DTSTART|RDATE|EXDATE|EXRULE)='),
	CONSTRAINT "task_recurrences_timezone_check" CHECK (char_length("task_recurrences"."timezone") between 1 and 128),
	CONSTRAINT "task_recurrences_cutover_shape_check" CHECK ((
          "task_recurrences"."projection_start_date" is not null
          and "task_recurrences"."projection_start_at" is null
          and "task_recurrences"."projection_end_at" is null
          and (
            "task_recurrences"."projection_end_date" is null
            or "task_recurrences"."projection_end_date" >= "task_recurrences"."projection_start_date"
          )
        ) or (
          "task_recurrences"."projection_start_date" is null
          and "task_recurrences"."projection_start_at" is not null
          and "task_recurrences"."projection_end_date" is null
          and (
            "task_recurrences"."projection_end_at" is null
            or "task_recurrences"."projection_end_at" >= "task_recurrences"."projection_start_at"
          )
        ))
);
--> statement-breakpoint
ALTER TABLE "task_occurrence_events" ADD CONSTRAINT "task_occurrence_events_task_owner_fk" FOREIGN KEY ("user_id","task_id") REFERENCES "tasks"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_recurrences" ADD CONSTRAINT "task_recurrences_task_owner_fk" FOREIGN KEY ("user_id","task_id") REFERENCES "tasks"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_occurrence_events_latest_state_idx" ON "task_occurrence_events" USING btree ("user_id","task_id","occurrence_key","task_version" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "task_recurrences_date_cutover_idx" ON "task_recurrences" USING btree ("user_id","projection_start_date","projection_end_date","task_id") WHERE "task_recurrences"."projection_start_date" is not null;--> statement-breakpoint
CREATE INDEX "task_recurrences_instant_cutover_idx" ON "task_recurrences" USING btree ("user_id","projection_start_at","projection_end_at","task_id") WHERE "task_recurrences"."projection_start_at" is not null;--> statement-breakpoint
CREATE FUNCTION "task_occurrence_events_reject_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'task_occurrence_events are append-only' USING ERRCODE = '55000';
  END IF;
  RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "task_occurrence_events_immutable"
BEFORE UPDATE OR DELETE ON "task_occurrence_events"
FOR EACH ROW EXECUTE FUNCTION "task_occurrence_events_reject_mutation"();
