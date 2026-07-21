ALTER TABLE "user_preferences" DROP CONSTRAINT "user_preferences_schema_version_check";--> statement-breakpoint
UPDATE "user_preferences"
SET "schema_version" = 2,
    "preferences" = "preferences" || '{"onboarding":{"complete":false,"completedAt":null,"goals":[],"checkins":[]}}'::jsonb;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_schema_version_check" CHECK ("user_preferences"."schema_version" = 2);
