import { Prisma } from "@/generated/prisma/client";
import type {
  ExerciseType,
  WeightUnit,
  WorkoutSetType,
} from "@/generated/prisma/enums";
import type { CompletedWorkoutDetail } from "@/lib/completed-workout-api";
import { getCompletedWorkoutDetail } from "@/lib/completed-workout-api";
import {
  EXERCISE_TYPE_BEHAVIOR,
  hasWeightInput,
  storesInputWeightUnit,
  usesBodyweight,
} from "@/lib/exercise-type";
import { prisma } from "@/lib/prisma";
import {
  computePreviousForSession,
  type PreviousValue,
  type PreviousWorkoutExercise,
} from "@/lib/previous-quick-fill";
import { convertWeight } from "@/lib/weight-units";
import { MAX_WORKOUT_DURATION_SECONDS } from "@/lib/workout-duration";
import { isUuid } from "@/lib/workout-session-api";

type EditCompletedWorkoutPayload = {
  name: string;
  description: string | null;
  startedAt: Date;
  durationSeconds: number;
  exercises: EditWorkoutExerciseInput[];
};

type EditWorkoutExerciseInput = {
  id: string | null;
  exerciseId: string | null;
  notes: string | null;
  inputWeightUnit: WeightUnit | null;
  sets: EditWorkoutSetInput[];
};

type EditWorkoutSetInput = {
  id: string | null;
  setType: WorkoutSetType;
  weightInputValue: string | null;
  weightInputUnit: WeightUnit | null;
  reps: number | null;
  rpe: string | null;
  checked: boolean;
};

type PreviewCompletedWorkoutPreviousPayload = {
  exercises: PreviewWorkoutExerciseInput[];
};

type PreviewWorkoutExerciseInput = {
  clientId: string;
  id: string | null;
  exerciseId: string | null;
  inputWeightUnit: WeightUnit | null;
  sets: PreviewWorkoutSetInput[];
};

type PreviewWorkoutSetInput = {
  clientId: string;
  id: string | null;
  setType: WorkoutSetType;
};

type ExistingWorkoutExercise = {
  id: string;
  exerciseId: string | null;
  inputWeightUnit: WeightUnit | null;
  exerciseNameSnapshot: string;
  equipmentNameSnapshot: string | null;
  primaryMuscleGroupNameSnapshot: string | null;
  exercise: { exerciseType: ExerciseType } | null;
  sets: ExistingWorkoutSet[];
};

type ExistingWorkoutSet = {
  id: string;
  bodyweightValue: Prisma.Decimal | null;
  bodyweightUnit: WeightUnit | null;
  checkedAt: Date | null;
};

type SourceExercise = {
  id: string;
  name: string;
  exerciseType: ExerciseType;
  equipmentType: { name: string };
  primaryMuscleGroup: { name: string };
  weightUnitPreference: { weightUnit: WeightUnit } | null;
};

type EffectiveWeight = {
  inputValue: Prisma.Decimal | null;
  inputUnit: WeightUnit | null;
  normalizedValue: Prisma.Decimal | null;
  normalizedUnit: WeightUnit | null;
  bodyweightValue: Prisma.Decimal | null;
  bodyweightUnit: WeightUnit | null;
  volumeValue: Prisma.Decimal | null;
  volumeUnit: WeightUnit | null;
};

type PersistedSet = {
  id: string;
  setType: WorkoutSetType;
};

const workoutSetTypes = new Set<string>([
  "normal",
  "warmup",
  "failure",
  "drop",
]);

export function parseEditCompletedWorkoutBody(value: unknown):
  | { ok: true; data: EditCompletedWorkoutPayload }
  | { ok: false; message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }

  const name = readRequiredName(value.name);

  if (!name.ok) {
    return name;
  }

  const description = readNullableString(value.description, "description", 5000);

  if (!description.ok) {
    return description;
  }

  const startedAt = readStartedAt(value.started_at);

  if (!startedAt.ok) {
    return startedAt;
  }

  const durationSeconds = readDurationSeconds(value.duration_seconds);

  if (!durationSeconds.ok) {
    return durationSeconds;
  }

  if (!Array.isArray(value.exercises)) {
    return { ok: false, message: "exercises must be an array." };
  }

  const seenWorkoutExerciseIds = new Set<string>();
  const seenWorkoutSetIds = new Set<string>();
  const exercises: EditWorkoutExerciseInput[] = [];

  for (const [index, rawExercise] of value.exercises.entries()) {
    const parsedExercise = readWorkoutExercise(
      rawExercise,
      index,
      seenWorkoutExerciseIds,
      seenWorkoutSetIds,
    );

    if (!parsedExercise.ok) {
      return parsedExercise;
    }

    exercises.push(parsedExercise.data);
  }

  return {
    ok: true,
    data: {
      name: name.data,
      description: description.data,
      startedAt: startedAt.data,
      durationSeconds: durationSeconds.data,
      exercises,
    },
  };
}

export async function editCompletedWorkout(
  id: string,
  payload: EditCompletedWorkoutPayload,
): Promise<
  | { kind: "invalid_id" }
  | { kind: "not_found" }
  | { kind: "invalid_body"; message: string }
  | { kind: "invalid_weighted_sets"; invalidSetCount: number }
  | { kind: "no_recorded_sets" }
  | { kind: "assistance_exceeds_bodyweight" }
  | { kind: "ok"; workout: CompletedWorkoutDetail }
> {
  if (!isUuid(id)) {
    return { kind: "invalid_id" };
  }

  const transactionResult = await prisma.$transaction(async (tx) => {
    const session = await tx.workoutSession.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        defaultWeightUnit: true,
        exercises: {
          select: {
            id: true,
            exerciseId: true,
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
              select: {
                id: true,
                bodyweightValue: true,
                bodyweightUnit: true,
                checkedAt: true,
              },
            },
          },
        },
      },
    });

    if (!session || session.status !== "completed") {
      return { kind: "not_found" as const };
    }

    const invalidWeightedSetCount = payload.exercises.reduce(
      (count, exercise) =>
        count +
        exercise.sets.filter(
          (set) =>
            set.weightInputValue !== null &&
            new Prisma.Decimal(set.weightInputValue).gt(0) &&
            (set.reps === null || set.reps === 0),
        ).length,
      0,
    );

    if (invalidWeightedSetCount > 0) {
      return {
        kind: "invalid_weighted_sets" as const,
        invalidSetCount: invalidWeightedSetCount,
      };
    }

    const recordedSetCount = payload.exercises.reduce(
      (count, exercise) =>
        count +
        exercise.sets.filter((set) => set.reps !== null && set.reps >= 1)
          .length,
      0,
    );

    if (recordedSetCount === 0) {
      return { kind: "no_recorded_sets" as const };
    }

    const existingExercisesById = new Map(
      session.exercises.map((exercise) => [exercise.id, exercise]),
    );
    const existingSetById = new Map<string, ExistingWorkoutSet>();

    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        existingSetById.set(set.id, set);
      }
    }

    const newExerciseIds = payload.exercises
      .filter((exercise) => !exercise.id && exercise.exerciseId)
      .map((exercise) => exercise.exerciseId as string);
    const sourceExercises = await tx.exercise.findMany({
      where: {
        id: {
          in: Array.from(new Set(newExerciseIds)),
        },
      },
      select: {
        id: true,
        name: true,
        exerciseType: true,
        equipmentType: { select: { name: true } },
        primaryMuscleGroup: { select: { name: true } },
        weightUnitPreference: { select: { weightUnit: true } },
      },
    });
    const sourceExerciseById = new Map(
      sourceExercises.map((exercise) => [exercise.id, exercise]),
    );

    for (const exercise of payload.exercises) {
      if (exercise.id && !existingExercisesById.has(exercise.id)) {
        return {
          kind: "invalid_body" as const,
          message: "exercises contains an unknown workout exercise id.",
        };
      }

      if (!exercise.id && exercise.exerciseId && !sourceExerciseById.has(exercise.exerciseId)) {
        return {
          kind: "invalid_body" as const,
          message: "exercises contains an unknown exercise_id.",
        };
      }

      const existingExercise = exercise.id
        ? existingExercisesById.get(exercise.id)
        : null;
      const existingSetIds = new Set(
        existingExercise?.sets.map((set) => set.id) ?? [],
      );

      for (const set of exercise.sets) {
        if (set.id && !existingSetIds.has(set.id)) {
          return {
            kind: "invalid_body" as const,
            message: "sets contains an unknown workout set id.",
          };
        }
      }
    }

    await tx.workoutSessionExercise.updateMany({
      where: { workoutSessionId: id },
      data: {
        orderIndex: {
          increment: session.exercises.length + payload.exercises.length + 1,
        },
      },
    });

    const submittedExistingExerciseIds = new Set(
      payload.exercises
        .map((exercise) => exercise.id)
        .filter((exerciseId): exerciseId is string => Boolean(exerciseId)),
    );

    await tx.workoutSessionExercise.deleteMany({
      where: {
        workoutSessionId: id,
        id: {
          notIn: Array.from(submittedExistingExerciseIds),
        },
      },
    });

    for (const [exerciseIndex, exerciseInput] of payload.exercises.entries()) {
      const persistedExercise = await persistWorkoutExercise(tx, {
        exerciseInput,
        existingExercise: exerciseInput.id
          ? existingExercisesById.get(exerciseInput.id) ?? null
          : null,
        orderIndex: exerciseIndex,
        sessionDefaultWeightUnit: session.defaultWeightUnit,
        sourceExercise: exerciseInput.exerciseId
          ? sourceExerciseById.get(exerciseInput.exerciseId) ?? null
          : null,
        workoutSessionId: id,
      });

      if (persistedExercise.kind !== "ok") {
        return persistedExercise;
      }

      const setResult = await persistWorkoutSets(tx, {
        existingSetById,
        exerciseInput,
        exerciseType: persistedExercise.exerciseType,
        inputWeightUnit: persistedExercise.inputWeightUnit,
        sessionDefaultWeightUnit: session.defaultWeightUnit,
        workoutStartedAt: payload.startedAt,
        workoutSessionExerciseId: persistedExercise.id,
      });

      if (setResult.kind !== "ok") {
        return setResult;
      }
    }

    const endedAt = new Date(
      payload.startedAt.getTime() + payload.durationSeconds * 1000,
    );

    await tx.workoutSession.update({
      where: { id },
      data: {
        name: payload.name,
        description: payload.description,
        startedAt: payload.startedAt,
        endedAt,
        status: "completed",
      },
      select: { id: true },
    });

    return { kind: "ok" as const };
  });

  if (transactionResult.kind !== "ok") {
    return transactionResult;
  }

  const detail = await getCompletedWorkoutDetail(id);

  if (detail.kind !== "ok") {
    return { kind: "not_found" };
  }

  return { kind: "ok", workout: detail.workout };
}

export function parsePreviewCompletedWorkoutPreviousBody(value: unknown):
  | { ok: true; data: PreviewCompletedWorkoutPreviousPayload }
  | { ok: false; message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }

  if (!Array.isArray(value.exercises)) {
    return { ok: false, message: "exercises must be an array." };
  }

  const seenExerciseClientIds = new Set<string>();
  const seenWorkoutExerciseIds = new Set<string>();
  const seenSetClientIds = new Set<string>();
  const seenWorkoutSetIds = new Set<string>();
  const exercises: PreviewWorkoutExerciseInput[] = [];

  for (const [index, rawExercise] of value.exercises.entries()) {
    const parsedExercise = readPreviewWorkoutExercise(
      rawExercise,
      index,
      seenExerciseClientIds,
      seenWorkoutExerciseIds,
      seenSetClientIds,
      seenWorkoutSetIds,
    );

    if (!parsedExercise.ok) {
      return parsedExercise;
    }

    exercises.push(parsedExercise.data);
  }

  return { ok: true, data: { exercises } };
}

export async function previewCompletedWorkoutPrevious(
  id: string,
  payload: PreviewCompletedWorkoutPreviousPayload,
): Promise<
  | { kind: "invalid_id" }
  | { kind: "not_found" }
  | { kind: "invalid_body"; message: string }
  | {
      kind: "ok";
      sets: Array<{ client_id: string; previous: PreviousValue | null }>;
    }
> {
  if (!isUuid(id)) {
    return { kind: "invalid_id" };
  }

  const session = await prisma.workoutSession.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      startedAt: true,
      exercises: {
        select: {
          id: true,
          exerciseId: true,
          inputWeightUnit: true,
          exercise: {
            select: {
              exerciseType: true,
            },
          },
          sets: {
            select: {
              id: true,
            },
          },
        },
      },
    },
  });

  if (!session || session.status !== "completed") {
    return { kind: "not_found" };
  }

  const existingExercisesById = new Map(
    session.exercises.map((exercise) => [exercise.id, exercise]),
  );
  const newExerciseIds = payload.exercises
    .filter((exercise) => !exercise.id && exercise.exerciseId)
    .map((exercise) => exercise.exerciseId as string);
  const sourceExercises = await prisma.exercise.findMany({
    where: {
      id: {
        in: Array.from(new Set(newExerciseIds)),
      },
    },
    select: {
      id: true,
      exerciseType: true,
    },
  });
  const sourceExerciseById = new Map(
    sourceExercises.map((exercise) => [exercise.id, exercise]),
  );
  const draftExercises: PreviousWorkoutExercise[] = [];

  for (const [index, exerciseInput] of payload.exercises.entries()) {
    const existingExercise = exerciseInput.id
      ? existingExercisesById.get(exerciseInput.id)
      : null;

    if (exerciseInput.id && !existingExercise) {
      return {
        kind: "invalid_body",
        message: "exercises contains an unknown workout exercise id.",
      };
    }

    if (!exerciseInput.id && !exerciseInput.exerciseId) {
      return {
        kind: "invalid_body",
        message: "New exercises must include exercise_id.",
      };
    }

    const sourceExercise = exerciseInput.exerciseId
      ? sourceExerciseById.get(exerciseInput.exerciseId) ?? null
      : null;

    if (!exerciseInput.id && exerciseInput.exerciseId && !sourceExercise) {
      return {
        kind: "invalid_body",
        message: "exercises contains an unknown exercise_id.",
      };
    }

    const existingSetIds = new Set(
      existingExercise?.sets.map((set) => set.id) ?? [],
    );

    for (const setInput of exerciseInput.sets) {
      if (setInput.id && !existingSetIds.has(setInput.id)) {
        return {
          kind: "invalid_body",
          message: "sets contains an unknown workout set id.",
        };
      }
    }

    const exerciseType =
      existingExercise?.exercise?.exerciseType ??
      sourceExercise?.exerciseType ??
      null;
    const exerciseId =
      existingExercise?.exerciseId ?? exerciseInput.exerciseId ?? null;

    draftExercises.push({
      id: exerciseInput.clientId,
      exerciseId,
      orderIndex: index,
      inputWeightUnit:
        exerciseInput.inputWeightUnit ?? existingExercise?.inputWeightUnit ?? null,
      exercise: exerciseType ? { exerciseType } : null,
      sets: buildPreviewWorkoutSets(exerciseInput.sets),
    });
  }

  const previousBySetId = await computePreviousForSession({
    cutoffStartedAt: session.startedAt,
    excludeSessionId: id,
    exercises: draftExercises,
  });

  return {
    kind: "ok",
    sets: payload.exercises.flatMap((exercise) =>
      exercise.sets.map((set) => ({
        client_id: set.clientId,
        previous: previousBySetId.get(set.clientId) ?? null,
      })),
    ),
  };
}

async function persistWorkoutExercise(
  tx: Prisma.TransactionClient,
  {
    exerciseInput,
    existingExercise,
    orderIndex,
    sessionDefaultWeightUnit,
    sourceExercise,
    workoutSessionId,
  }: {
    exerciseInput: EditWorkoutExerciseInput;
    existingExercise: ExistingWorkoutExercise | null;
    orderIndex: number;
    sessionDefaultWeightUnit: WeightUnit;
    sourceExercise: SourceExercise | null;
    workoutSessionId: string;
  },
) {
  if (existingExercise) {
    const exerciseType =
      existingExercise.exercise?.exerciseType ?? "weight_reps";
    const inputWeightUnit = resolveExistingInputWeightUnit(
      exerciseType,
      exerciseInput.inputWeightUnit,
      existingExercise.inputWeightUnit,
    );

    await tx.workoutSessionExercise.update({
      where: { id: existingExercise.id },
      data: {
        orderIndex,
        notes: exerciseInput.notes,
        inputWeightUnit,
      },
      select: { id: true },
    });

    return {
      kind: "ok" as const,
      id: existingExercise.id,
      exerciseType,
      inputWeightUnit,
    };
  }

  if (!sourceExercise) {
    return {
      kind: "invalid_body" as const,
      message: "New exercises must include exercise_id.",
    };
  }

  const inputWeightUnit = resolveNewInputWeightUnit(
    sourceExercise,
    exerciseInput.inputWeightUnit,
    sessionDefaultWeightUnit,
  );
  const workoutExercise = await tx.workoutSessionExercise.create({
    data: {
      workoutSessionId,
      exerciseId: sourceExercise.id,
      orderIndex,
      notes: exerciseInput.notes,
      inputWeightUnit,
      exerciseNameSnapshot: sourceExercise.name,
      equipmentNameSnapshot: sourceExercise.equipmentType.name,
      primaryMuscleGroupNameSnapshot: sourceExercise.primaryMuscleGroup.name,
    },
    select: { id: true },
  });

  return {
    kind: "ok" as const,
    id: workoutExercise.id,
    exerciseType: sourceExercise.exerciseType,
    inputWeightUnit,
  };
}

async function persistWorkoutSets(
  tx: Prisma.TransactionClient,
  {
    existingSetById,
    exerciseInput,
    exerciseType,
    inputWeightUnit,
    sessionDefaultWeightUnit,
    workoutStartedAt,
    workoutSessionExerciseId,
  }: {
    existingSetById: Map<string, ExistingWorkoutSet>;
    exerciseInput: EditWorkoutExerciseInput;
    exerciseType: ExerciseType;
    inputWeightUnit: WeightUnit | null;
    sessionDefaultWeightUnit: WeightUnit;
    workoutStartedAt: Date;
    workoutSessionExerciseId: string;
  },
): Promise<
  | { kind: "ok" }
  | { kind: "invalid_body"; message: string }
  | { kind: "assistance_exceeds_bodyweight" }
> {
  await tx.workoutSet.updateMany({
    where: { workoutSessionExerciseId },
    data: {
      rowIndex: {
        increment: exerciseInput.sets.length + 1,
      },
    },
  });

  const retainedSetInputs = exerciseInput.sets.filter((set) => !isEmptySet(set));
  const submittedExistingSetIds = new Set(
    retainedSetInputs
      .map((set) => set.id)
      .filter((setId): setId is string => Boolean(setId)),
  );

  await tx.workoutSet.deleteMany({
    where: {
      workoutSessionExerciseId,
      id: {
        notIn: Array.from(submittedExistingSetIds),
      },
    },
  });

  const numberedSets = recalculateSetNumbering(retainedSetInputs);
  const persistedSets: PersistedSet[] = [];

  for (const [index, setInput] of retainedSetInputs.entries()) {
    const existingSet = setInput.id
      ? existingSetById.get(setInput.id) ?? null
      : null;
    const effectiveWeight = await resolveEffectiveWeight(tx, {
      exerciseType,
      existingSet,
      inputWeightUnit,
      sessionDefaultWeightUnit,
      setInput,
      workoutStartedAt,
    });

    if ("kind" in effectiveWeight) {
      return effectiveWeight;
    }

    const setNumbering = numberedSets[index];
    const setData = {
      rowIndex: index + 1,
      setNumber: setNumbering.setNumber,
      setType: setNumbering.setType,
      parentSetId: null,
      reps: setInput.reps,
      rpe: setInput.rpe,
      checked: setInput.checked,
      checkedAt: setInput.checked
        ? (existingSet ? existingSet.checkedAt ?? new Date() : new Date())
        : null,
      weightInputValue: effectiveWeight.data.inputValue,
      weightInputUnit: effectiveWeight.data.inputUnit,
      weightNormalizedValue: effectiveWeight.data.normalizedValue,
      weightNormalizedUnit: effectiveWeight.data.normalizedUnit,
      bodyweightValue: effectiveWeight.data.bodyweightValue,
      bodyweightUnit: effectiveWeight.data.bodyweightUnit,
      volumeValue: effectiveWeight.data.volumeValue,
      volumeUnit: effectiveWeight.data.volumeUnit,
    };

    if (setInput.id) {
      await tx.workoutSet.update({
        where: { id: setInput.id },
        data: setData,
        select: { id: true },
      });
      persistedSets.push({ id: setInput.id, setType: setNumbering.setType });
      continue;
    }

    const createdSet = await tx.workoutSet.create({
      data: {
        ...setData,
        workoutSessionExerciseId,
      },
      select: { id: true },
    });

    persistedSets.push({ id: createdSet.id, setType: setNumbering.setType });
  }

  const parentUpdates = recalculateSetNumbering(persistedSets);

  for (const [index, set] of persistedSets.entries()) {
    await tx.workoutSet.update({
      where: { id: set.id },
      data: {
        parentSetId: parentUpdates[index].parentSetId,
      },
      select: { id: true },
    });
  }

  return { kind: "ok" };
}

async function resolveEffectiveWeight(
  tx: Prisma.TransactionClient,
  {
    exerciseType,
    existingSet,
    inputWeightUnit,
    sessionDefaultWeightUnit,
    setInput,
    workoutStartedAt,
  }: {
    exerciseType: ExerciseType;
    existingSet: ExistingWorkoutSet | null;
    inputWeightUnit: WeightUnit | null;
    sessionDefaultWeightUnit: WeightUnit;
    setInput: EditWorkoutSetInput;
    workoutStartedAt: Date;
  },
): Promise<
  | { ok: true; data: EffectiveWeight }
  | { kind: "assistance_exceeds_bodyweight" }
> {
  const reps = setInput.reps;

  if (!hasWeightInput(exerciseType) && usesBodyweight(exerciseType)) {
    const bodyweight = await findWorkoutBodyweightInUnit(
      tx,
      existingSet,
      sessionDefaultWeightUnit,
      workoutStartedAt,
    );

    return {
      ok: true,
      data: {
        inputValue: null,
        inputUnit: null,
        normalizedValue: null,
        normalizedUnit: null,
        bodyweightValue: bodyweight,
        bodyweightUnit: bodyweight ? sessionDefaultWeightUnit : null,
        volumeValue: bodyweight && reps && reps >= 1 ? bodyweight.mul(reps) : null,
        volumeUnit: bodyweight && reps && reps >= 1 ? sessionDefaultWeightUnit : null,
      },
    };
  }

  const inputUnit =
    setInput.weightInputUnit ??
    inputWeightUnit ??
    sessionDefaultWeightUnit;
  const inputValue = setInput.weightInputValue
    ? new Prisma.Decimal(setInput.weightInputValue)
    : null;
  const normalizedValue = inputValue
    ? convertWeight(inputValue, inputUnit, sessionDefaultWeightUnit)
    : null;

  if (exerciseType === "weight_reps") {
    return {
      ok: true,
      data: {
        inputValue,
        inputUnit: inputValue ? inputUnit : null,
        normalizedValue,
        normalizedUnit: normalizedValue ? sessionDefaultWeightUnit : null,
        bodyweightValue: null,
        bodyweightUnit: null,
        volumeValue:
          normalizedValue && reps && reps >= 1
            ? normalizedValue.mul(reps)
            : null,
        volumeUnit:
          normalizedValue && reps && reps >= 1 ? sessionDefaultWeightUnit : null,
      },
    };
  }

  const bodyweight = await findWorkoutBodyweightInUnit(
    tx,
    existingSet,
    sessionDefaultWeightUnit,
    workoutStartedAt,
  );
  const externalLoad = normalizedValue ?? new Prisma.Decimal(0);

  if (
    exerciseType === "assisted_bodyweight" &&
    bodyweight &&
    externalLoad.gt(bodyweight)
  ) {
    return { kind: "assistance_exceeds_bodyweight" };
  }

  const volumeBase =
    bodyweight && EXERCISE_TYPE_BEHAVIOR[exerciseType].loadModifier === "add"
      ? bodyweight.add(externalLoad)
      : bodyweight &&
          EXERCISE_TYPE_BEHAVIOR[exerciseType].loadModifier === "subtract"
        ? bodyweight.sub(externalLoad)
        : null;

  return {
    ok: true,
    data: {
      inputValue,
      inputUnit: inputValue ? inputUnit : null,
      normalizedValue,
      normalizedUnit: normalizedValue ? sessionDefaultWeightUnit : null,
      bodyweightValue: bodyweight,
      bodyweightUnit: bodyweight ? sessionDefaultWeightUnit : null,
      volumeValue: volumeBase && reps && reps >= 1 ? volumeBase.mul(reps) : null,
      volumeUnit: volumeBase && reps && reps >= 1 ? sessionDefaultWeightUnit : null,
    },
  };
}

async function findWorkoutBodyweightInUnit(
  tx: Prisma.TransactionClient,
  existingSet: ExistingWorkoutSet | null,
  targetUnit: WeightUnit,
  workoutStartedAt: Date,
) {
  const workoutBodyweight = await tx.bodyweightRecord.findFirst({
    where: {
      measuredAt: { lte: workoutStartedAt },
    },
    orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }],
    select: {
      value: true,
      unit: true,
    },
  });

  if (workoutBodyweight) {
    return convertWeight(workoutBodyweight.value, workoutBodyweight.unit, targetUnit);
  }

  if (!existingSet?.bodyweightValue || !existingSet.bodyweightUnit) {
    return null;
  }

  return convertWeight(existingSet.bodyweightValue, existingSet.bodyweightUnit, targetUnit);
}

function recalculateSetNumbering(
  sets: Array<{ id?: string | null; setType: WorkoutSetType }>,
) {
  let nextSetNumber = 1;
  let lastNumberedIndex: number | null = null;

  return sets.map((set, index) => {
    if (set.setType === "warmup") {
      return {
        setType: set.setType,
        setNumber: null,
        parentSetId: null,
      };
    }

    if (set.setType === "drop") {
      if (lastNumberedIndex === null) {
        const setNumber = nextSetNumber;
        nextSetNumber += 1;
        lastNumberedIndex = index;

        return {
          setType: "normal" as const,
          setNumber,
          parentSetId: null,
        };
      }

      return {
        setType: set.setType,
        setNumber: null,
        parentSetId: sets[lastNumberedIndex].id ?? null,
      };
    }

    const setNumber = nextSetNumber;
    nextSetNumber += 1;
    lastNumberedIndex = index;

    return {
      setType: set.setType,
      setNumber,
      parentSetId: null,
    };
  });
}

function buildPreviewWorkoutSets(sets: PreviewWorkoutSetInput[]) {
  let nextSetNumber = 1;
  let lastNumberedClientId: string | null = null;

  return sets.map((set, index) => {
    const baseSet = {
      id: set.clientId,
      rowIndex: index + 1,
      reps: null,
      weightInputValue: null,
      weightInputUnit: null,
      weightNormalizedValue: null,
      weightNormalizedUnit: null,
    };

    if (set.setType === "warmup") {
      return {
        ...baseSet,
        setNumber: null,
        setType: "warmup" as const,
        parentSetId: null,
      };
    }

    if (set.setType === "drop") {
      if (!lastNumberedClientId) {
        const setNumber = nextSetNumber;
        nextSetNumber += 1;
        lastNumberedClientId = set.clientId;

        return {
          ...baseSet,
          setNumber,
          setType: "normal" as const,
          parentSetId: null,
        };
      }

      return {
        ...baseSet,
        setNumber: null,
        setType: "drop" as const,
        parentSetId: lastNumberedClientId,
      };
    }

    const setNumber = nextSetNumber;
    nextSetNumber += 1;
    lastNumberedClientId = set.clientId;

    return {
      ...baseSet,
      setNumber,
      setType: set.setType,
      parentSetId: null,
    };
  });
}

function isEmptySet(set: EditWorkoutSetInput) {
  const hasWeight =
    set.weightInputValue !== null &&
    new Prisma.Decimal(set.weightInputValue).gt(0);

  return !hasWeight && (set.reps === null || set.reps === 0);
}

function resolveExistingInputWeightUnit(
  exerciseType: ExerciseType,
  requestedUnit: WeightUnit | null,
  existingUnit: WeightUnit | null,
) {
  if (!storesInputWeightUnit(exerciseType)) {
    return null;
  }

  return requestedUnit ?? existingUnit;
}

function resolveNewInputWeightUnit(
  exercise: SourceExercise,
  requestedUnit: WeightUnit | null,
  defaultWeightUnit: WeightUnit,
) {
  if (!storesInputWeightUnit(exercise.exerciseType)) {
    return null;
  }

  return requestedUnit ?? exercise.weightUnitPreference?.weightUnit ?? defaultWeightUnit;
}

function readWorkoutExercise(
  value: unknown,
  index: number,
  seenWorkoutExerciseIds: Set<string>,
  seenWorkoutSetIds: Set<string>,
):
  | { ok: true; data: EditWorkoutExerciseInput }
  | { ok: false; message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: `exercises[${index}] must be an object.` };
  }

  const id = readOptionalUuid(value.id, `exercises[${index}].id`);

  if (!id.ok) {
    return id;
  }

  if (id.data && seenWorkoutExerciseIds.has(id.data)) {
    return {
      ok: false,
      message: "exercises contains duplicate workout exercise ids.",
    };
  }

  if (id.data) {
    seenWorkoutExerciseIds.add(id.data);
  }

  const exerciseId = readOptionalUuid(
    value.exercise_id,
    `exercises[${index}].exercise_id`,
  );

  if (!exerciseId.ok) {
    return exerciseId;
  }

  if (!id.data && !exerciseId.data) {
    return {
      ok: false,
      message: `exercises[${index}] must include id or exercise_id.`,
    };
  }

  const notes = readNullableString(value.notes, `exercises[${index}].notes`, 2000);

  if (!notes.ok) {
    return notes;
  }

  const inputWeightUnit = readNullableWeightUnit(
    value.input_weight_unit,
    `exercises[${index}].input_weight_unit`,
  );

  if (!inputWeightUnit.ok) {
    return inputWeightUnit;
  }

  if (!Array.isArray(value.sets)) {
    return { ok: false, message: `exercises[${index}].sets must be an array.` };
  }

  const sets: EditWorkoutSetInput[] = [];

  for (const [setIndex, rawSet] of value.sets.entries()) {
    const set = readWorkoutSet(
      rawSet,
      `exercises[${index}].sets[${setIndex}]`,
      seenWorkoutSetIds,
    );

    if (!set.ok) {
      return set;
    }

    sets.push(set.data);
  }

  return {
    ok: true,
    data: {
      id: id.data,
      exerciseId: exerciseId.data,
      notes: notes.data,
      inputWeightUnit: inputWeightUnit.data,
      sets,
    },
  };
}

function readPreviewWorkoutExercise(
  value: unknown,
  index: number,
  seenExerciseClientIds: Set<string>,
  seenWorkoutExerciseIds: Set<string>,
  seenSetClientIds: Set<string>,
  seenWorkoutSetIds: Set<string>,
):
  | { ok: true; data: PreviewWorkoutExerciseInput }
  | { ok: false; message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: `exercises[${index}] must be an object.` };
  }

  const clientId = readClientId(value.client_id, `exercises[${index}].client_id`);

  if (!clientId.ok) {
    return clientId;
  }

  if (seenExerciseClientIds.has(clientId.data)) {
    return { ok: false, message: "exercises contains duplicate client_id values." };
  }

  seenExerciseClientIds.add(clientId.data);

  const id = readOptionalUuid(value.id, `exercises[${index}].id`);

  if (!id.ok) {
    return id;
  }

  if (id.data && seenWorkoutExerciseIds.has(id.data)) {
    return {
      ok: false,
      message: "exercises contains duplicate workout exercise ids.",
    };
  }

  if (id.data) {
    seenWorkoutExerciseIds.add(id.data);
  }

  const exerciseId = readOptionalUuid(
    value.exercise_id,
    `exercises[${index}].exercise_id`,
  );

  if (!exerciseId.ok) {
    return exerciseId;
  }

  const inputWeightUnit = readNullableWeightUnit(
    value.input_weight_unit,
    `exercises[${index}].input_weight_unit`,
  );

  if (!inputWeightUnit.ok) {
    return inputWeightUnit;
  }

  if (!Array.isArray(value.sets)) {
    return { ok: false, message: `exercises[${index}].sets must be an array.` };
  }

  const sets: PreviewWorkoutSetInput[] = [];

  for (const [setIndex, rawSet] of value.sets.entries()) {
    const set = readPreviewWorkoutSet(
      rawSet,
      `exercises[${index}].sets[${setIndex}]`,
      seenSetClientIds,
      seenWorkoutSetIds,
    );

    if (!set.ok) {
      return set;
    }

    sets.push(set.data);
  }

  return {
    ok: true,
    data: {
      clientId: clientId.data,
      id: id.data,
      exerciseId: exerciseId.data,
      inputWeightUnit: inputWeightUnit.data,
      sets,
    },
  };
}

function readWorkoutSet(
  value: unknown,
  path: string,
  seenWorkoutSetIds: Set<string>,
):
  | { ok: true; data: EditWorkoutSetInput }
  | { ok: false; message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: `${path} must be an object.` };
  }

  const id = readOptionalUuid(value.id, `${path}.id`);

  if (!id.ok) {
    return id;
  }

  if (id.data && seenWorkoutSetIds.has(id.data)) {
    return { ok: false, message: "sets contains duplicate ids." };
  }

  if (id.data) {
    seenWorkoutSetIds.add(id.data);
  }

  const setType = readSetType(value.set_type, `${path}.set_type`);

  if (!setType.ok) {
    return setType;
  }

  const rawWeight = hasOwn(value, "weight")
    ? value.weight
    : value.weight_input_value;
  const weight = readNullableDecimal(rawWeight, `${path}.weight`);

  if (!weight.ok) {
    return weight;
  }

  const rawWeightUnit = hasOwn(value, "weight_unit")
    ? value.weight_unit
    : value.weight_input_unit;
  const weightUnit = readNullableWeightUnit(rawWeightUnit, `${path}.weight_unit`);

  if (!weightUnit.ok) {
    return weightUnit;
  }

  const reps = readNullableReps(value.reps, `${path}.reps`);

  if (!reps.ok) {
    return reps;
  }

  const rpe = readNullableRpe(value.rpe, `${path}.rpe`);

  if (!rpe.ok) {
    return rpe;
  }

  if (typeof value.checked !== "boolean") {
    return { ok: false, message: `${path}.checked must be a boolean.` };
  }

  return {
    ok: true,
    data: {
      id: id.data,
      setType: setType.data,
      weightInputValue: weight.data,
      weightInputUnit: weightUnit.data,
      reps: reps.data,
      rpe: rpe.data,
      checked: value.checked,
    },
  };
}

function readPreviewWorkoutSet(
  value: unknown,
  path: string,
  seenSetClientIds: Set<string>,
  seenWorkoutSetIds: Set<string>,
):
  | { ok: true; data: PreviewWorkoutSetInput }
  | { ok: false; message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: `${path} must be an object.` };
  }

  const clientId = readClientId(value.client_id, `${path}.client_id`);

  if (!clientId.ok) {
    return clientId;
  }

  if (seenSetClientIds.has(clientId.data)) {
    return { ok: false, message: "sets contains duplicate client_id values." };
  }

  seenSetClientIds.add(clientId.data);

  const id = readOptionalUuid(value.id, `${path}.id`);

  if (!id.ok) {
    return id;
  }

  if (id.data && seenWorkoutSetIds.has(id.data)) {
    return { ok: false, message: "sets contains duplicate ids." };
  }

  if (id.data) {
    seenWorkoutSetIds.add(id.data);
  }

  const setType = readSetType(value.set_type, `${path}.set_type`);

  if (!setType.ok) {
    return setType;
  }

  return {
    ok: true,
    data: {
      clientId: clientId.data,
      id: id.data,
      setType: setType.data,
    },
  };
}

function readRequiredName(
  value: unknown,
): { ok: true; data: string } | { ok: false; message: string } {
  if (typeof value !== "string") {
    return { ok: false, message: "name is required." };
  }

  const name = value.trim();

  if (name.length < 1 || name.length > 120) {
    return { ok: false, message: "name must be 1-120 characters." };
  }

  return { ok: true, data: name };
}

function readNullableString(
  value: unknown,
  field: string,
  maxLength: number,
): { ok: true; data: string | null } | { ok: false; message: string } {
  if (value === null || value === undefined) {
    return { ok: true, data: null };
  }

  if (typeof value !== "string") {
    return { ok: false, message: `${field} must be a string or null.` };
  }

  const trimmed = value.trim();

  if (trimmed.length > maxLength) {
    return {
      ok: false,
      message: `${field} must be ${maxLength} characters or fewer.`,
    };
  }

  return { ok: true, data: trimmed || null };
}

function readClientId(
  value: unknown,
  field: string,
): { ok: true; data: string } | { ok: false; message: string } {
  if (typeof value !== "string") {
    return { ok: false, message: `${field} must be a string.` };
  }

  const trimmed = value.trim();

  if (trimmed.length < 1 || trimmed.length > 120) {
    return { ok: false, message: `${field} must be 1-120 characters.` };
  }

  return { ok: true, data: trimmed };
}

function readStartedAt(
  value: unknown,
): { ok: true; data: Date } | { ok: false; message: string } {
  if (typeof value !== "string") {
    return { ok: false, message: "started_at must be an ISO8601 string." };
  }

  const startedAtMs = Date.parse(value);

  if (Number.isNaN(startedAtMs)) {
    return { ok: false, message: "started_at must be a valid ISO8601 string." };
  }

  const nowMs = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  if (startedAtMs > nowMs + 60 * 1000) {
    return { ok: false, message: "started_at cannot be in the future." };
  }

  if (startedAtMs < nowMs - thirtyDaysMs) {
    return {
      ok: false,
      message: "started_at cannot be more than 30 days in the past.",
    };
  }

  return { ok: true, data: new Date(startedAtMs) };
}

function readDurationSeconds(
  value: unknown,
): { ok: true; data: number } | { ok: false; message: string } {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_WORKOUT_DURATION_SECONDS ||
    !Number.isSafeInteger(value)
  ) {
    return {
      ok: false,
      message: "duration_seconds must be between 0 and 17940.",
    };
  }

  return { ok: true, data: value };
}

function readOptionalUuid(
  value: unknown,
  field: string,
): { ok: true; data: string | null } | { ok: false; message: string } {
  if (value === null || value === undefined || value === "") {
    return { ok: true, data: null };
  }

  if (typeof value !== "string" || !isUuid(value)) {
    return { ok: false, message: `${field} must be a valid UUID.` };
  }

  return { ok: true, data: value };
}

function readNullableWeightUnit(
  value: unknown,
  field: string,
): { ok: true; data: WeightUnit | null } | { ok: false; message: string } {
  if (value === null || value === undefined || value === "") {
    return { ok: true, data: null };
  }

  if (value === "lbs" || value === "kg") {
    return { ok: true, data: value };
  }

  return { ok: false, message: `${field} must be "lbs", "kg", or null.` };
}

function readSetType(
  value: unknown,
  field: string,
): { ok: true; data: WorkoutSetType } | { ok: false; message: string } {
  if (typeof value === "string" && workoutSetTypes.has(value)) {
    return { ok: true, data: value as WorkoutSetType };
  }

  return {
    ok: false,
    message: `${field} must be "normal", "warmup", "failure", or "drop".`,
  };
}

function readNullableDecimal(
  value: unknown,
  field: string,
): { ok: true; data: string | null } | { ok: false; message: string } {
  const rawValue =
    typeof value === "number"
      ? value.toString()
      : typeof value === "string"
        ? value.trim()
        : value === null || value === undefined
          ? ""
          : null;

  if (rawValue === "") {
    return { ok: true, data: null };
  }

  if (!rawValue || !/^\d+(\.\d{1,2})?$/.test(rawValue)) {
    return {
      ok: false,
      message: `${field} must be a non-negative number with at most 2 decimals.`,
    };
  }

  const numericValue = Number(rawValue);

  if (!Number.isFinite(numericValue) || numericValue > 99999999.99) {
    return {
      ok: false,
      message: `${field} must be less than 100000000.`,
    };
  }

  return { ok: true, data: rawValue };
}

function readNullableReps(
  value: unknown,
  field: string,
): { ok: true; data: number | null } | { ok: false; message: string } {
  if (value === null || value === "") {
    return { ok: true, data: null };
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 9999
  ) {
    return {
      ok: false,
      message: `${field} must be a non-negative whole number.`,
    };
  }

  return { ok: true, data: value };
}

function readNullableRpe(
  value: unknown,
  field: string,
): { ok: true; data: string | null } | { ok: false; message: string } {
  const rawValue =
    typeof value === "number"
      ? value.toString()
      : typeof value === "string"
        ? value.trim()
        : value === null || value === undefined
          ? ""
          : null;

  if (rawValue === "") {
    return { ok: true, data: null };
  }

  if (!rawValue || !/^\d+(\.\d{1,2})?$/.test(rawValue)) {
    return { ok: false, message: `${field} must be between 1 and 10 in 0.5 steps.` };
  }

  const numericValue = Number(rawValue);

  if (
    !Number.isFinite(numericValue) ||
    numericValue < 1 ||
    numericValue > 10 ||
    !Number.isInteger(numericValue * 2)
  ) {
    return { ok: false, message: `${field} must be between 1 and 10 in 0.5 steps.` };
  }

  return { ok: true, data: numericValue.toFixed(1) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn<T extends object, K extends PropertyKey>(
  value: T,
  key: K,
): value is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key);
}
