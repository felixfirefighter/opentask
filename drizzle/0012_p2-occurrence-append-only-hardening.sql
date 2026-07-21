CREATE OR REPLACE FUNCTION "task_occurrence_events_reject_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR EXISTS (
    SELECT 1
      FROM "tasks"
     WHERE "tasks"."user_id" = OLD."user_id"
       AND "tasks"."id" = OLD."task_id"
  ) THEN
    RAISE EXCEPTION 'task_occurrence_events are append-only' USING ERRCODE = '55000';
  END IF;
  RETURN OLD;
END;
$$;
