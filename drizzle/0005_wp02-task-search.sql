CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;--> statement-breakpoint
CREATE INDEX "tags_name_search_idx" ON "tags" USING gin (lower("name") public.gin_trgm_ops) WHERE "tags"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tasks_title_search_idx" ON "tasks" USING gin (lower("title") public.gin_trgm_ops) WHERE "tasks"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tasks_description_search_idx" ON "tasks" USING gin (lower("description_md") public.gin_trgm_ops) WHERE "tasks"."deleted_at" is null;
