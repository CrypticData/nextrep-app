ALTER TABLE "exercises" ADD COLUMN "default_rest_seconds" INTEGER;

ALTER TABLE "workout_session_exercises" ADD COLUMN "rest_seconds" INTEGER;

ALTER TABLE "workout_sessions"
  ADD COLUMN "active_rest_started_at" TIMESTAMPTZ(6),
  ADD COLUMN "active_rest_duration_seconds" INTEGER,
  ADD COLUMN "active_rest_workout_session_exercise_id" UUID;

ALTER TABLE "app_settings" ADD COLUMN "sound_enabled" BOOLEAN NOT NULL DEFAULT TRUE;
