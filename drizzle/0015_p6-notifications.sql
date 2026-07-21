CREATE TABLE "notification_deliveries" (
	"id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reminder_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"occurrence_key" text,
	"scheduled_for" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'scheduled' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"delivered_at" timestamp with time zone,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY("user_id","id"),
	CONSTRAINT "notification_deliveries_state_check" CHECK ("notification_deliveries"."state" in (
          'scheduled', 'delivering', 'retry_scheduled', 'delivered', 'suppressed', 'failed'
        )),
	CONSTRAINT "notification_deliveries_occurrence_key_check" CHECK ("notification_deliveries"."occurrence_key" is null or char_length("notification_deliveries"."occurrence_key") between 1 and 80),
	CONSTRAINT "notification_deliveries_attempt_count_check" CHECK ("notification_deliveries"."attempt_count" between 0 and 4),
	CONSTRAINT "notification_deliveries_error_code_check" CHECK ("notification_deliveries"."last_error_code" is null or (
          char_length("notification_deliveries"."last_error_code") between 1 and 80
          and "notification_deliveries"."last_error_code" ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
        )),
	CONSTRAINT "notification_deliveries_idempotency_key_check" CHECK ("notification_deliveries"."idempotency_key" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "notification_deliveries_state_shape_check" CHECK ((
      "notification_deliveries"."state" = 'scheduled'
      and "notification_deliveries"."attempt_count" = 0
      and "notification_deliveries"."last_error_code" is null
      and "notification_deliveries"."delivered_at" is null
    ) or (
      "notification_deliveries"."state" = 'delivering'
      and "notification_deliveries"."attempt_count" between 1 and 4
      and "notification_deliveries"."last_error_code" is null
      and "notification_deliveries"."delivered_at" is null
    ) or (
      "notification_deliveries"."state" = 'retry_scheduled'
      and "notification_deliveries"."attempt_count" between 1 and 3
      and "notification_deliveries"."last_error_code" is not null
      and "notification_deliveries"."delivered_at" is null
    ) or (
      "notification_deliveries"."state" = 'delivered'
      and "notification_deliveries"."attempt_count" between 1 and 4
      and "notification_deliveries"."last_error_code" is null
      and "notification_deliveries"."delivered_at" is not null
    ) or (
      "notification_deliveries"."state" = 'suppressed'
      and "notification_deliveries"."attempt_count" between 0 and 4
      and "notification_deliveries"."last_error_code" is not null
      and "notification_deliveries"."delivered_at" is null
    ) or (
      "notification_deliveries"."state" = 'failed'
      and "notification_deliveries"."attempt_count" between 1 and 4
      and "notification_deliveries"."last_error_code" is not null
      and "notification_deliveries"."delivered_at" is null
    )),
	CONSTRAINT "notification_deliveries_timestamps_check" CHECK ("notification_deliveries"."updated_at" >= "notification_deliveries"."created_at"
          and (
            "notification_deliveries"."delivered_at" is null
            or ("notification_deliveries"."delivered_at" >= "notification_deliveries"."scheduled_for" and "notification_deliveries"."delivered_at" <= "notification_deliveries"."updated_at")
          ))
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint_hash" "bytea" NOT NULL,
	"endpoint_ciphertext" text NOT NULL,
	"p256dh_ciphertext" text NOT NULL,
	"auth_ciphertext" text NOT NULL,
	"encryption_key_version" integer NOT NULL,
	"device_label" text,
	"user_agent_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY("user_id","id"),
	CONSTRAINT "push_subscriptions_endpoint_hash_check" CHECK (octet_length("push_subscriptions"."endpoint_hash") = 32),
	CONSTRAINT "push_subscriptions_endpoint_ciphertext_check" CHECK (char_length("push_subscriptions"."endpoint_ciphertext") between 45 and 8192
    and "push_subscriptions"."endpoint_ciphertext" ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$'),
	CONSTRAINT "push_subscriptions_p256dh_ciphertext_check" CHECK (char_length("push_subscriptions"."p256dh_ciphertext") between 45 and 1024
    and "push_subscriptions"."p256dh_ciphertext" ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$'),
	CONSTRAINT "push_subscriptions_auth_ciphertext_check" CHECK (char_length("push_subscriptions"."auth_ciphertext") between 45 and 1024
    and "push_subscriptions"."auth_ciphertext" ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$'),
	CONSTRAINT "push_subscriptions_encryption_key_version_check" CHECK ("push_subscriptions"."encryption_key_version" between 0 and 2147483647),
	CONSTRAINT "push_subscriptions_device_label_check" CHECK ("push_subscriptions"."device_label" is null or char_length("push_subscriptions"."device_label") between 1 and 120),
	CONSTRAINT "push_subscriptions_user_agent_summary_check" CHECK ("push_subscriptions"."user_agent_summary" is null or char_length("push_subscriptions"."user_agent_summary") between 1 and 500),
	CONSTRAINT "push_subscriptions_timestamps_check" CHECK ("push_subscriptions"."last_used_at" >= "push_subscriptions"."created_at"
          and ("push_subscriptions"."revoked_at" is null or "push_subscriptions"."revoked_at" >= "push_subscriptions"."last_used_at"))
);
--> statement-breakpoint
CREATE TABLE "task_reminders" (
	"id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"remind_at" timestamp with time zone,
	"offset_minutes" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_reminders_pkey" PRIMARY KEY("user_id","id"),
	CONSTRAINT "task_reminders_user_task_unique" UNIQUE("user_id","task_id"),
	CONSTRAINT "task_reminders_kind_check" CHECK ("task_reminders"."kind" in ('absolute', 'relative_start')),
	CONSTRAINT "task_reminders_shape_check" CHECK ((
          "task_reminders"."kind" = 'absolute'
          and "task_reminders"."remind_at" is not null
          and "task_reminders"."offset_minutes" is null
        ) or (
          "task_reminders"."kind" = 'relative_start'
          and "task_reminders"."remind_at" is null
          and "task_reminders"."offset_minutes" between 0 and 10080
        )),
	CONSTRAINT "task_reminders_version_check" CHECK ("task_reminders"."version" between 1 and 2147483647),
	CONSTRAINT "task_reminders_timestamps_check" CHECK ("task_reminders"."updated_at" >= "task_reminders"."created_at")
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_reminder_owner_fk" FOREIGN KEY ("user_id","reminder_id") REFERENCES "task_reminders"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_subscription_owner_fk" FOREIGN KEY ("user_id","subscription_id") REFERENCES "push_subscriptions"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_task_owner_fk" FOREIGN KEY ("user_id","task_id") REFERENCES "tasks"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_idempotency_key_idx" ON "notification_deliveries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "notification_deliveries_user_state_scheduled_idx" ON "notification_deliveries" USING btree ("user_id","state","scheduled_for","id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_reminder_state_scheduled_idx" ON "notification_deliveries" USING btree ("user_id","reminder_id","state","scheduled_for","id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_subscription_state_scheduled_idx" ON "notification_deliveries" USING btree ("user_id","subscription_id","state","scheduled_for","id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_active_endpoint_hash_idx" ON "push_subscriptions" USING btree ("endpoint_hash") WHERE "push_subscriptions"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_active_idx" ON "push_subscriptions" USING btree ("user_id","last_used_at" DESC NULLS LAST,"id") WHERE "push_subscriptions"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "task_reminders_user_enabled_idx" ON "task_reminders" USING btree ("user_id","task_id") WHERE "task_reminders"."enabled" = true;
