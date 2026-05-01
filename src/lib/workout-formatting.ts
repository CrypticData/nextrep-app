import type { ExerciseType, WeightUnit } from "@/generated/prisma/enums";
import { hasWeightInput } from "@/lib/exercise-type";
import {
  MAX_WORKOUT_DURATION_SECONDS,
  durationInputsToSeconds,
} from "@/lib/workout-duration";

export const LBS_PER_KG = 2.2046226218;

export type PreviousValue = {
  weight: string | null;
  reps: number | null;
};

export function formatDecimal(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return value;
  }

  return Number.isInteger(parsed) ? parsed.toString() : parsed.toFixed(2);
}

export function formatVolumeSummary(value: number, unit: WeightUnit) {
  if (value <= 0) {
    return `0 ${unit}`;
  }

  return `${formatDecimal(value.toFixed(2))} ${unit}`;
}

export function formatPreviousValue(
  previous: PreviousValue | null,
  exerciseType: ExerciseType,
) {
  if (!previous?.reps) {
    return "-";
  }

  if (!hasWeightInput(exerciseType)) {
    return previous.reps.toString();
  }

  return `${previous.weight ?? "0.00"} x ${previous.reps}`;
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function parseNonNegativeInteger(value: string) {
  const trimmedValue = value.trim();

  if (!/^\d+$/.test(trimmedValue)) {
    return null;
  }

  const parsedValue = Number(trimmedValue);

  return Number.isSafeInteger(parsedValue) ? parsedValue : null;
}

export function parseSignedInteger(value: string) {
  const trimmedValue = value.trim();

  if (!/^-?\d+$/.test(trimmedValue)) {
    return null;
  }

  const parsedValue = Number(trimmedValue);

  return Number.isSafeInteger(parsedValue) ? parsedValue : null;
}

export function getDurationSecondsFromInputs(
  hours: string,
  minutes: string,
  secondsAdjustment: string,
) {
  const parsedHours = parseNonNegativeInteger(hours);
  const parsedMinutes = parseNonNegativeInteger(minutes);
  const parsedSecondsAdjustment = parseSignedInteger(secondsAdjustment);

  if (
    parsedHours === null ||
    parsedMinutes === null ||
    parsedSecondsAdjustment === null ||
    parsedHours > Math.floor(MAX_WORKOUT_DURATION_SECONDS / 3600) ||
    parsedMinutes > 59
  ) {
    return null;
  }

  return durationInputsToSeconds(
    parsedHours,
    parsedMinutes,
    parsedSecondsAdjustment,
  );
}

export function toLocalDateTimeInputValue(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getFullYear().toString().padStart(4, "0"),
    "-",
    (date.getMonth() + 1).toString().padStart(2, "0"),
    "-",
    date.getDate().toString().padStart(2, "0"),
    "T",
    date.getHours().toString().padStart(2, "0"),
    ":",
    date.getMinutes().toString().padStart(2, "0"),
  ].join("");
}

export function readLocalDateTimeInput(value: string) {
  const parsedTime = new Date(value).getTime();

  return Number.isNaN(parsedTime) ? null : new Date(parsedTime);
}

export function normalizeNullableText(value: string) {
  const trimmedValue = value.trim();

  return trimmedValue.length === 0 ? null : trimmedValue;
}

export function convertWeightValue(
  value: number,
  fromUnit: WeightUnit,
  toUnit: WeightUnit,
) {
  if (fromUnit === toUnit) {
    return value;
  }

  return fromUnit === "kg" ? value * LBS_PER_KG : value / LBS_PER_KG;
}
