import { Prisma } from "@/generated/prisma/client";
import type { ExerciseType, WeightUnit } from "@/generated/prisma/enums";
import type { WorkoutSessionGetPayload } from "@/generated/prisma/models/WorkoutSession";
import { prisma } from "@/lib/prisma";
import { convertWeight } from "@/lib/weight-units";
import { isUuid } from "@/lib/workout-session-api";

const completedWorkoutSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  defaultWeightUnit: true,
  startedAt: true,
  endedAt: true,
  createdAt: true,
  exercises: {
    orderBy: { orderIndex: "asc" },
    select: {
      id: true,
      orderIndex: true,
      inputWeightUnit: true,
      exerciseNameSnapshot: true,
      equipmentNameSnapshot: true,
      primaryMuscleGroupNameSnapshot: true,
      exercise: {
        select: {
          exerciseType: true,
        },
      },
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
          volumeValue: true,
          volumeUnit: true,
        },
      },
    },
  },
} satisfies Prisma.WorkoutSessionSelect;

type CompletedWorkoutSession = WorkoutSessionGetPayload<{
  select: typeof completedWorkoutSelect;
}>;

type CompletedWorkoutExercise = CompletedWorkoutSession["exercises"][number];
type CompletedWorkoutSet = CompletedWorkoutExercise["sets"][number];

export type CompletedWorkoutListItem = {
  id: string;
  name: string;
  description: string | null;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  default_weight_unit: WeightUnit;
  recorded_set_count: number;
  volume: {
    value: number;
    unit: WeightUnit;
  };
  exercises: {
    id: string;
    name: string;
    equipment_name: string | null;
    primary_muscle_group_name: string | null;
    recorded_set_count: number;
  }[];
};

export type CompletedWorkoutDetail = {
  id: string;
  name: string;
  description: string | null;
  status: "completed";
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  default_weight_unit: WeightUnit;
  recorded_set_count: number;
  volume: {
    value: number;
    unit: WeightUnit;
  };
  exercises: {
    id: string;
    order_index: number;
    exercise_name_snapshot: string;
    equipment_name_snapshot: string | null;
    primary_muscle_group_name_snapshot: string | null;
    input_weight_unit: WeightUnit | null;
    exercise_type: ExerciseType | null;
    recorded_set_count: number;
    sets: {
      id: string;
      row_index: number;
      set_number: number | null;
      set_type: "normal" | "warmup" | "failure" | "drop";
      weight: number | null;
      weight_unit: WeightUnit | null;
      reps: number;
      rpe: number | null;
      checked: boolean;
      checked_at: string | null;
    }[];
  }[];
};

export async function listCompletedWorkouts(): Promise<
  CompletedWorkoutListItem[]
> {
  const sessions = await prisma.workoutSession.findMany({
    where: {
      status: "completed",
      endedAt: { not: null },
    },
    orderBy: [{ endedAt: "desc" }, { createdAt: "desc" }],
    select: completedWorkoutSelect,
  });

  return sessions.map(toCompletedWorkoutListItem);
}

export async function getCompletedWorkoutDetail(id: string) {
  if (!isUuid(id)) {
    return { kind: "invalid_id" as const };
  }

  const session = await prisma.workoutSession.findFirst({
    where: {
      id,
      status: "completed",
      endedAt: { not: null },
    },
    select: completedWorkoutSelect,
  });

  if (!session) {
    return { kind: "not_found" as const };
  }

  return {
    kind: "ok" as const,
    workout: toCompletedWorkoutDetail(session),
  };
}

function toCompletedWorkoutListItem(
  session: CompletedWorkoutSession,
): CompletedWorkoutListItem {
  const endedAt = requireEndedAt(session);
  const summary = summarizeCompletedWorkout(session);

  return {
    id: session.id,
    name: session.name ?? "Workout",
    description: session.description,
    started_at: session.startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_seconds: getDurationSeconds(session.startedAt, endedAt),
    default_weight_unit: session.defaultWeightUnit,
    recorded_set_count: summary.recordedSetCount,
    volume: summary.volume,
    exercises: session.exercises.slice(0, 3).map((exercise) => ({
      id: exercise.id,
      name: exercise.exerciseNameSnapshot,
      equipment_name: exercise.equipmentNameSnapshot,
      primary_muscle_group_name: exercise.primaryMuscleGroupNameSnapshot,
      recorded_set_count: exercise.sets.length,
    })),
  };
}

function toCompletedWorkoutDetail(
  session: CompletedWorkoutSession,
): CompletedWorkoutDetail {
  const endedAt = requireEndedAt(session);
  const summary = summarizeCompletedWorkout(session);

  return {
    id: session.id,
    name: session.name ?? "Workout",
    description: session.description,
    status: "completed",
    started_at: session.startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_seconds: getDurationSeconds(session.startedAt, endedAt),
    default_weight_unit: session.defaultWeightUnit,
    recorded_set_count: summary.recordedSetCount,
    volume: summary.volume,
    exercises: session.exercises.map((exercise) => ({
      id: exercise.id,
      order_index: exercise.orderIndex,
      exercise_name_snapshot: exercise.exerciseNameSnapshot,
      equipment_name_snapshot: exercise.equipmentNameSnapshot,
      primary_muscle_group_name_snapshot:
        exercise.primaryMuscleGroupNameSnapshot,
      input_weight_unit: exercise.inputWeightUnit,
      exercise_type: exercise.exercise?.exerciseType ?? null,
      recorded_set_count: exercise.sets.length,
      sets: exercise.sets.map(toCompletedSetDetail),
    })),
  };
}

function toCompletedSetDetail(set: CompletedWorkoutSet) {
  return {
    id: set.id,
    row_index: set.rowIndex,
    set_number: set.setNumber,
    set_type: set.setType,
    weight: decimalToNumber(set.weightInputValue),
    weight_unit: set.weightInputUnit,
    reps: set.reps ?? 0,
    rpe: decimalToNumber(set.rpe),
    checked: set.checked,
    checked_at: set.checkedAt?.toISOString() ?? null,
  };
}

function summarizeCompletedWorkout(session: CompletedWorkoutSession) {
  const volume = session.exercises
    .flatMap((exercise) => exercise.sets)
    .reduce((total, set) => {
      if (!set.volumeValue || !set.volumeUnit) {
        return total;
      }

      return total.add(
        convertWeight(
          set.volumeValue,
          set.volumeUnit,
          session.defaultWeightUnit,
        ),
      );
    }, new Prisma.Decimal(0));

  return {
    recordedSetCount: session.exercises.reduce(
      (total, exercise) => total + exercise.sets.length,
      0,
    ),
    volume: {
      value: decimalToNumber(volume) ?? 0,
      unit: session.defaultWeightUnit,
    },
  };
}

function getDurationSeconds(startedAt: Date, endedAt: Date) {
  return Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));
}

function decimalToNumber(value: Prisma.Decimal | null) {
  if (!value) {
    return null;
  }

  return Number(value.toFixed(2));
}

function requireEndedAt(session: CompletedWorkoutSession) {
  if (!session.endedAt) {
    throw new Error("Completed workout is missing endedAt.");
  }

  return session.endedAt;
}
