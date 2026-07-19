CREATE TABLE "task_schedules" (
	"user_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"timezone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_schedules_pkey" PRIMARY KEY("user_id","task_id"),
	CONSTRAINT "task_schedules_kind_check" CHECK ("task_schedules"."kind" in ('all_day', 'timed')),
	CONSTRAINT "task_schedules_shape_check" CHECK ((
          "task_schedules"."kind" = 'all_day'
          and "task_schedules"."start_date" is not null
          and "task_schedules"."end_date" is not null
          and "task_schedules"."start_at" is null
          and "task_schedules"."end_at" is null
          and "task_schedules"."timezone" is null
        ) or (
          "task_schedules"."kind" = 'timed'
          and "task_schedules"."start_date" is null
          and "task_schedules"."end_date" is null
          and "task_schedules"."start_at" is not null
          and "task_schedules"."end_at" is not null
          and "task_schedules"."timezone" is not null
        )),
	CONSTRAINT "task_schedules_bounds_check" CHECK (("task_schedules"."kind" = 'all_day' and "task_schedules"."end_date" > "task_schedules"."start_date")
          or ("task_schedules"."kind" = 'timed' and "task_schedules"."end_at" >= "task_schedules"."start_at")),
	CONSTRAINT "task_schedules_timezone_check" CHECK ("task_schedules"."timezone" is null or char_length("task_schedules"."timezone") between 1 and 128)
);
--> statement-breakpoint
ALTER TABLE "task_schedules" ADD CONSTRAINT "task_schedules_task_owner_fk" FOREIGN KEY ("user_id","task_id") REFERENCES "tasks"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_schedules_user_start_date_idx" ON "task_schedules" USING btree ("user_id","start_date","task_id") WHERE "task_schedules"."kind" = 'all_day';--> statement-breakpoint
CREATE INDEX "task_schedules_user_end_date_idx" ON "task_schedules" USING btree ("user_id","end_date","task_id") WHERE "task_schedules"."kind" = 'all_day';--> statement-breakpoint
CREATE INDEX "task_schedules_user_start_at_idx" ON "task_schedules" USING btree ("user_id","start_at","task_id") WHERE "task_schedules"."kind" = 'timed';--> statement-breakpoint
CREATE INDEX "task_schedules_user_end_at_idx" ON "task_schedules" USING btree ("user_id","end_at","task_id") WHERE "task_schedules"."kind" = 'timed';
