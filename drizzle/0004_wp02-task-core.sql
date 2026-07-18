CREATE TABLE "checklist_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"title" text NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"rank" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checklist_items_title_check" CHECK ("checklist_items"."title" = btrim("checklist_items"."title") and char_length("checklist_items"."title") between 1 and 500),
	CONSTRAINT "checklist_items_rank_check" CHECK ("checklist_items"."rank" = btrim("checklist_items"."rank") and char_length("checklist_items"."rank") between 1 and 128),
	CONSTRAINT "checklist_items_version_check" CHECK ("checklist_items"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "list_folders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rank" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "list_folders_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "list_folders_name_check" CHECK ("list_folders"."name" = btrim("list_folders"."name") and char_length("list_folders"."name") between 1 and 120),
	CONSTRAINT "list_folders_rank_check" CHECK ("list_folders"."rank" = btrim("list_folders"."rank") and char_length("list_folders"."rank") between 1 and 128),
	CONSTRAINT "list_folders_version_check" CHECK ("list_folders"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "list_sections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rank" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_sections_id_user_list_unique" UNIQUE("id","user_id","list_id"),
	CONSTRAINT "list_sections_name_check" CHECK ("list_sections"."name" = btrim("list_sections"."name") and char_length("list_sections"."name") between 1 and 120),
	CONSTRAINT "list_sections_rank_check" CHECK ("list_sections"."rank" = btrim("list_sections"."rank") and char_length("list_sections"."rank") between 1 and 128),
	CONSTRAINT "list_sections_version_check" CHECK ("list_sections"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color_token" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tags_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "tags_name_check" CHECK ("tags"."name" = btrim("tags"."name") and char_length("tags"."name") between 1 and 120),
	CONSTRAINT "tags_color_token_check" CHECK ("tags"."color_token" in ('coral', 'amber', 'mint', 'sky', 'violet', 'slate')),
	CONSTRAINT "tags_version_check" CHECK ("tags"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "task_tags" (
	"user_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "task_tags_pk" PRIMARY KEY("user_id","task_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"section_id" uuid,
	"parent_task_id" uuid,
	"title" text NOT NULL,
	"description_md" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'none' NOT NULL,
	"rank" text NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tasks_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "tasks_title_check" CHECK ("tasks"."title" = btrim("tasks"."title") and char_length("tasks"."title") between 1 and 500),
	CONSTRAINT "tasks_description_md_check" CHECK (char_length("tasks"."description_md") <= 20000),
	CONSTRAINT "tasks_status_check" CHECK ("tasks"."status" in ('open', 'completed', 'cancelled')),
	CONSTRAINT "tasks_priority_check" CHECK ("tasks"."priority" in ('none', 'low', 'medium', 'high')),
	CONSTRAINT "tasks_rank_check" CHECK ("tasks"."rank" = btrim("tasks"."rank") and char_length("tasks"."rank") between 1 and 128),
	CONSTRAINT "tasks_parent_not_self_check" CHECK ("tasks"."parent_task_id" is null or "tasks"."parent_task_id" <> "tasks"."id"),
	CONSTRAINT "tasks_version_check" CHECK ("tasks"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "task_lists" DROP CONSTRAINT "task_lists_name_check";--> statement-breakpoint
DROP INDEX "task_lists_user_active_rank_idx";--> statement-breakpoint
ALTER TABLE "task_lists" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "task_lists" ADD CONSTRAINT "task_lists_id_user_unique" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_task_owner_fk" FOREIGN KEY ("task_id","user_id") REFERENCES "tasks"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_folders" ADD CONSTRAINT "list_folders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_sections" ADD CONSTRAINT "list_sections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_sections" ADD CONSTRAINT "list_sections_list_owner_fk" FOREIGN KEY ("list_id","user_id") REFERENCES "task_lists"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_task_owner_fk" FOREIGN KEY ("task_id","user_id") REFERENCES "tasks"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_tag_owner_fk" FOREIGN KEY ("tag_id","user_id") REFERENCES "tags"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_list_owner_fk" FOREIGN KEY ("list_id","user_id") REFERENCES "task_lists"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_section_owner_list_fk" FOREIGN KEY ("section_id","user_id","list_id") REFERENCES "list_sections"("id","user_id","list_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_owner_fk" FOREIGN KEY ("parent_task_id","user_id") REFERENCES "tasks"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checklist_items_user_id_idx" ON "checklist_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "checklist_items_task_owner_rank_idx" ON "checklist_items" USING btree ("task_id","user_id","rank","id");--> statement-breakpoint
CREATE INDEX "list_folders_user_id_idx" ON "list_folders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "list_folders_user_active_rank_idx" ON "list_folders" USING btree ("user_id","rank","id") WHERE "list_folders"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "list_sections_list_owner_idx" ON "list_sections" USING btree ("list_id","user_id");--> statement-breakpoint
CREATE INDEX "list_sections_user_list_rank_idx" ON "list_sections" USING btree ("user_id","list_id","rank","id");--> statement-breakpoint
CREATE INDEX "tags_user_id_idx" ON "tags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tags_user_active_idx" ON "tags" USING btree ("user_id","id") WHERE "tags"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_active_normalized_name_idx" ON "tags" USING btree ("user_id",lower("name")) WHERE "tags"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "task_tags_task_owner_idx" ON "task_tags" USING btree ("task_id","user_id");--> statement-breakpoint
CREATE INDEX "task_tags_tag_owner_idx" ON "task_tags" USING btree ("tag_id","user_id");--> statement-breakpoint
CREATE INDEX "tasks_user_id_idx" ON "tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_list_owner_idx" ON "tasks" USING btree ("list_id","user_id");--> statement-breakpoint
CREATE INDEX "tasks_section_owner_list_idx" ON "tasks" USING btree ("section_id","user_id","list_id");--> statement-breakpoint
CREATE INDEX "tasks_parent_owner_idx" ON "tasks" USING btree ("parent_task_id","user_id");--> statement-breakpoint
CREATE INDEX "tasks_user_active_rank_idx" ON "tasks" USING btree ("user_id","list_id","parent_task_id","section_id","rank","id") WHERE "tasks"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tasks_user_status_changed_idx" ON "tasks" USING btree ("user_id","status","status_changed_at","id") WHERE "tasks"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "task_lists" ADD CONSTRAINT "task_lists_folder_owner_fk" FOREIGN KEY ("folder_id","user_id") REFERENCES "list_folders"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_lists_user_id_idx" ON "task_lists" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_lists_folder_owner_idx" ON "task_lists" USING btree ("folder_id","user_id");--> statement-breakpoint
CREATE INDEX "task_lists_user_folder_active_rank_idx" ON "task_lists" USING btree ("user_id","folder_id","rank","id") WHERE "task_lists"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "task_lists" ADD CONSTRAINT "task_lists_inbox_folder_check" CHECK ("task_lists"."kind" <> 'inbox' or "task_lists"."folder_id" is null);--> statement-breakpoint
ALTER TABLE "task_lists" ADD CONSTRAINT "task_lists_color_token_check" CHECK ("task_lists"."color_token" in ('coral', 'amber', 'mint', 'sky', 'violet', 'slate'));--> statement-breakpoint
ALTER TABLE "task_lists" ADD CONSTRAINT "task_lists_rank_check" CHECK ("task_lists"."rank" = btrim("task_lists"."rank") and char_length("task_lists"."rank") between 1 and 128);--> statement-breakpoint
ALTER TABLE "task_lists" ADD CONSTRAINT "task_lists_name_check" CHECK ("task_lists"."name" = btrim("task_lists"."name") and char_length("task_lists"."name") between 1 and 120);
