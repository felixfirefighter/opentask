CREATE TABLE "focus_sessions" (
	"id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid,
	"habit_id" uuid,
	"kind" text NOT NULL,
	"mode" text NOT NULL,
	"state" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"paused_at" timestamp with time zone,
	"accumulated_active_seconds" integer DEFAULT 0 NOT NULL,
	"planned_seconds" integer,
	"ended_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "focus_sessions_pkey" PRIMARY KEY("user_id","id"),
	CONSTRAINT "focus_sessions_kind_check" CHECK ("focus_sessions"."kind" in ('focus', 'break')),
	CONSTRAINT "focus_sessions_mode_check" CHECK ("focus_sessions"."mode" in ('pomodoro', 'stopwatch')),
	CONSTRAINT "focus_sessions_state_check" CHECK ("focus_sessions"."state" in ('active', 'paused', 'completed')),
	CONSTRAINT "focus_sessions_link_shape_check" CHECK (not ("focus_sessions"."task_id" is not null and "focus_sessions"."habit_id" is not null)),
	CONSTRAINT "focus_sessions_timer_shape_check" CHECK ((
          "focus_sessions"."kind" = 'focus'
          and (
            (
              "focus_sessions"."mode" = 'pomodoro'
              and "focus_sessions"."planned_seconds" between 60 and 14400
              and mod("focus_sessions"."planned_seconds", 60) = 0
            )
            or ("focus_sessions"."mode" = 'stopwatch' and "focus_sessions"."planned_seconds" is null)
          )
        ) or (
          "focus_sessions"."kind" = 'break'
          and "focus_sessions"."mode" = 'pomodoro'
          and "focus_sessions"."task_id" is null
          and "focus_sessions"."habit_id" is null
          and "focus_sessions"."planned_seconds" between 60 and 3600
          and mod("focus_sessions"."planned_seconds", 60) = 0
        )),
	CONSTRAINT "focus_sessions_accumulated_seconds_check" CHECK ("focus_sessions"."accumulated_active_seconds" between 0 and 2147483647),
	CONSTRAINT "focus_sessions_state_timestamps_check" CHECK ((
          "focus_sessions"."state" = 'active'
          and "focus_sessions"."paused_at" is null
          and "focus_sessions"."ended_at" is null
        ) or (
          "focus_sessions"."state" = 'paused'
          and "focus_sessions"."paused_at" is not null
          and "focus_sessions"."paused_at" >= "focus_sessions"."started_at"
          and "focus_sessions"."ended_at" is null
        ) or (
          "focus_sessions"."state" = 'completed'
          and "focus_sessions"."paused_at" is null
          and "focus_sessions"."ended_at" is not null
          and "focus_sessions"."ended_at" >= "focus_sessions"."started_at"
        )),
	CONSTRAINT "focus_sessions_version_check" CHECK ("focus_sessions"."version" between 1 and 2147483647)
);
--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_task_owner_fk" FOREIGN KEY ("user_id","task_id") REFERENCES "tasks"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_habit_owner_fk" FOREIGN KEY ("user_id","habit_id") REFERENCES "habits"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "focus_sessions_one_unfinished_per_user_idx" ON "focus_sessions" USING btree ("user_id") WHERE "focus_sessions"."state" in ('active', 'paused');--> statement-breakpoint
CREATE INDEX "focus_sessions_completed_history_idx" ON "focus_sessions" USING btree ("user_id","ended_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "focus_sessions"."state" = 'completed' and "focus_sessions"."kind" = 'focus';--> statement-breakpoint
CREATE INDEX "focus_sessions_task_owner_idx" ON "focus_sessions" USING btree ("user_id","task_id") WHERE "focus_sessions"."task_id" is not null;--> statement-breakpoint
CREATE INDEX "focus_sessions_habit_owner_idx" ON "focus_sessions" USING btree ("user_id","habit_id") WHERE "focus_sessions"."habit_id" is not null;
