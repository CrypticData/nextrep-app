-- CreateEnum
CREATE TYPE "WorkoutSetType" AS ENUM ('normal', 'warmup', 'failure', 'drop');

-- AlterTable
ALTER TABLE "workout_sessions"
ADD COLUMN "default_weight_unit" "WeightUnit" NOT NULL DEFAULT 'lbs';

-- CreateTable
CREATE TABLE "exercise_weight_unit_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exercise_id" UUID NOT NULL,
    "weight_unit" "WeightUnit" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercise_weight_unit_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_session_exercises" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workout_session_id" UUID NOT NULL,
    "exercise_id" UUID,
    "order_index" INTEGER NOT NULL,
    "input_weight_unit" "WeightUnit",
    "exercise_name_snapshot" TEXT NOT NULL,
    "equipment_name_snapshot" TEXT,
    "primary_muscle_group_name_snapshot" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_session_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_sets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workout_session_exercise_id" UUID NOT NULL,
    "row_index" INTEGER NOT NULL,
    "set_number" INTEGER,
    "set_type" "WorkoutSetType" NOT NULL DEFAULT 'normal',
    "parent_set_id" UUID,
    "reps" INTEGER,
    "rpe" DECIMAL(3,1),
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "checked_at" TIMESTAMPTZ(6),
    "weight_input_value" DECIMAL(10,2),
    "weight_input_unit" "WeightUnit",
    "weight_normalized_value" DECIMAL(10,2),
    "weight_normalized_unit" "WeightUnit",
    "bodyweight_value" DECIMAL(10,2),
    "bodyweight_unit" "WeightUnit",
    "volume_value" DECIMAL(12,2),
    "volume_unit" "WeightUnit",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exercise_weight_unit_preferences_exercise_id_key" ON "exercise_weight_unit_preferences"("exercise_id");

-- CreateIndex
CREATE UNIQUE INDEX "workout_session_exercises_workout_session_id_order_index_key" ON "workout_session_exercises"("workout_session_id", "order_index");

-- CreateIndex
CREATE INDEX "workout_session_exercises_exercise_id_idx" ON "workout_session_exercises"("exercise_id");

-- CreateIndex
CREATE UNIQUE INDEX "workout_sets_workout_session_exercise_id_row_index_key" ON "workout_sets"("workout_session_exercise_id", "row_index");

-- CreateIndex
CREATE INDEX "workout_sets_parent_set_id_idx" ON "workout_sets"("parent_set_id");

-- AddForeignKey
ALTER TABLE "exercise_weight_unit_preferences" ADD CONSTRAINT "exercise_weight_unit_preferences_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_session_exercises" ADD CONSTRAINT "workout_session_exercises_workout_session_id_fkey" FOREIGN KEY ("workout_session_id") REFERENCES "workout_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_session_exercises" ADD CONSTRAINT "workout_session_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_workout_session_exercise_id_fkey" FOREIGN KEY ("workout_session_exercise_id") REFERENCES "workout_session_exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_parent_set_id_fkey" FOREIGN KEY ("parent_set_id") REFERENCES "workout_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Raw constraints Prisma cannot express completely.
ALTER TABLE "workout_sets"
ADD CONSTRAINT "workout_sets_rpe_range"
CHECK ("rpe" IS NULL OR ("rpe" >= 1 AND "rpe" <= 10));

ALTER TABLE "workout_sets"
ADD CONSTRAINT "workout_sets_weight_input_pair"
CHECK (
    ("weight_input_value" IS NULL AND "weight_input_unit" IS NULL)
    OR ("weight_input_value" IS NOT NULL AND "weight_input_unit" IS NOT NULL)
);

ALTER TABLE "workout_sets"
ADD CONSTRAINT "workout_sets_weight_normalized_pair"
CHECK (
    ("weight_normalized_value" IS NULL AND "weight_normalized_unit" IS NULL)
    OR ("weight_normalized_value" IS NOT NULL AND "weight_normalized_unit" IS NOT NULL)
);

ALTER TABLE "workout_sets"
ADD CONSTRAINT "workout_sets_bodyweight_pair"
CHECK (
    ("bodyweight_value" IS NULL AND "bodyweight_unit" IS NULL)
    OR ("bodyweight_value" IS NOT NULL AND "bodyweight_unit" IS NOT NULL)
);

ALTER TABLE "workout_sets"
ADD CONSTRAINT "workout_sets_volume_pair"
CHECK (
    ("volume_value" IS NULL AND "volume_unit" IS NULL)
    OR ("volume_value" IS NOT NULL AND "volume_unit" IS NOT NULL)
);
