/*
  Warnings:

  - You are about to drop the column `parent_set_id` on the `workout_sets` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "workout_sets" DROP CONSTRAINT "workout_sets_parent_set_id_fkey";

-- DropIndex
DROP INDEX "workout_sets_parent_set_id_idx";

-- AlterTable
ALTER TABLE "workout_sets" DROP COLUMN "parent_set_id";
