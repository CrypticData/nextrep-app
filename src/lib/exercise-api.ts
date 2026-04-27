import { Prisma } from "@/generated/prisma/client";
import type { ExerciseType } from "@/generated/prisma/enums";
import type { ExerciseGetPayload } from "@/generated/prisma/models/Exercise";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const exerciseSelect = {
  id: true,
  name: true,
  description: true,
  exerciseType: true,
  createdAt: true,
  updatedAt: true,
  equipmentType: {
    select: {
      id: true,
      name: true,
    },
  },
  primaryMuscleGroup: {
    select: {
      id: true,
      name: true,
    },
  },
  secondaryMuscles: {
    orderBy: {
      muscleGroup: {
        name: "asc",
      },
    },
    select: {
      muscleGroup: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  weightUnitPreference: {
    select: {
      weightUnit: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.ExerciseSelect;

type SelectedExercise = ExerciseGetPayload<{ select: typeof exerciseSelect }>;

type ReferenceResponse = {
  id: string;
  name: string;
};

export type ExerciseResponse = {
  id: string;
  name: string;
  description: string | null;
  exercise_type: ExerciseType;
  weight_unit_preference: "lbs" | "kg" | null;
  equipment_type: ReferenceResponse;
  primary_muscle_group: ReferenceResponse;
  secondary_muscle_groups: ReferenceResponse[];
  created_at: string;
  updated_at: string;
};

export type ExerciseMutationInput = {
  name: string;
  description: string | null;
  exerciseType: ExerciseType;
  equipmentTypeId: string;
  primaryMuscleGroupId: string;
  secondaryMuscleGroupIds: string[];
};

type ParseResult =
  | { ok: true; data: ExerciseMutationInput }
  | { ok: false; message: string };

type ReferenceLookupClient = Pick<
  Prisma.TransactionClient,
  "equipmentType" | "muscleGroup"
>;

export function isUuid(value: string) {
  return uuidPattern.test(value);
}

export function isKnownPrismaError(error: unknown, code: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

export function parseExerciseMutationBody(value: unknown): ParseResult {
  if (!isRecord(value)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }

  const name = readRequiredString(value.name, "name");
  if (!name.ok) {
    return name;
  }

  const description = readOptionalDescription(value.description);
  if (!description.ok) {
    return description;
  }

  const exerciseType = readExerciseType(value.exercise_type);
  if (!exerciseType.ok) {
    return exerciseType;
  }

  const equipmentTypeId = readRequiredUuid(
    value.equipment_type_id,
    "equipment_type_id",
  );
  if (!equipmentTypeId.ok) {
    return equipmentTypeId;
  }

  const primaryMuscleGroupId = readRequiredUuid(
    value.primary_muscle_group_id,
    "primary_muscle_group_id",
  );
  if (!primaryMuscleGroupId.ok) {
    return primaryMuscleGroupId;
  }

  const rawSecondaryIds =
    "secondary_muscle_group_ids" in value
      ? value.secondary_muscle_group_ids
      : [];

  const secondaryMuscleGroupIds =
    readSecondaryMuscleGroupIds(rawSecondaryIds);
  if (!secondaryMuscleGroupIds.ok) {
    return secondaryMuscleGroupIds;
  }

  return {
    ok: true,
    data: {
      name: name.data,
      description: description.data,
      exerciseType: exerciseType.data,
      equipmentTypeId: equipmentTypeId.data,
      primaryMuscleGroupId: primaryMuscleGroupId.data,
      secondaryMuscleGroupIds: secondaryMuscleGroupIds.data,
    },
  };
}

export async function getExerciseReferenceError(
  db: ReferenceLookupClient,
  input: ExerciseMutationInput,
) {
  const equipmentType = await db.equipmentType.findUnique({
    where: { id: input.equipmentTypeId },
    select: { id: true },
  });

  if (!equipmentType) {
    return "equipment_type_id does not exist.";
  }

  const muscleIds = Array.from(
    new Set([
      input.primaryMuscleGroupId,
      ...input.secondaryMuscleGroupIds,
    ]),
  );

  const muscleGroups = await db.muscleGroup.findMany({
    where: {
      id: {
        in: muscleIds,
      },
    },
    select: {
      id: true,
    },
  });

  const foundMuscleIds = new Set(muscleGroups.map((muscle) => muscle.id));

  if (!foundMuscleIds.has(input.primaryMuscleGroupId)) {
    return "primary_muscle_group_id does not exist.";
  }

  const missingSecondaryId = input.secondaryMuscleGroupIds.find(
    (id) => !foundMuscleIds.has(id),
  );

  if (missingSecondaryId) {
    return "secondary_muscle_group_ids contains an unknown muscle group.";
  }

  return null;
}

export function toExerciseResponse(
  exercise: SelectedExercise,
): ExerciseResponse {
  return {
    id: exercise.id,
    name: exercise.name,
    description: exercise.description,
    exercise_type: exercise.exerciseType,
    weight_unit_preference: exercise.weightUnitPreference?.weightUnit ?? null,
    equipment_type: exercise.equipmentType,
    primary_muscle_group: exercise.primaryMuscleGroup,
    secondary_muscle_groups: exercise.secondaryMuscles.map(
      (secondaryMuscle) => secondaryMuscle.muscleGroup,
    ),
    created_at: exercise.createdAt.toISOString(),
    updated_at: exercise.updatedAt.toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readExerciseType(
  value: unknown,
): { ok: true; data: ExerciseType } | { ok: false; message: string } {
  if (value === undefined || value === null) {
    return { ok: true, data: "weight_reps" };
  }

  if (
    value === "weight_reps" ||
    value === "bodyweight_reps" ||
    value === "weighted_bodyweight" ||
    value === "assisted_bodyweight"
  ) {
    return { ok: true, data: value };
  }

  return {
    ok: false,
    message:
      "exercise_type must be one of weight_reps, bodyweight_reps, weighted_bodyweight, assisted_bodyweight.",
  };
}

function readRequiredString(
  value: unknown,
  field: string,
): { ok: true; data: string } | { ok: false; message: string } {
  if (typeof value !== "string") {
    return { ok: false, message: `${field} must be a string.` };
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return { ok: false, message: `${field} is required.` };
  }

  return { ok: true, data: trimmed };
}

function readOptionalDescription(
  value: unknown,
): { ok: true; data: string | null } | { ok: false; message: string } {
  if (value === undefined || value === null) {
    return { ok: true, data: null };
  }

  if (typeof value !== "string") {
    return { ok: false, message: "description must be a string or null." };
  }

  const trimmed = value.trim();

  return { ok: true, data: trimmed.length > 0 ? trimmed : null };
}

function readRequiredUuid(
  value: unknown,
  field: string,
): { ok: true; data: string } | { ok: false; message: string } {
  if (typeof value !== "string") {
    return { ok: false, message: `${field} must be a UUID string.` };
  }

  const trimmed = value.trim();

  if (!isUuid(trimmed)) {
    return { ok: false, message: `${field} must be a valid UUID.` };
  }

  return { ok: true, data: trimmed };
}

function readSecondaryMuscleGroupIds(
  value: unknown,
): { ok: true; data: string[] } | { ok: false; message: string } {
  if (!Array.isArray(value)) {
    return {
      ok: false,
      message: "secondary_muscle_group_ids must be an array of UUID strings.",
    };
  }

  const ids: string[] = [];

  for (const id of value) {
    if (typeof id !== "string") {
      return {
        ok: false,
        message:
          "secondary_muscle_group_ids must contain only UUID strings.",
      };
    }

    const trimmed = id.trim();

    if (!isUuid(trimmed)) {
      return {
        ok: false,
        message:
          "secondary_muscle_group_ids must contain only valid UUIDs.",
      };
    }

    ids.push(trimmed);
  }

  return { ok: true, data: Array.from(new Set(ids)) };
}
