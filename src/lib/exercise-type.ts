import type { ExerciseType, WeightUnit } from "@/generated/prisma/enums";

type ExerciseTypeDescriptor = {
  hasWeightInput: boolean;
  usesBodyweight: boolean;
  loadModifier: "add" | "subtract" | null;
  storesInputWeightUnit: boolean;
};

export const EXERCISE_TYPE_BEHAVIOR: Record<
  ExerciseType,
  ExerciseTypeDescriptor
> = {
  weight_reps: {
    hasWeightInput: true,
    usesBodyweight: false,
    loadModifier: null,
    storesInputWeightUnit: true,
  },
  bodyweight_reps: {
    hasWeightInput: false,
    usesBodyweight: true,
    loadModifier: null,
    storesInputWeightUnit: false,
  },
  weighted_bodyweight: {
    hasWeightInput: true,
    usesBodyweight: true,
    loadModifier: "add",
    storesInputWeightUnit: false,
  },
  assisted_bodyweight: {
    hasWeightInput: true,
    usesBodyweight: true,
    loadModifier: "subtract",
    storesInputWeightUnit: false,
  },
};

export function hasWeightInput(exerciseType: ExerciseType) {
  return EXERCISE_TYPE_BEHAVIOR[exerciseType].hasWeightInput;
}

export function usesBodyweight(exerciseType: ExerciseType) {
  return EXERCISE_TYPE_BEHAVIOR[exerciseType].usesBodyweight;
}

export function storesInputWeightUnit(exerciseType: ExerciseType) {
  return EXERCISE_TYPE_BEHAVIOR[exerciseType].storesInputWeightUnit;
}

export function isBodyweightVariant(exerciseType: ExerciseType) {
  return usesBodyweight(exerciseType);
}

export function getWeightColumnLabel(
  exerciseType: ExerciseType,
  weightUnit: WeightUnit,
) {
  if (exerciseType === "bodyweight_reps") {
    return "BW";
  }

  if (exerciseType === "weighted_bodyweight") {
    return `+${weightUnit.toUpperCase()}`;
  }

  if (exerciseType === "assisted_bodyweight") {
    return `-${weightUnit.toUpperCase()}`;
  }

  return weightUnit.toUpperCase();
}

export function getWeightInputLabel(exerciseType: ExerciseType) {
  if (exerciseType === "weighted_bodyweight") {
    return "Added";
  }

  if (exerciseType === "assisted_bodyweight") {
    return "Assist";
  }

  return "Weight";
}

export function getExerciseTypeLabel(exerciseType: ExerciseType) {
  switch (exerciseType) {
    case "weight_reps":
      return "Weight";
    case "bodyweight_reps":
      return "Bodyweight";
    case "weighted_bodyweight":
      return "Weighted";
    case "assisted_bodyweight":
      return "Assisted";
  }
}
