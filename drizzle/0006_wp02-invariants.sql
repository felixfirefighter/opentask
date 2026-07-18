ALTER TABLE "tasks" DROP CONSTRAINT "tasks_parent_owner_fk";
--> statement-breakpoint
DROP INDEX "tasks_parent_owner_idx";--> statement-breakpoint
DROP INDEX "tags_user_active_normalized_name_idx";--> statement-breakpoint
ALTER TABLE "checklist_items" ALTER COLUMN "rank" SET DATA TYPE text collate "C";--> statement-breakpoint
ALTER TABLE "list_folders" ALTER COLUMN "rank" SET DATA TYPE text collate "C";--> statement-breakpoint
ALTER TABLE "list_sections" ALTER COLUMN "rank" SET DATA TYPE text collate "C";--> statement-breakpoint
ALTER TABLE "task_lists" ALTER COLUMN "rank" SET DATA TYPE text collate "C";--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "rank" SET DATA TYPE text collate "C";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_id_user_list_unique" UNIQUE("id","user_id","list_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_owner_list_fk" FOREIGN KEY ("parent_task_id","user_id","list_id") REFERENCES "tasks"("id","user_id","list_id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE INDEX "tasks_parent_owner_list_idx" ON "tasks" USING btree ("parent_task_id","user_id","list_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_active_normalized_name_idx" ON "tags" USING btree ("user_id",lower(normalize("name", NFKC))) WHERE "tags"."deleted_at" is null;
