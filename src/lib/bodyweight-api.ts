import { Prisma } from "@/generated/prisma/client";
import type { WeightUnit } from "@/generated/prisma/enums";
import type { BodyweightRecordGetPayload } from "@/generated/prisma/models/BodyweightRecord";
import { isUuid } from "@/lib/exercise-api";
import { formatWeightForDisplay, readWeightUnit } from "@/lib/weight-units";

export const bodyweightRecordSelect = {
  id: true,
  value: true,
  unit: true,
  measuredAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BodyweightRecordSelect;

type SelectedBodyweightRecord = BodyweightRecordGetPayload<{
  select: typeof bodyweightRecordSelect;
}>;

export type BodyweightRecordResponse = {
  id: string;
  weight: string;
  weight_unit: WeightUnit;
  display_weight: string;
  display_weight_unit: WeightUnit;
  measured_on: string;
  value: string;
  unit: WeightUnit;
  measured_at: string;
  created_at: string;
  updated_at: string;
};

export type BodyweightRecordMutationInput = {
  value: string;
  unit: WeightUnit;
  measuredAt: Date;
};

type ParseResult =
  | { ok: true; data: BodyweightRecordMutationInput }
  | { ok: false; message: string };

export function parseBodyweightRecordMutationBody(
  value: unknown,
  defaultWeightUnit: WeightUnit,
): ParseResult {
  if (!isRecord(value)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }

  const bodyweight = readBodyweightValue(value.value);
  if (!bodyweight.ok) {
    return bodyweight;
  }

  const unit = readBodyweightUnit(value.unit, defaultWeightUnit);
  if (!unit.ok) {
    return unit;
  }

  const measuredAt = readMeasuredAt(value.measured_at);
  if (!measuredAt.ok) {
    return measuredAt;
  }

  return {
    ok: true,
    data: {
      value: bodyweight.data,
      unit: unit.data,
      measuredAt: measuredAt.data,
    },
  };
}

export function toBodyweightRecordResponse(
  record: SelectedBodyweightRecord,
  displayWeightUnit: WeightUnit,
): BodyweightRecordResponse {
  const storedWeight = record.value.toFixed(2);
  const displayWeight = formatWeightForDisplay(
    record.value,
    record.unit,
    displayWeightUnit,
  );
  const measuredAt = record.measuredAt.toISOString();

  return {
    id: record.id,
    weight: storedWeight,
    weight_unit: record.unit,
    display_weight: displayWeight,
    display_weight_unit: displayWeightUnit,
    measured_on: measuredAt.slice(0, 10),
    value: storedWeight,
    unit: record.unit,
    measured_at: measuredAt,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
  };
}

export function isBodyweightRecordId(value: string) {
  return isUuid(value);
}

function readBodyweightValue(
  value: unknown,
): { ok: true; data: string } | { ok: false; message: string } {
  const rawValue =
    typeof value === "number"
      ? value.toString()
      : typeof value === "string"
        ? value.trim()
        : null;

  if (!rawValue) {
    return { ok: false, message: "value must be a positive number." };
  }

  if (!/^\d+(\.\d{1,2})?$/.test(rawValue)) {
    return {
      ok: false,
      message: "value must be a positive number with at most 2 decimals.",
    };
  }

  const numericValue = Number(rawValue);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return { ok: false, message: "value must be greater than 0." };
  }

  if (numericValue > 999999.99) {
    return { ok: false, message: "value must be less than 1000000." };
  }

  return { ok: true, data: rawValue };
}

function readBodyweightUnit(
  value: unknown,
  defaultWeightUnit: WeightUnit,
): { ok: true; data: WeightUnit } | { ok: false; message: string } {
  if (value === undefined || value === null) {
    return { ok: true, data: defaultWeightUnit };
  }

  const unit = readWeightUnit(value);

  if (unit) {
    return { ok: true, data: unit };
  }

  return { ok: false, message: 'unit must be "lbs" or "kg".' };
}

function readMeasuredAt(
  value: unknown,
): { ok: true; data: Date } | { ok: false; message: string } {
  if (typeof value !== "string") {
    return { ok: false, message: "measured_at must be an ISO date string." };
  }

  const measuredAt = new Date(value);

  if (Number.isNaN(measuredAt.getTime())) {
    return { ok: false, message: "measured_at must be a valid date." };
  }

  return { ok: true, data: measuredAt };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
