ALTER TABLE "checklist_items" DROP CONSTRAINT "checklist_items_task_owner_fk";--> statement-breakpoint
ALTER TABLE "list_sections" DROP CONSTRAINT "list_sections_list_owner_fk";--> statement-breakpoint
ALTER TABLE "task_lists" DROP CONSTRAINT "task_lists_folder_owner_fk";--> statement-breakpoint
ALTER TABLE "task_tags" DROP CONSTRAINT "task_tags_task_owner_fk";--> statement-breakpoint
ALTER TABLE "task_tags" DROP CONSTRAINT "task_tags_tag_owner_fk";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_list_owner_fk";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_section_owner_list_fk";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_parent_owner_list_fk";--> statement-breakpoint
ALTER TABLE "list_folders" DROP CONSTRAINT "list_folders_id_user_unique";--> statement-breakpoint
ALTER TABLE "list_sections" DROP CONSTRAINT "list_sections_id_user_list_unique";--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT "tags_id_user_unique";--> statement-breakpoint
ALTER TABLE "task_lists" DROP CONSTRAINT "task_lists_id_user_unique";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_id_user_unique";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_id_user_list_unique";--> statement-breakpoint
ALTER TABLE "checklist_items" DROP CONSTRAINT "checklist_items_pkey";--> statement-breakpoint
ALTER TABLE "list_folders" DROP CONSTRAINT "list_folders_pkey";--> statement-breakpoint
ALTER TABLE "list_sections" DROP CONSTRAINT "list_sections_pkey";--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT "tags_pkey";--> statement-breakpoint
ALTER TABLE "task_lists" DROP CONSTRAINT "task_lists_pkey";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_pkey";--> statement-breakpoint
DROP INDEX "checklist_items_user_id_idx";--> statement-breakpoint
DROP INDEX "list_folders_user_id_idx";--> statement-breakpoint
DROP INDEX "list_sections_list_owner_idx";--> statement-breakpoint
DROP INDEX "tags_user_id_idx";--> statement-breakpoint
DROP INDEX "task_lists_user_id_idx";--> statement-breakpoint
DROP INDEX "task_tags_task_owner_idx";--> statement-breakpoint
DROP INDEX "tasks_user_id_idx";--> statement-breakpoint
DROP INDEX "checklist_items_task_owner_rank_idx";--> statement-breakpoint
DROP INDEX "task_lists_folder_owner_idx";--> statement-breakpoint
DROP INDEX "task_tags_tag_owner_idx";--> statement-breakpoint
DROP INDEX "tasks_list_owner_idx";--> statement-breakpoint
DROP INDEX "tasks_section_owner_list_idx";--> statement-breakpoint
DROP INDEX "tasks_parent_owner_list_idx";--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_pkey" PRIMARY KEY("user_id","id");--> statement-breakpoint
ALTER TABLE "list_folders" ADD CONSTRAINT "list_folders_pkey" PRIMARY KEY("user_id","id");--> statement-breakpoint
ALTER TABLE "list_sections" ADD CONSTRAINT "list_sections_pkey" PRIMARY KEY("user_id","id");--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_pkey" PRIMARY KEY("user_id","id");--> statement-breakpoint
ALTER TABLE "task_lists" ADD CONSTRAINT "task_lists_pkey" PRIMARY KEY("user_id","id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_pkey" PRIMARY KEY("user_id","id");--> statement-breakpoint
ALTER TABLE "list_sections" ADD CONSTRAINT "list_sections_user_id_list_unique" UNIQUE("user_id","id","list_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_list_unique" UNIQUE("user_id","id","list_id");--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_task_owner_fk" FOREIGN KEY ("user_id","task_id") REFERENCES "tasks"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_sections" ADD CONSTRAINT "list_sections_list_owner_fk" FOREIGN KEY ("user_id","list_id") REFERENCES "task_lists"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_lists" ADD CONSTRAINT "task_lists_folder_owner_fk" FOREIGN KEY ("user_id","folder_id") REFERENCES "list_folders"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_task_owner_fk" FOREIGN KEY ("user_id","task_id") REFERENCES "tasks"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_tag_owner_fk" FOREIGN KEY ("user_id","tag_id") REFERENCES "tags"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_list_owner_fk" FOREIGN KEY ("user_id","list_id") REFERENCES "task_lists"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_section_owner_list_fk" FOREIGN KEY ("user_id","section_id","list_id") REFERENCES "list_sections"("user_id","id","list_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_owner_list_fk" FOREIGN KEY ("user_id","parent_task_id","list_id") REFERENCES "tasks"("user_id","id","list_id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE INDEX "checklist_items_task_owner_rank_idx" ON "checklist_items" USING btree ("user_id","task_id","rank","id");--> statement-breakpoint
CREATE INDEX "task_lists_folder_owner_idx" ON "task_lists" USING btree ("user_id","folder_id");--> statement-breakpoint
CREATE INDEX "task_tags_tag_owner_idx" ON "task_tags" USING btree ("user_id","tag_id");--> statement-breakpoint
CREATE INDEX "tasks_list_owner_idx" ON "tasks" USING btree ("user_id","list_id");--> statement-breakpoint
CREATE INDEX "tasks_section_owner_list_idx" ON "tasks" USING btree ("user_id","section_id","list_id");--> statement-breakpoint
CREATE INDEX "tasks_parent_owner_list_idx" ON "tasks" USING btree ("user_id","parent_task_id","list_id");
