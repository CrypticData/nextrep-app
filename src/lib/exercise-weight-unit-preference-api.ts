import type { WeightUnit } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { readWeightUnit } from "@/lib/weight-units";

export type ExerciseWeightUnitPreferenceResponse = {
  exercise_id: string;
  weight_unit: WeightUnit;
  updated_at: string;
};

export function parseExerciseWeightUnitPreferenceBody(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return readWeightUnit((value as Record<string, unknown>).weight_unit);
}

export function toExerciseWeightUnitPreferenceResponse(preference: {
  exerciseId: string;
  weightUnit: WeightUnit;
  updatedAt: Date;
}): ExerciseWeightUnitPreferenceResponse {
  return {
    exercise_id: preference.exerciseId,
    weight_unit: preference.weightUnit,
    updated_at: preference.updatedAt.toISOString(),
  };
}

export async function upsertExerciseWeightUnitPreference(
  exerciseId: string,
  weightUnit: WeightUnit,
) {
  return prisma.$transaction(async (tx) => {
    const exercise = await tx.exercise.findUnique({
      where: { id: exerciseId },
      select: { id: true, exerciseType: true },
    });

    if (!exercise) {
      return { kind: "not_found" as const };
    }

    if (exercise.exerciseType !== "weight_reps") {
      return { kind: "unsupported_exercise_type" as const };
    }

    const preference = await tx.exerciseWeightUnitPreference.upsert({
      where: { exerciseId },
      create: { exerciseId, weightUnit },
      update: { weightUnit },
      select: {
        exerciseId: true,
        weightUnit: true,
        updatedAt: true,
      },
    });

    return { kind: "ok" as const, preference };
  });
}
