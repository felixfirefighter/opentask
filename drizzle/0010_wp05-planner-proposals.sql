CREATE TABLE "planner_proposals" (
	"id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"planning_date" date NOT NULL,
	"schema_version" integer NOT NULL,
	"proposal" jsonb NOT NULL,
	"context_versions" jsonb NOT NULL,
	"status" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"applied_at" timestamp with time zone,
	CONSTRAINT "planner_proposals_pkey" PRIMARY KEY("user_id","id"),
	CONSTRAINT "planner_proposals_schema_version_check" CHECK ("planner_proposals"."schema_version" > 0),
	CONSTRAINT "planner_proposals_status_check" CHECK ("planner_proposals"."status" in ('pending', 'applied', 'expired', 'rejected')),
	CONSTRAINT "planner_proposals_model_check" CHECK (char_length("planner_proposals"."model") between 1 and 100),
	CONSTRAINT "planner_proposals_prompt_version_check" CHECK (char_length("planner_proposals"."prompt_version") between 1 and 100),
	CONSTRAINT "planner_proposals_expiry_check" CHECK ("planner_proposals"."expires_at" > "planner_proposals"."created_at"),
	CONSTRAINT "planner_proposals_applied_at_check" CHECK (("planner_proposals"."status" = 'applied') = ("planner_proposals"."applied_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "planner_proposals" ADD CONSTRAINT "planner_proposals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "planner_proposals_user_idempotency_key_idx" ON "planner_proposals" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "planner_proposals_user_status_expiry_idx" ON "planner_proposals" USING btree ("user_id","status","expires_at");
