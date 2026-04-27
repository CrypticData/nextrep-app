-- Add exercise type support without removing existing user-created exercises.
CREATE TYPE "ExerciseType" AS ENUM (
    'weight_reps',
    'bodyweight_reps',
    'weighted_bodyweight',
    'assisted_bodyweight'
);

ALTER TABLE "exercises"
ADD COLUMN "exercise_type" "ExerciseType" NOT NULL DEFAULT 'weight_reps';
