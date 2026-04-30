import { Prisma } from "@/generated/prisma/client";
import type { ExerciseType, WeightUnit } from "@/generated/prisma/enums";
import type { WorkoutSessionExerciseGetPayload } from "@/generated/prisma/models/WorkoutSessionExercise";
import { hasWeightInput, storesInputWeightUnit } from "@/lib/exercise-type";
import { isUuid } from "@/lib/exercise-api";
import { prisma } from "@/lib/prisma";
import { convertWeight, readWeightUnit } from "@/lib/weight-units";

export const workoutSetSelect = {
  id: true,
  rowIndex: true,
  setNumber: true,
  setType: true,
  reps: true,
  rpe: true,
  checked: true,
  checkedAt: true,
  weightInputValue: true,
  weightInputUnit: true,
  weightNormalizedValue: true,
  weightNormalizedUnit: true,
  bodyweightValue: true,
  bodyweightUnit: true,
  volumeValue: true,
  volumeUnit: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WorkoutSetSelect;

export const workoutSessionExerciseSelect = {
  id: true,
  workoutSessionId: true,
  exerciseId: true,
  orderIndex: true,
  inputWeightUnit: true,
  exerciseNameSnapshot: true,
  equipmentNameSnapshot: true,
  primaryMuscleGroupNameSnapshot: true,
  notes: true,
  restSeconds: true,
  createdAt: true,
  updatedAt: true,
  exercise: {
    select: {
      exerciseType: true,
    },
  },
  sets: {
    orderBy: { rowIndex: "asc" },
    select: workoutSetSelect,
  },
} satisfies Prisma.WorkoutSessionExerciseSelect;

type SelectedWorkoutSessionExercise = WorkoutSessionExerciseGetPayload<{
  select: typeof workoutSessionExerciseSelect;
}>;

export type WorkoutSetResponse = {
  id: string;
  row_index: number;
  set_number: number | null;
  set_type: "normal" | "warmup" | "failure" | "drop";
  reps: number | null;
  rpe: string | null;
  checked: boolean;
  checked_at: string | null;
  weight_input_value: string | null;
  weight_input_unit: WeightUnit | null;
  weight_normalized_value: string | null;
  weight_normalized_unit: WeightUnit | null;
  bodyweight_value: string | null;
  bodyweight_unit: WeightUnit | null;
  volume_value: string | null;
  volume_unit: WeightUnit | null;
  created_at: string;
  updated_at: string;
};

export type WorkoutSessionExerciseResponse = {
  id: string;
  workout_session_id: string;
  exercise_id: string | null;
  exercise_type: ExerciseType | null;
  order_index: number;
  input_weight_unit: WeightUnit | null;
  exercise_name_snapshot: string;
  equipment_name_snapshot: string | null;
  primary_muscle_group_name_snapshot: string | null;
  notes: string | null;
  rest_seconds: number | null;
  sets: WorkoutSetResponse[];
  created_at: string;
  updated_at: string;
};

export function parseAddWorkoutExerciseBody(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const exerciseId = (value as Record<string, unknown>).exercise_id;

  return typeof exerciseId === "string" && isUuid(exerciseId)
    ? exerciseId
    : null;
}

export function parseWorkoutExerciseWeightUnitBody(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return readWeightUnit((value as Record<string, unknown>).weight_unit);
}

export function parseWorkoutExerciseNotesBody(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const notes = (value as Record<string, unknown>).notes;

  if (notes === null) {
    return { ok: true as const, notes: null };
  }

  if (typeof notes !== "string") {
    return { ok: false as const, message: "notes must be a string or null." };
  }

  const trimmedNotes = notes.trim();

  if (trimmedNotes.length > 2000) {
    return {
      ok: false as const,
      message: "notes must be 2000 characters or fewer.",
    };
  }

  return { ok: true as const, notes: trimmedNotes || null };
}

export function parseWorkoutExercisePatchBody(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false as const, message: "Request body must be an object." };
  }

  const body = value as Record<string, unknown>;
  const patch: { notes?: string | null; restSeconds?: number | null } = {};

  if ("notes" in body) {
    const parsedNotes = parseWorkoutExerciseNotesBody(value);

    if (!parsedNotes) {
      return { ok: false as const, message: "Request body must be an object." };
    }

    if (!parsedNotes.ok) {
      return parsedNotes;
    }

    patch.notes = parsedNotes.notes;
  }

  if ("rest_seconds" in body) {
    if (body.rest_seconds === null) {
      patch.restSeconds = null;
    } else if (
      typeof body.rest_seconds === "number" &&
      Number.isInteger(body.rest_seconds) &&
      body.rest_seconds >= 5 &&
      body.rest_seconds <= 300
    ) {
      patch.restSeconds = body.rest_seconds;
    } else {
      return {
        ok: false as const,
        message: "rest_seconds must be null or an integer between 5 and 300.",
      };
    }
  }

  if (!("notes" in patch) && !("restSeconds" in patch)) {
    return {
      ok: false as const,
      message: 'Request body must include "notes" or "rest_seconds".',
    };
  }

  return { ok: true as const, patch };
}

export function parseWorkoutExerciseOrderBody(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      ok: false as const,
      message: "Request body must be an object.",
    };
  }

  const workoutExerciseIds = (value as Record<string, unknown>)
    .workout_exercise_ids;

  if (!Array.isArray(workoutExerciseIds)) {
    return {
      ok: false as const,
      message: "workout_exercise_ids must be an array.",
    };
  }

  if (workoutExerciseIds.length === 0) {
    return {
      ok: false as const,
      message: "workout_exercise_ids must include at least one id.",
    };
  }

  if (
    !workoutExerciseIds.every(
      (workoutExerciseId) =>
        typeof workoutExerciseId === "string" && isUuid(workoutExerciseId),
    )
  ) {
    return {
      ok: false as const,
      message: "Each workout_exercise_ids item must be a valid UUID.",
    };
  }

  const uniqueIds = new Set(workoutExerciseIds);

  if (uniqueIds.size !== workoutExerciseIds.length) {
    return {
      ok: false as const,
      message: "workout_exercise_ids must not contain duplicate ids.",
    };
  }

  return { ok: true as const, workoutExerciseIds };
}

export function toWorkoutSessionExerciseResponse(
  workoutExercise: SelectedWorkoutSessionExercise,
): WorkoutSessionExerciseResponse {
  return {
    id: workoutExercise.id,
    workout_session_id: workoutExercise.workoutSessionId,
    exercise_id: workoutExercise.exerciseId,
    exercise_type: workoutExercise.exercise?.exerciseType ?? null,
    order_index: workoutExercise.orderIndex,
    input_weight_unit: workoutExercise.inputWeightUnit,
    exercise_name_snapshot: workoutExercise.exerciseNameSnapshot,
    equipment_name_snapshot: workoutExercise.equipmentNameSnapshot,
    primary_muscle_group_name_snapshot:
      workoutExercise.primaryMuscleGroupNameSnapshot,
    notes: workoutExercise.notes,
    rest_seconds: workoutExercise.restSeconds,
    sets: workoutExercise.sets.map(toWorkoutSetResponse),
    created_at: workoutExercise.createdAt.toISOString(),
    updated_at: workoutExercise.updatedAt.toISOString(),
  };
}

export async function listActiveWorkoutSessionExercises(
  workoutSessionId: string,
) {
  const session = await prisma.workoutSession.findUnique({
    where: { id: workoutSessionId },
    select: { id: true, status: true },
  });

  if (!session || session.status !== "active") {
    return { kind: "workout_not_found" as const };
  }

  const workoutExercises = await prisma.workoutSessionExercise.findMany({
    where: { workoutSessionId },
    orderBy: { orderIndex: "asc" },
    select: workoutSessionExerciseSelect,
  });

  return { kind: "ok" as const, workoutExercises };
}

export async function addExerciseToActiveWorkoutSession(
  workoutSessionId: string,
  exerciseId: string,
) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.workoutSession.findUnique({
      where: { id: workoutSessionId },
      select: { id: true, status: true, defaultWeightUnit: true },
    });

    if (!session || session.status !== "active") {
      return { kind: "workout_not_found" as const };
    }

    const exercise = await tx.exercise.findUnique({
      where: { id: exerciseId },
      select: {
        id: true,
        name: true,
        exerciseType: true,
        equipmentType: { select: { name: true } },
        primaryMuscleGroup: { select: { name: true } },
        weightUnitPreference: { select: { weightUnit: true } },
        defaultRestSeconds: true,
      },
    });

    if (!exercise) {
      return { kind: "exercise_not_found" as const };
    }

    const [settings, lastWorkoutExercise] = await Promise.all([
      tx.appSettings.findUniqueOrThrow({
        where: { id: 1 },
        select: { defaultWeightUnit: true },
      }),
      tx.workoutSessionExercise.findFirst({
        where: { workoutSessionId },
        orderBy: { orderIndex: "desc" },
        select: { orderIndex: true },
      }),
    ]);

    const inputWeightUnit = resolveWorkoutExerciseInputUnit(
      exercise.exerciseType,
      exercise.weightUnitPreference?.weightUnit,
      settings.defaultWeightUnit,
    );

    const workoutExercise = await tx.workoutSessionExercise.create({
      data: {
        workoutSessionId,
        exerciseId: exercise.id,
        orderIndex: (lastWorkoutExercise?.orderIndex ?? -1) + 1,
        inputWeightUnit,
        exerciseNameSnapshot: exercise.name,
        equipmentNameSnapshot: exercise.equipmentType.name,
        primaryMuscleGroupNameSnapshot: exercise.primaryMuscleGroup.name,
        restSeconds: exercise.defaultRestSeconds,
        sets: {
          create: {
            rowIndex: 1,
            setNumber: 1,
            setType: "normal",
          },
        },
      },
      select: workoutSessionExerciseSelect,
    });

    return { kind: "ok" as const, workoutExercise };
  });
}

export async function updateWorkoutExerciseWeightUnit(
  workoutExerciseId: string,
  weightUnit: WeightUnit,
) {
  return prisma.$transaction(async (tx) => {
    const workoutExercise = await tx.workoutSessionExercise.findUnique({
      where: { id: workoutExerciseId },
      select: {
        id: true,
        exerciseId: true,
        exercise: {
          select: {
            exerciseType: true,
          },
        },
        workoutSession: {
          select: {
            defaultWeightUnit: true,
            status: true,
          },
        },
        inputWeightUnit: true,
        sets: {
          select: {
            id: true,
            weightInputValue: true,
            weightInputUnit: true,
          },
        },
      },
    });

    if (!workoutExercise || workoutExercise.workoutSession.status !== "active") {
      return { kind: "workout_exercise_not_found" as const };
    }

    const exerciseType = workoutExercise.exercise?.exerciseType;

    if (!exerciseType || !hasWeightInput(exerciseType)) {
      return { kind: "unsupported_exercise_type" as const };
    }

    if (
      workoutExercise.exerciseId &&
      storesInputWeightUnit(exerciseType)
    ) {
      await tx.exerciseWeightUnitPreference.upsert({
        where: { exerciseId: workoutExercise.exerciseId },
        create: { exerciseId: workoutExercise.exerciseId, weightUnit },
        update: { weightUnit },
        select: { id: true },
      });
    }

    for (const set of workoutExercise.sets) {
      if (set.weightInputValue === null) {
        await tx.workoutSet.update({
          where: { id: set.id },
          data: { weightInputUnit: weightUnit },
          select: { id: true },
        });
        continue;
      }

      const sourceUnit =
        set.weightInputUnit ??
        workoutExercise.inputWeightUnit ??
        workoutExercise.workoutSession.defaultWeightUnit;

      await tx.workoutSet.update({
        where: { id: set.id },
        data: {
          weightInputValue: convertWeight(
            set.weightInputValue,
            sourceUnit,
            weightUnit,
          ),
          weightInputUnit: weightUnit,
        },
        select: { id: true },
      });
    }

    const updatedWorkoutExercise = await tx.workoutSessionExercise.update({
      where: { id: workoutExerciseId },
      data: { inputWeightUnit: weightUnit },
      select: workoutSessionExerciseSelect,
    });

    return { kind: "ok" as const, workoutExercise: updatedWorkoutExercise };
  });
}

export async function updateActiveWorkoutExerciseNotes(
  workoutExerciseId: string,
  notes: string | null,
) {
  const workoutExercise = await prisma.workoutSessionExercise.findUnique({
    where: { id: workoutExerciseId },
    select: {
      id: true,
      workoutSession: {
        select: {
          status: true,
        },
      },
    },
  });

  if (!workoutExercise || workoutExercise.workoutSession.status !== "active") {
    return { kind: "workout_exercise_not_found" as const };
  }

  const updatedWorkoutExercise = await prisma.workoutSessionExercise.update({
    where: { id: workoutExerciseId },
    data: { notes },
    select: workoutSessionExerciseSelect,
  });

  return { kind: "ok" as const, workoutExercise: updatedWorkoutExercise };
}

export async function updateActiveWorkoutExercise(
  workoutExerciseId: string,
  patch: { notes?: string | null; restSeconds?: number | null },
) {
  const workoutExercise = await prisma.workoutSessionExercise.findUnique({
    where: { id: workoutExerciseId },
    select: {
      id: true,
      workoutSession: {
        select: {
          status: true,
        },
      },
    },
  });

  if (!workoutExercise || workoutExercise.workoutSession.status !== "active") {
    return { kind: "workout_exercise_not_found" as const };
  }

  const updatedWorkoutExercise = await prisma.workoutSessionExercise.update({
    where: { id: workoutExerciseId },
    data: {
      ...("notes" in patch ? { notes: patch.notes } : {}),
      ...("restSeconds" in patch ? { restSeconds: patch.restSeconds } : {}),
    },
    select: workoutSessionExerciseSelect,
  });

  return { kind: "ok" as const, workoutExercise: updatedWorkoutExercise };
}

export async function removeExerciseFromActiveWorkout(
  workoutExerciseId: string,
) {
  return prisma.$transaction(async (tx) => {
    const workoutExercise = await tx.workoutSessionExercise.findUnique({
      where: { id: workoutExerciseId },
      select: {
        id: true,
        workoutSessionId: true,
        orderIndex: true,
        workoutSession: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!workoutExercise || workoutExercise.workoutSession.status !== "active") {
      return { kind: "workout_exercise_not_found" as const };
    }

    await tx.workoutSessionExercise.delete({
      where: { id: workoutExerciseId },
      select: { id: true },
    });

    const exercisesToReindex = await tx.workoutSessionExercise.findMany({
      where: {
        workoutSessionId: workoutExercise.workoutSessionId,
        orderIndex: { gt: workoutExercise.orderIndex },
      },
      orderBy: { orderIndex: "asc" },
      select: { id: true, orderIndex: true },
    });

    const orderOffset =
      exercisesToReindex.reduce(
        (maxOrderIndex, exercise) =>
          Math.max(maxOrderIndex, exercise.orderIndex),
        workoutExercise.orderIndex,
      ) + 1;

    for (const exercise of exercisesToReindex) {
      await tx.workoutSessionExercise.update({
        where: { id: exercise.id },
        data: { orderIndex: exercise.orderIndex + orderOffset },
        select: { id: true },
      });
    }

    for (const exercise of exercisesToReindex) {
      await tx.workoutSessionExercise.update({
        where: { id: exercise.id },
        data: { orderIndex: exercise.orderIndex - 1 },
        select: { id: true },
      });
    }

    const workoutExercises = await tx.workoutSessionExercise.findMany({
      where: { workoutSessionId: workoutExercise.workoutSessionId },
      orderBy: { orderIndex: "asc" },
      select: workoutSessionExerciseSelect,
    });

    return { kind: "ok" as const, workoutExercises };
  });
}

export async function reorderActiveWorkoutExercises(
  workoutSessionId: string,
  workoutExerciseIds: string[],
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const session = await tx.workoutSession.findUnique({
        where: { id: workoutSessionId },
        select: { id: true, status: true },
      });

      if (!session || session.status !== "active") {
        return { kind: "workout_not_found" as const };
      }

      const currentWorkoutExercises = await tx.workoutSessionExercise.findMany({
        where: { workoutSessionId },
        orderBy: { orderIndex: "asc" },
        select: { id: true, orderIndex: true },
      });

      if (currentWorkoutExercises.length !== workoutExerciseIds.length) {
        return { kind: "workout_exercise_set_mismatch" as const };
      }

      const currentWorkoutExerciseIds = new Set(
        currentWorkoutExercises.map((workoutExercise) => workoutExercise.id),
      );

      if (
        workoutExerciseIds.some(
          (workoutExerciseId) =>
            !currentWorkoutExerciseIds.has(workoutExerciseId),
        )
      ) {
        return { kind: "workout_exercise_set_mismatch" as const };
      }

      const orderOffset =
        currentWorkoutExercises.reduce(
          (maxOrderIndex, workoutExercise) =>
            Math.max(maxOrderIndex, workoutExercise.orderIndex),
          -1,
        ) +
        currentWorkoutExercises.length +
        1;

      await tx.workoutSessionExercise.updateMany({
        where: { workoutSessionId },
        data: {
          orderIndex: {
            increment: orderOffset,
          },
        },
      });

      for (const [orderIndex, workoutExerciseId] of workoutExerciseIds.entries()) {
        await tx.workoutSessionExercise.update({
          where: { id: workoutExerciseId },
          data: { orderIndex },
          select: { id: true },
        });
      }

      const workoutExercises = await tx.workoutSessionExercise.findMany({
        where: { workoutSessionId },
        orderBy: { orderIndex: "asc" },
        select: workoutSessionExerciseSelect,
      });

      return { kind: "ok" as const, workoutExercises };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { kind: "order_conflict" as const };
    }

    throw error;
  }
}

function resolveWorkoutExerciseInputUnit(
  exerciseType: ExerciseType,
  preferenceWeightUnit: WeightUnit | undefined,
  defaultWeightUnit: WeightUnit,
) {
  return storesInputWeightUnit(exerciseType)
    ? (preferenceWeightUnit ?? defaultWeightUnit)
    : null;
}

export function toWorkoutSetResponse(
  set: SelectedWorkoutSessionExercise["sets"][number],
) {
  return {
    id: set.id,
    row_index: set.rowIndex,
    set_number: set.setNumber,
    set_type: set.setType,
    reps: set.reps,
    rpe: set.rpe?.toFixed(1) ?? null,
    checked: set.checked,
    checked_at: set.checkedAt?.toISOString() ?? null,
    weight_input_value: set.weightInputValue?.toFixed(2) ?? null,
    weight_input_unit: set.weightInputUnit,
    weight_normalized_value: set.weightNormalizedValue?.toFixed(2) ?? null,
    weight_normalized_unit: set.weightNormalizedUnit,
    bodyweight_value: set.bodyweightValue?.toFixed(2) ?? null,
    bodyweight_unit: set.bodyweightUnit,
    volume_value: set.volumeValue?.toFixed(2) ?? null,
    volume_unit: set.volumeUnit,
    created_at: set.createdAt.toISOString(),
    updated_at: set.updatedAt.toISOString(),
  };
}
