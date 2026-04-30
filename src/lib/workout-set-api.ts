import { Prisma } from "@/generated/prisma/client";
import type {
  ExerciseType,
  WeightUnit,
  WorkoutSetType,
} from "@/generated/prisma/enums";
import {
  EXERCISE_TYPE_BEHAVIOR,
  hasWeightInput,
  storesInputWeightUnit,
  usesBodyweight,
} from "@/lib/exercise-type";
import { isUuid } from "@/lib/exercise-api";
import { prisma } from "@/lib/prisma";
import { convertWeight, readWeightUnit } from "@/lib/weight-units";
import { toWorkoutSetResponse, workoutSetSelect } from "@/lib/workout-exercise-api";

type WorkoutSetPatchInput = {
  weightInputValue?: string | null;
  weightInputUnit?: WeightUnit;
  reps?: number | null;
  rpe?: string | null;
  checked?: boolean;
  setType?: WorkoutSetType;
};

type ParseResult =
  | { ok: true; data: WorkoutSetPatchInput }
  | { ok: false; message: string };

const setTypes = new Set<string>([
  "normal",
  "warmup",
  "failure",
  "drop",
]);

export function parseWorkoutSetPatchBody(value: unknown): ParseResult {
  if (!isRecord(value)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }

  const input: WorkoutSetPatchInput = {};

  if (hasOwn(value, "weight") || hasOwn(value, "weight_input_value")) {
    const weightValue = hasOwn(value, "weight")
      ? value.weight
      : value.weight_input_value;
    const parsedWeight = readNullableDecimal(weightValue, "weight");

    if (!parsedWeight.ok) {
      return parsedWeight;
    }

    input.weightInputValue = parsedWeight.data;
  }

  if (hasOwn(value, "weight_unit") || hasOwn(value, "weight_input_unit")) {
    const weightUnitValue = hasOwn(value, "weight_unit")
      ? value.weight_unit
      : value.weight_input_unit;
    const weightUnit = readWeightUnit(weightUnitValue);

    if (!weightUnit) {
      return { ok: false, message: 'weight_unit must be "lbs" or "kg".' };
    }

    input.weightInputUnit = weightUnit;
  }

  if (hasOwn(value, "reps")) {
    const parsedReps = readNullableReps(value.reps);

    if (!parsedReps.ok) {
      return parsedReps;
    }

    input.reps = parsedReps.data;
  }

  if (hasOwn(value, "rpe")) {
    const parsedRpe = readNullableRpe(value.rpe);

    if (!parsedRpe.ok) {
      return parsedRpe;
    }

    input.rpe = parsedRpe.data;
  }

  if (hasOwn(value, "checked")) {
    if (typeof value.checked !== "boolean") {
      return { ok: false, message: "checked must be a boolean." };
    }

    input.checked = value.checked;
  }

  if (hasOwn(value, "set_type")) {
    if (typeof value.set_type !== "string" || !setTypes.has(value.set_type)) {
      return {
        ok: false,
        message: 'set_type must be "normal", "warmup", "failure", or "drop".',
      };
    }

    input.setType = value.set_type as WorkoutSetType;
  }

  return { ok: true, data: input };
}

export async function updateActiveWorkoutSet(
  workoutSetId: string,
  input: WorkoutSetPatchInput,
) {
  if (!isUuid(workoutSetId)) {
    return { kind: "invalid_id" as const };
  }

  return prisma.$transaction(async (tx) => {
    const existingSet = await tx.workoutSet.findUnique({
      where: { id: workoutSetId },
      select: {
        id: true,
        workoutSessionExerciseId: true,
        setType: true,
        reps: true,
        checked: true,
        checkedAt: true,
        weightInputValue: true,
        weightInputUnit: true,
        workoutSessionExercise: {
          select: {
            id: true,
            exerciseId: true,
            inputWeightUnit: true,
            workoutSession: {
              select: {
                status: true,
                defaultWeightUnit: true,
              },
            },
            exercise: {
              select: {
                exerciseType: true,
              },
            },
          },
        },
      },
    });

    if (
      !existingSet ||
      existingSet.workoutSessionExercise.workoutSession.status !== "active"
    ) {
      return { kind: "set_not_found" as const };
    }

    const exerciseType =
      existingSet.workoutSessionExercise.exercise?.exerciseType ??
      "weight_reps";
    const sessionWeightUnit =
      existingSet.workoutSessionExercise.workoutSession.defaultWeightUnit;
    const effectiveWeight = await resolveEffectiveWeight(
      tx,
      existingSet,
      input,
      exerciseType,
      sessionWeightUnit,
    );

    if (
      exerciseType === "assisted_bodyweight" &&
      effectiveWeight.normalizedValue &&
      effectiveWeight.bodyweightValue &&
      effectiveWeight.normalizedValue.gt(effectiveWeight.bodyweightValue)
    ) {
      return { kind: "assistance_exceeds_bodyweight" as const };
    }

    const siblingSets = await tx.workoutSet.findMany({
      where: {
        workoutSessionExerciseId: existingSet.workoutSessionExerciseId,
      },
      orderBy: { rowIndex: "asc" },
      select: {
        id: true,
        setType: true,
        rowIndex: true,
      },
    });
    const setTypesAfterUpdate = siblingSets.map((set) => ({
      id: set.id,
      setType: set.id === existingSet.id ? (input.setType ?? set.setType) : set.setType,
    }));
    const numbering = recalculateSetNumbering(setTypesAfterUpdate);

    if (!numbering.ok) {
      return { kind: "invalid_drop_set" as const };
    }

    if (
      storesInputWeightUnit(exerciseType) &&
      input.weightInputUnit &&
      existingSet.workoutSessionExercise.exerciseId
    ) {
      await tx.exerciseWeightUnitPreference.upsert({
        where: {
          exerciseId: existingSet.workoutSessionExercise.exerciseId,
        },
        create: {
          exerciseId: existingSet.workoutSessionExercise.exerciseId,
          weightUnit: input.weightInputUnit,
        },
        update: {
          weightUnit: input.weightInputUnit,
        },
        select: { id: true },
      });

      await tx.workoutSessionExercise.update({
        where: { id: existingSet.workoutSessionExerciseId },
        data: { inputWeightUnit: input.weightInputUnit },
        select: { id: true },
      });
    }

    for (const setNumbering of numbering.data) {
      const isTargetSet = setNumbering.id === existingSet.id;

      await tx.workoutSet.update({
          where: { id: setNumbering.id },
          data: {
            ...(isTargetSet ? buildSetUpdateData(existingSet, input, effectiveWeight) : {}),
            setNumber: setNumbering.setNumber,
            parentSetId: setNumbering.parentSetId,
          },
          select: { id: true },
        });
    }

    const sets = await tx.workoutSet.findMany({
      where: { workoutSessionExerciseId: existingSet.workoutSessionExerciseId },
      orderBy: { rowIndex: "asc" },
      select: workoutSetSelect,
    });

    return {
      kind: "ok" as const,
      sets,
      workoutSessionExerciseId: existingSet.workoutSessionExerciseId,
    };
  });
}

export async function addSetToActiveWorkoutExercise(
  workoutExerciseId: string,
) {
  if (!isUuid(workoutExerciseId)) {
    return { kind: "invalid_id" as const };
  }

  return prisma.$transaction(async (tx) => {
    const workoutExercise = await tx.workoutSessionExercise.findUnique({
      where: { id: workoutExerciseId },
      select: {
        id: true,
        workoutSession: {
          select: {
            status: true,
          },
        },
        sets: {
          orderBy: { rowIndex: "asc" },
          select: {
            id: true,
            rowIndex: true,
            setType: true,
          },
        },
      },
    });

    if (!workoutExercise || workoutExercise.workoutSession.status !== "active") {
      return { kind: "workout_exercise_not_found" as const };
    }

    const nextRowIndex =
      workoutExercise.sets.reduce(
        (maxRowIndex, set) => Math.max(maxRowIndex, set.rowIndex),
        0,
      ) + 1;
    const nextSetNumber =
      workoutExercise.sets.filter(
        (set) => set.setType === "normal" || set.setType === "failure",
      ).length + 1;

    const set = await tx.workoutSet.create({
      data: {
        workoutSessionExerciseId: workoutExercise.id,
        rowIndex: nextRowIndex,
        setNumber: nextSetNumber,
        setType: "normal",
      },
      select: workoutSetSelect,
    });

    return {
      kind: "ok" as const,
      set,
      workoutSessionExerciseId: workoutExercise.id,
    };
  });
}

export async function deleteActiveWorkoutSet(workoutSetId: string) {
  if (!isUuid(workoutSetId)) {
    return { kind: "invalid_id" as const };
  }

  return prisma.$transaction(async (tx) => {
    const existingSet = await tx.workoutSet.findUnique({
      where: { id: workoutSetId },
      select: {
        id: true,
        workoutSessionExerciseId: true,
        workoutSessionExercise: {
          select: {
            workoutSession: {
              select: {
                status: true,
              },
            },
          },
        },
      },
    });

    if (
      !existingSet ||
      existingSet.workoutSessionExercise.workoutSession.status !== "active"
    ) {
      return { kind: "set_not_found" as const };
    }

    const remainingSets = await tx.workoutSet.findMany({
      where: {
        workoutSessionExerciseId: existingSet.workoutSessionExerciseId,
        NOT: { id: existingSet.id },
      },
      orderBy: { rowIndex: "asc" },
      select: {
        id: true,
        rowIndex: true,
        setType: true,
      },
    });
    const numbering = recalculateSetNumbering(remainingSets);

    if (!numbering.ok) {
      return { kind: "invalid_drop_set" as const };
    }

    await tx.workoutSet.delete({
      where: { id: existingSet.id },
      select: { id: true },
    });

    const rowIndexOffset =
      remainingSets.reduce(
        (maxRowIndex, set) => Math.max(maxRowIndex, set.rowIndex),
        0,
      ) + 1;

    for (const set of remainingSets) {
      await tx.workoutSet.update({
        where: { id: set.id },
        data: { rowIndex: set.rowIndex + rowIndexOffset },
        select: { id: true },
      });
    }

    for (const [index, set] of remainingSets.entries()) {
      const setNumbering = numbering.data[index];

      await tx.workoutSet.update({
        where: { id: set.id },
        data: {
          rowIndex: index + 1,
          setNumber: setNumbering.setNumber,
          parentSetId: setNumbering.parentSetId,
        },
        select: { id: true },
      });
    }

    const sets = await tx.workoutSet.findMany({
      where: { workoutSessionExerciseId: existingSet.workoutSessionExerciseId },
      orderBy: { rowIndex: "asc" },
      select: workoutSetSelect,
    });

    return {
      kind: "ok" as const,
      sets,
      workoutSessionExerciseId: existingSet.workoutSessionExerciseId,
    };
  });
}

export async function reindexWorkoutExerciseSets(
  tx: Prisma.TransactionClient,
  workoutSessionExerciseId: string,
  options: { promoteOrphanedDrops?: boolean } = {},
) {
  const sets = await tx.workoutSet.findMany({
    where: { workoutSessionExerciseId },
    orderBy: { rowIndex: "asc" },
    select: {
      id: true,
      rowIndex: true,
      setType: true,
    },
  });
  const numbering = recalculateSetNumbering(sets, options);

  if (!numbering.ok) {
    return { ok: false as const };
  }

  const rowIndexOffset =
    sets.reduce((maxRowIndex, set) => Math.max(maxRowIndex, set.rowIndex), 0) +
    1;

  for (const set of sets) {
    await tx.workoutSet.update({
      where: { id: set.id },
      data: { rowIndex: set.rowIndex + rowIndexOffset },
      select: { id: true },
    });
  }

  for (const [index, set] of sets.entries()) {
    const setNumbering = numbering.data[index];

    await tx.workoutSet.update({
      where: { id: set.id },
      data: {
        rowIndex: index + 1,
        setNumber: setNumbering.setNumber,
        parentSetId: setNumbering.parentSetId,
        ...(setNumbering.setType ? { setType: setNumbering.setType } : {}),
      },
      select: { id: true },
    });
  }

  return { ok: true as const };
}

export { toWorkoutSetResponse };

type ExistingSet = {
  id: string;
  workoutSessionExerciseId: string;
  setType: WorkoutSetType;
  reps: number | null;
  checked: boolean;
  checkedAt: Date | null;
  weightInputValue: Prisma.Decimal | null;
  weightInputUnit: WeightUnit | null;
  workoutSessionExercise: {
    id: string;
    exerciseId: string | null;
    inputWeightUnit: WeightUnit | null;
    workoutSession: {
      status: "active" | "completed";
      defaultWeightUnit: WeightUnit;
    };
    exercise: {
      exerciseType: ExerciseType;
    } | null;
  };
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

function buildSetUpdateData(
  existingSet: ExistingSet,
  input: WorkoutSetPatchInput,
  weight: EffectiveWeight,
): Prisma.WorkoutSetUncheckedUpdateInput {
  const nextChecked = input.checked ?? existingSet.checked;
  const reps = input.reps === undefined ? existingSet.reps : input.reps;

  return {
    setType: input.setType ?? undefined,
    reps: input.reps === undefined ? undefined : input.reps,
    rpe: input.rpe === undefined ? undefined : input.rpe,
    checked: input.checked === undefined ? undefined : input.checked,
    checkedAt:
      input.checked === undefined
        ? undefined
        : nextChecked
          ? (existingSet.checkedAt ?? new Date())
          : null,
    weightInputValue: weight.inputValue,
    weightInputUnit: weight.inputUnit,
    weightNormalizedValue: weight.normalizedValue,
    weightNormalizedUnit: weight.normalizedUnit,
    bodyweightValue: weight.bodyweightValue,
    bodyweightUnit: weight.bodyweightUnit,
    volumeValue: reps && reps >= 1 ? weight.volumeValue : null,
    volumeUnit: reps && reps >= 1 ? weight.volumeUnit : null,
  };
}

async function resolveEffectiveWeight(
  tx: Prisma.TransactionClient,
  existingSet: ExistingSet,
  input: WorkoutSetPatchInput,
  exerciseType: ExerciseType,
  sessionWeightUnit: WeightUnit,
): Promise<EffectiveWeight> {
  if (!hasWeightInput(exerciseType) && usesBodyweight(exerciseType)) {
    return resolveBodyweightOnly(tx, existingSet, input, sessionWeightUnit);
  }

  const rawInputValue =
    input.weightInputValue !== undefined
      ? input.weightInputValue
      : existingSet.weightInputValue?.toFixed(2) ?? null;
  const inputUnit =
    input.weightInputUnit ??
    existingSet.weightInputUnit ??
    existingSet.workoutSessionExercise.inputWeightUnit ??
    sessionWeightUnit;
  const inputValue = rawInputValue ? new Prisma.Decimal(rawInputValue) : null;
  const normalizedValue = inputValue
    ? convertWeight(inputValue, inputUnit, sessionWeightUnit)
    : null;
  const reps = input.reps === undefined ? existingSet.reps : input.reps;

  if (exerciseType === "weight_reps") {
    return {
      inputValue,
      inputUnit: inputValue ? inputUnit : null,
      normalizedValue,
      normalizedUnit: normalizedValue ? sessionWeightUnit : null,
      bodyweightValue: null,
      bodyweightUnit: null,
      volumeValue:
        normalizedValue && reps && reps >= 1
          ? normalizedValue.mul(reps)
          : null,
      volumeUnit: normalizedValue && reps && reps >= 1 ? sessionWeightUnit : null,
    };
  }

  return resolveBodyweightWithOptionalLoad(tx, {
    inputValue,
    inputUnit,
    normalizedValue,
    sessionWeightUnit,
    reps,
    exerciseType,
  });
}

async function resolveBodyweightOnly(
  tx: Prisma.TransactionClient,
  existingSet: ExistingSet,
  input: WorkoutSetPatchInput,
  sessionWeightUnit: WeightUnit,
): Promise<EffectiveWeight> {
  const reps = input.reps === undefined ? existingSet.reps : input.reps;
  const bodyweight = await findLatestBodyweightInUnit(tx, sessionWeightUnit);

  return {
    inputValue: null,
    inputUnit: null,
    normalizedValue: null,
    normalizedUnit: null,
    bodyweightValue: bodyweight,
    bodyweightUnit: bodyweight ? sessionWeightUnit : null,
    volumeValue: bodyweight && reps && reps >= 1 ? bodyweight.mul(reps) : null,
    volumeUnit: bodyweight && reps && reps >= 1 ? sessionWeightUnit : null,
  };
}

async function resolveBodyweightWithOptionalLoad(
  tx: Prisma.TransactionClient,
  {
  inputValue,
  inputUnit,
  normalizedValue,
  sessionWeightUnit,
  reps,
  exerciseType,
}: {
  inputValue: Prisma.Decimal | null;
  inputUnit: WeightUnit;
  normalizedValue: Prisma.Decimal | null;
  sessionWeightUnit: WeightUnit;
  reps: number | null;
  exerciseType: ExerciseType;
},
): Promise<EffectiveWeight> {
  const bodyweight = await findLatestBodyweightInUnit(tx, sessionWeightUnit);
  const externalLoad = normalizedValue ?? new Prisma.Decimal(0);
  const volumeBase =
    bodyweight && EXERCISE_TYPE_BEHAVIOR[exerciseType].loadModifier === "add"
      ? bodyweight.add(externalLoad)
      : bodyweight &&
          EXERCISE_TYPE_BEHAVIOR[exerciseType].loadModifier === "subtract"
        ? bodyweight.sub(externalLoad)
        : null;

  return {
    inputValue,
    inputUnit: inputValue ? inputUnit : null,
    normalizedValue,
    normalizedUnit: normalizedValue ? sessionWeightUnit : null,
    bodyweightValue: bodyweight,
    bodyweightUnit: bodyweight ? sessionWeightUnit : null,
    volumeValue: volumeBase && reps && reps >= 1 ? volumeBase.mul(reps) : null,
    volumeUnit: volumeBase && reps && reps >= 1 ? sessionWeightUnit : null,
  };
}

async function findLatestBodyweightInUnit(
  tx: Prisma.TransactionClient,
  targetUnit: WeightUnit,
) {
  const latestBodyweight = await tx.bodyweightRecord.findFirst({
    orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }],
    select: {
      value: true,
      unit: true,
    },
  });

  if (!latestBodyweight) {
    return null;
  }

  return convertWeight(latestBodyweight.value, latestBodyweight.unit, targetUnit);
}

function recalculateSetNumbering(
  sets: Array<{ id: string; setType: WorkoutSetType }>,
  options: { promoteOrphanedDrops?: boolean } = {},
):
  | {
      ok: true;
      data: SetNumberingResult[];
    }
  | { ok: false } {
  let nextSetNumber = 1;
  let lastNumberedSetId: string | null = null;
  const data: SetNumberingResult[] = [];

  for (const set of sets) {
    if (set.setType === "warmup") {
      data.push({ id: set.id, setNumber: null, parentSetId: null });
      continue;
    }

    if (set.setType === "drop") {
      if (!lastNumberedSetId) {
        if (!options.promoteOrphanedDrops) {
          return { ok: false };
        }

        const setNumber = nextSetNumber;
        nextSetNumber += 1;
        lastNumberedSetId = set.id;
        data.push({
          id: set.id,
          setNumber,
          parentSetId: null,
          setType: "normal",
        });
        continue;
      }

      data.push({
        id: set.id,
        setNumber: null,
        parentSetId: lastNumberedSetId,
      });
      continue;
    }

    const setNumber = nextSetNumber;
    nextSetNumber += 1;
    lastNumberedSetId = set.id;
    data.push({ id: set.id, setNumber, parentSetId: null });
  }

  return { ok: true, data };
}

type SetNumberingResult = {
  id: string;
  setNumber: number | null;
  parentSetId: string | null;
  setType?: "normal";
};

function readNullableDecimal(
  value: unknown,
  fieldName: string,
): { ok: true; data: string | null } | { ok: false; message: string } {
  const rawValue =
    typeof value === "number"
      ? value.toString()
      : typeof value === "string"
        ? value.trim()
        : value === null
          ? ""
          : null;

  if (rawValue === "") {
    return { ok: true, data: null };
  }

  if (!rawValue || !/^\d+(\.\d{1,2})?$/.test(rawValue)) {
    return {
      ok: false,
      message: `${fieldName} must be a non-negative number with at most 2 decimals.`,
    };
  }

  const numericValue = Number(rawValue);

  if (!Number.isFinite(numericValue) || numericValue > 99999999.99) {
    return {
      ok: false,
      message: `${fieldName} must be less than 100000000.`,
    };
  }

  return { ok: true, data: rawValue };
}

function readNullableReps(
  value: unknown,
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
      message: "reps must be a non-negative whole number.",
    };
  }

  return { ok: true, data: value };
}

function readNullableRpe(
  value: unknown,
): { ok: true; data: string | null } | { ok: false; message: string } {
  const rawValue =
    typeof value === "number"
      ? value.toString()
      : typeof value === "string"
        ? value.trim()
        : value === null
          ? ""
          : null;

  if (rawValue === "") {
    return { ok: true, data: null };
  }

  if (!rawValue || !/^\d+(\.\d{1,2})?$/.test(rawValue)) {
    return { ok: false, message: "rpe must be between 1 and 10 in 0.5 steps." };
  }

  const numericValue = Number(rawValue);

  if (
    !Number.isFinite(numericValue) ||
    numericValue < 1 ||
    numericValue > 10 ||
    !Number.isInteger(numericValue * 2)
  ) {
    return { ok: false, message: "rpe must be between 1 and 10 in 0.5 steps." };
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
