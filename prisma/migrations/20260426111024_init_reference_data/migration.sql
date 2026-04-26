CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateEnum
CREATE TYPE "WeightUnit" AS ENUM ('lbs', 'kg');

-- CreateTable
CREATE TABLE "app_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "default_weight_unit" "WeightUnit" NOT NULL DEFAULT 'lbs',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "muscle_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "muscle_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercises" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "equipment_type_id" UUID NOT NULL,
    "primary_muscle_group_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_secondary_muscle_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exercise_id" UUID NOT NULL,
    "muscle_group_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercise_secondary_muscle_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "equipment_types_name_key" ON "equipment_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "muscle_groups_name_key" ON "muscle_groups"("name");

-- CreateIndex
CREATE INDEX "exercises_equipment_type_id_idx" ON "exercises"("equipment_type_id");

-- CreateIndex
CREATE INDEX "exercises_primary_muscle_group_id_idx" ON "exercises"("primary_muscle_group_id");

-- CreateIndex
CREATE INDEX "exercise_secondary_muscle_groups_muscle_group_id_idx" ON "exercise_secondary_muscle_groups"("muscle_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "exercise_secondary_muscle_groups_exercise_id_muscle_group_i_key" ON "exercise_secondary_muscle_groups"("exercise_id", "muscle_group_id");

-- AddCheckConstraint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_singleton" CHECK ("id" = 1);

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_equipment_type_id_fkey" FOREIGN KEY ("equipment_type_id") REFERENCES "equipment_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_primary_muscle_group_id_fkey" FOREIGN KEY ("primary_muscle_group_id") REFERENCES "muscle_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_secondary_muscle_groups" ADD CONSTRAINT "exercise_secondary_muscle_groups_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_secondary_muscle_groups" ADD CONSTRAINT "exercise_secondary_muscle_groups_muscle_group_id_fkey" FOREIGN KEY ("muscle_group_id") REFERENCES "muscle_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SeedData
INSERT INTO "app_settings" ("id", "default_weight_unit")
VALUES (1, 'lbs')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "equipment_types" ("name") VALUES
  ('Barbell'),
  ('Dumbbell'),
  ('Machine')
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "muscle_groups" ("name") VALUES
  ('Abdominals'),
  ('Abductors'),
  ('Adductors'),
  ('Biceps'),
  ('Calves'),
  ('Chest'),
  ('Forearms'),
  ('Full Body'),
  ('Glutes'),
  ('Hamstrings'),
  ('Lats'),
  ('Lower Back'),
  ('Neck'),
  ('Quadriceps'),
  ('Shoulders'),
  ('Traps'),
  ('Triceps'),
  ('Upper Back')
ON CONFLICT ("name") DO NOTHING;
