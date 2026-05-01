import { Prisma } from "@/generated/prisma/client";
import type {
  ExerciseType,
  WeightUnit,
  WorkoutSetType,
} from "@/generated/prisma/enums";
import { hasWeightInput } from "@/lib/exercise-type";
import { prisma } from "@/lib/prisma";
import { convertWeight } from "@/lib/weight-units";

export type PreviousValue = {
  weight: string | null;
  reps: number | null;
};

export type PreviousWorkoutSet = {
  id: string;
  rowIndex: number;
  setNumber: number | null;
  setType: WorkoutSetType;
  reps: number | null;
  weightInputValue: Prisma.Decimal | null;
  weightInputUnit: WeightUnit | null;
  weightNormalizedValue: Prisma.Decimal | null;
  weightNormalizedUnit: WeightUnit | null;
};

export type PreviousWorkoutExercise = {
  id: string;
  exerciseId: string | null;
  orderIndex: number;
  inputWeightUnit: WeightUnit | null;
  exercise: { exerciseType: ExerciseType } | null;
  sets: PreviousWorkoutSet[];
};

type PreviousWorkoutSession = {
  id: string;
  exercises: PreviousWorkoutExercise[];
};

type PreviousClient = Pick<Prisma.TransactionClient, "workoutSession">;

type DisplayedSetIdentity = string;

const previousWorkoutSessionSelect = {
  id: true,
  exercises: {
    orderBy: { orderIndex: "asc" },
    select: {
      id: true,
      exerciseId: true,
      orderIndex: true,
      inputWeightUnit: true,
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
          weightInputValue: true,
          weightInputUnit: true,
          weightNormalizedValue: true,
          weightNormalizedUnit: true,
        },
      },
    },
  },
} satisfies Prisma.WorkoutSessionSelect;

export async function computePreviousForSession({
  cutoffStartedAt,
  excludeSessionId,
  exercises,
  db = prisma,
}: {
  cutoffStartedAt?: Date;
  excludeSessionId?: string;
  exercises: PreviousWorkoutExercise[];
  db?: PreviousClient;
}) {
  const previousBySetId = new Map<string, PreviousValue | null>();
  const currentByExerciseId = groupCurrentExercises(exercises);

  for (const [exerciseId, currentExercises] of currentByExerciseId) {
    const historySessions = await loadCompletedSessionsNewestFirst({
      cutoffStartedAt,
      db,
      excludeSessionId,
      exerciseId,
    });
    const pending = new Map<string, PendingPrevious>();

    for (const currentExercise of currentExercises) {
      const occurrenceNumber = getOccurrenceNumber(exercises, currentExercise);
      const currentExerciseType = currentExercise.exercise?.exerciseType;

      if (!currentExerciseType) {
        for (const set of currentExercise.sets) {
          previousBySetId.set(set.id, null);
        }
        continue;
      }

      const identities = computeDisplayedSetIdentities(currentExercise.sets);

      for (const set of currentExercise.sets) {
        const identity = identities.get(set.id);

        if (!identity) {
          previousBySetId.set(set.id, null);
          continue;
        }

        pending.set(set.id, {
          currentExercise,
          currentExerciseType,
          identity,
          occurrenceNumber,
        });
      }
    }

    for (const historySession of historySessions) {
      if (pending.size === 0) {
        break;
      }

      resolvePendingFromHistorySession({
        historySession,
        pending,
        previousBySetId,
      });
    }

    for (const setId of pending.keys()) {
      previousBySetId.set(setId, null);
    }
  }

  for (const exercise of exercises) {
    if (exercise.exerciseId) {
      continue;
    }

    for (const set of exercise.sets) {
      previousBySetId.set(set.id, null);
    }
  }

  return previousBySetId;
}

export async function findTemplateSeedSetsForFirstOccurrence({
  db = prisma,
  exerciseId,
}: {
  db?: PreviousClient;
  exerciseId: string;
}): Promise<{ setType: WorkoutSetType }[]> {
  const historySessions = await loadCompletedSessionsNewestFirst({
    db,
    exerciseId,
  });

  for (const historySession of historySessions) {
    const firstOccurrence = historySession.exercises.filter(
      (exercise) => exercise.exerciseId === exerciseId,
    )[0];

    if (!firstOccurrence || firstOccurrence.sets.length === 0) {
      continue;
    }

    return firstOccurrence.sets.map((set) => ({ setType: set.setType }));
  }

  return [];
}

export function getOriginalSavedPreviousValue({
  exerciseType,
  set,
  targetWeightUnit,
}: {
  exerciseType: ExerciseType;
  set: PreviousWorkoutSet;
  targetWeightUnit: WeightUnit;
}) {
  return toPreviousValue({
    exerciseType,
    historicalSet: set,
    targetWeightUnit,
  });
}

export function computeDisplayedSetIdentities(sets: PreviousWorkoutSet[]) {
  const identities = new Map<string, DisplayedSetIdentity>();
  let warmupIndex = 1;
  let dropIndex = 1;

  for (const set of sets) {
    if (set.setType === "warmup") {
      identities.set(set.id, `warmup:${warmupIndex}`);
      warmupIndex += 1;
      continue;
    }

    if (set.setType === "drop") {
      identities.set(set.id, `drop:${dropIndex}`);
      dropIndex += 1;
      continue;
    }

    if (set.setNumber) {
      identities.set(set.id, `numbered:${set.setNumber}`);
    }
  }

  return identities;
}

function groupCurrentExercises(exercises: PreviousWorkoutExercise[]) {
  const grouped = new Map<string, PreviousWorkoutExercise[]>();

  for (const exercise of exercises) {
    if (!exercise.exerciseId) {
      continue;
    }

    grouped.set(exercise.exerciseId, [
      ...(grouped.get(exercise.exerciseId) ?? []),
      exercise,
    ]);
  }

  for (const [exerciseId, groupedExercises] of grouped) {
    grouped.set(
      exerciseId,
      [...groupedExercises].sort(
        (first, second) => first.orderIndex - second.orderIndex,
      ),
    );
  }

  return grouped;
}

function getOccurrenceNumber(
  exercises: PreviousWorkoutExercise[],
  targetExercise: PreviousWorkoutExercise,
) {
  return exercises
    .filter((exercise) => exercise.exerciseId === targetExercise.exerciseId)
    .sort((first, second) => first.orderIndex - second.orderIndex)
    .findIndex((exercise) => exercise.id === targetExercise.id) + 1;
}

async function loadCompletedSessionsNewestFirst({
  cutoffStartedAt,
  db,
  excludeSessionId,
  exerciseId,
}: {
  cutoffStartedAt?: Date;
  db: PreviousClient;
  excludeSessionId?: string;
  exerciseId: string;
}): Promise<PreviousWorkoutSession[]> {
  return db.workoutSession.findMany({
    where: {
      status: "completed",
      endedAt: { not: null },
      ...(cutoffStartedAt ? { startedAt: { lt: cutoffStartedAt } } : {}),
      ...(excludeSessionId ? { NOT: { id: excludeSessionId } } : {}),
      exercises: {
        some: {
          exerciseId,
          sets: {
            some: {
              reps: { gte: 1 },
            },
          },
        },
      },
    },
    orderBy: [{ endedAt: "desc" }, { createdAt: "desc" }],
    select: previousWorkoutSessionSelect,
  });
}

function resolvePendingFromHistorySession({
  historySession,
  pending,
  previousBySetId,
}: {
  historySession: PreviousWorkoutSession;
  pending: Map<string, PendingPrevious>;
  previousBySetId: Map<string, PreviousValue | null>;
}) {
  const historicalExercisesBySource = groupCurrentExercises(
    historySession.exercises,
  );

  for (const [setId, pendingPrevious] of [...pending.entries()]) {
    const historicalExercise = historicalExercisesBySource
      .get(pendingPrevious.currentExercise.exerciseId ?? "")
      ?.at(pendingPrevious.occurrenceNumber - 1);

    if (!historicalExercise) {
      continue;
    }

    const historicalIdentities = computeDisplayedSetIdentities(
      historicalExercise.sets,
    );
    const matchingHistoricalSet = historicalExercise.sets.find(
      (set) => historicalIdentities.get(set.id) === pendingPrevious.identity,
    );

    if (!matchingHistoricalSet) {
      continue;
    }

    previousBySetId.set(
      setId,
      toPreviousValue({
        exerciseType: pendingPrevious.currentExerciseType,
        historicalSet: matchingHistoricalSet,
        targetWeightUnit:
          pendingPrevious.currentExercise.inputWeightUnit ??
          matchingHistoricalSet.weightInputUnit ??
          matchingHistoricalSet.weightNormalizedUnit ??
          "lbs",
      }),
    );
    pending.delete(setId);
  }
}

function toPreviousValue({
  exerciseType,
  historicalSet,
  targetWeightUnit,
}: {
  exerciseType: ExerciseType;
  historicalSet: PreviousWorkoutSet;
  targetWeightUnit: WeightUnit;
}): PreviousValue | null {
  if (!historicalSet.reps || historicalSet.reps < 1) {
    return null;
  }

  if (!hasWeightInput(exerciseType)) {
    return {
      weight: null,
      reps: historicalSet.reps,
    };
  }

  const weight =
    historicalSet.weightInputValue && historicalSet.weightInputUnit
      ? convertWeight(
          historicalSet.weightInputValue,
          historicalSet.weightInputUnit,
          targetWeightUnit,
        )
      : historicalSet.weightNormalizedValue && historicalSet.weightNormalizedUnit
        ? convertWeight(
            historicalSet.weightNormalizedValue,
            historicalSet.weightNormalizedUnit,
            targetWeightUnit,
          )
        : new Prisma.Decimal(0);

  return {
    weight: formatWeightForDisplay(weight),
    reps: historicalSet.reps,
  };
}

function formatWeightForDisplay(weight: Prisma.Decimal) {
  return weight.toFixed(2).replace(/\.?0+$/, "");
}

type PendingPrevious = {
  currentExercise: PreviousWorkoutExercise;
  currentExerciseType: ExerciseType;
  identity: DisplayedSetIdentity;
  occurrenceNumber: number;
};
