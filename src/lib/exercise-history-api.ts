import { Prisma } from "@/generated/prisma/client";
import type { ExerciseType, WeightUnit } from "@/generated/prisma/enums";
import type { WorkoutSessionGetPayload } from "@/generated/prisma/models/WorkoutSession";
import { hasWeightInput } from "@/lib/exercise-type";
import { prisma } from "@/lib/prisma";
import { convertWeight } from "@/lib/weight-units";
import { isUuid } from "@/lib/workout-session-api";

const exerciseHistorySessionSelect = {
  id: true,
  name: true,
  status: true,
  defaultWeightUnit: true,
  startedAt: true,
  endedAt: true,
  createdAt: true,
  exercises: {
    where: {
      sets: {
        some: {
          reps: { gte: 1 },
        },
      },
    },
    orderBy: { orderIndex: "asc" },
    select: {
      id: true,
      orderIndex: true,
      sets: {
        where: {
          reps: { gte: 1 },
        },
        orderBy: { rowIndex: "asc" },
        select: {
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
        },
      },
    },
  },
} satisfies Prisma.WorkoutSessionSelect;

type ExerciseHistorySession = WorkoutSessionGetPayload<{
  select: typeof exerciseHistorySessionSelect;
}>;

type ExerciseHistoryWorkoutExercise =
  ExerciseHistorySession["exercises"][number];
type ExerciseHistorySet = ExerciseHistoryWorkoutExercise["sets"][number];

export type ExerciseHistoryResponse = {
  exercise_id: string;
  exercise_type: ExerciseType;
  display_weight_unit: WeightUnit;
  workouts: {
    id: string;
    name: string;
    started_at: string;
    ended_at: string;
    duration_seconds: number;
    workout_url: string;
    set_count: number;
    sets: {
      id: string;
      workout_session_exercise_id: string;
      row_index: number;
      set_number: number | null;
      set_type: "normal" | "warmup" | "failure" | "drop";
      weight: number | null;
      weight_unit: WeightUnit | null;
      bodyweight: number | null;
      bodyweight_unit: WeightUnit | null;
      reps: number;
      rpe: number | null;
      checked: boolean;
      checked_at: string | null;
    }[];
  }[];
};

export async function getExerciseHistory(id: string): Promise<
  | { kind: "invalid_id" }
  | { kind: "not_found" }
  | { kind: "ok"; history: ExerciseHistoryResponse }
> {
  if (!isUuid(id)) {
    return { kind: "invalid_id" };
  }

  const [exercise, settings] = await Promise.all([
    prisma.exercise.findUnique({
      where: { id },
      select: {
        id: true,
        exerciseType: true,
        weightUnitPreference: {
          select: {
            weightUnit: true,
          },
        },
      },
    }),
    prisma.appSettings.findUnique({
      where: { id: 1 },
      select: { defaultWeightUnit: true },
    }),
  ]);

  if (!exercise) {
    return { kind: "not_found" };
  }

  const displayWeightUnit =
    exercise.weightUnitPreference?.weightUnit ??
    settings?.defaultWeightUnit ??
    "lbs";

  const sessions = await prisma.workoutSession.findMany({
    where: {
      status: "completed",
      endedAt: { not: null },
      exercises: {
        some: {
          exerciseId: id,
          sets: {
            some: {
              reps: { gte: 1 },
            },
          },
        },
      },
    },
    orderBy: [{ endedAt: "desc" }, { createdAt: "desc" }],
    select: {
      ...exerciseHistorySessionSelect,
      exercises: {
        ...exerciseHistorySessionSelect.exercises,
        where: {
          exerciseId: id,
          sets: {
            some: {
              reps: { gte: 1 },
            },
          },
        },
      },
    },
  });

  return {
    kind: "ok",
    history: {
      exercise_id: exercise.id,
      exercise_type: exercise.exerciseType,
      display_weight_unit: displayWeightUnit,
      workouts: sessions.map((session) =>
        toHistoryWorkout(session, exercise.exerciseType, displayWeightUnit),
      ),
    },
  };
}

function toHistoryWorkout(
  session: ExerciseHistorySession,
  exerciseType: ExerciseType,
  displayWeightUnit: WeightUnit,
): ExerciseHistoryResponse["workouts"][number] {
  const endedAt = requireEndedAt(session);
  const sets = session.exercises.flatMap((exercise) =>
    exercise.sets.map((set) =>
      toHistorySet(set, exercise.id, exerciseType, displayWeightUnit),
    ),
  );

  return {
    id: session.id,
    name: session.name ?? "Workout",
    started_at: session.startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_seconds: getDurationSeconds(session.startedAt, endedAt),
    workout_url: `/profile/workouts/${session.id}`,
    set_count: sets.length,
    sets,
  };
}

function toHistorySet(
  set: ExerciseHistorySet,
  workoutSessionExerciseId: string,
  exerciseType: ExerciseType,
  displayWeightUnit: WeightUnit,
): ExerciseHistoryResponse["workouts"][number]["sets"][number] {
  return {
    id: set.id,
    workout_session_exercise_id: workoutSessionExerciseId,
    row_index: set.rowIndex,
    set_number: set.setNumber,
    set_type: set.setType,
    weight: getDisplayWeight(set, exerciseType, displayWeightUnit),
    weight_unit:
      !hasWeightInput(exerciseType)
        ? null
        : getDisplayWeightUnit(set, displayWeightUnit),
    bodyweight: getDisplayBodyweight(set, displayWeightUnit),
    bodyweight_unit: set.bodyweightValue ? displayWeightUnit : null,
    reps: set.reps ?? 0,
    rpe: decimalToNumber(set.rpe),
    checked: set.checked,
    checked_at: set.checkedAt?.toISOString() ?? null,
  };
}

function getDisplayWeight(
  set: ExerciseHistorySet,
  exerciseType: ExerciseType,
  displayWeightUnit: WeightUnit,
) {
  if (!hasWeightInput(exerciseType)) {
    return null;
  }

  if (set.weightNormalizedValue && set.weightNormalizedUnit) {
    return decimalToNumber(
      convertWeight(
        set.weightNormalizedValue,
        set.weightNormalizedUnit,
        displayWeightUnit,
      ),
    );
  }

  if (set.weightInputValue && set.weightInputUnit) {
    return decimalToNumber(
      convertWeight(set.weightInputValue, set.weightInputUnit, displayWeightUnit),
    );
  }

  return null;
}

function getDisplayWeightUnit(
  set: ExerciseHistorySet,
  displayWeightUnit: WeightUnit,
) {
  if (
    (set.weightNormalizedValue && set.weightNormalizedUnit) ||
    (set.weightInputValue && set.weightInputUnit)
  ) {
    return displayWeightUnit;
  }

  return null;
}

function getDisplayBodyweight(
  set: ExerciseHistorySet,
  displayWeightUnit: WeightUnit,
) {
  if (!set.bodyweightValue || !set.bodyweightUnit) {
    return null;
  }

  return decimalToNumber(
    convertWeight(set.bodyweightValue, set.bodyweightUnit, displayWeightUnit),
  );
}

function decimalToNumber(value: Prisma.Decimal | null) {
  if (!value) {
    return null;
  }

  return Number(value.toFixed(2));
}

function getDurationSeconds(startedAt: Date, endedAt: Date) {
  return Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));
}

function requireEndedAt(session: ExerciseHistorySession) {
  if (!session.endedAt) {
    throw new Error("Completed workout is missing endedAt.");
  }

  return session.endedAt;
}
