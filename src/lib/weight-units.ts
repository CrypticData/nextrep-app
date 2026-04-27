import { Prisma } from "@/generated/prisma/client";
import type { WeightUnit } from "@/generated/prisma/enums";

const LBS_PER_KG = new Prisma.Decimal("2.2046226218");

export function convertWeight(
  value: Prisma.Decimal | string | number,
  fromUnit: WeightUnit,
  toUnit: WeightUnit,
) {
  const decimalValue = new Prisma.Decimal(value);

  if (fromUnit === toUnit) {
    return decimalValue;
  }

  if (fromUnit === "kg" && toUnit === "lbs") {
    return decimalValue.mul(LBS_PER_KG);
  }

  return decimalValue.div(LBS_PER_KG);
}

export function formatWeightForDisplay(
  value: Prisma.Decimal | string | number,
  fromUnit: WeightUnit,
  toUnit: WeightUnit,
) {
  return convertWeight(value, fromUnit, toUnit).toFixed(2);
}

export function isWeightUnit(value: unknown): value is WeightUnit {
  return value === "lbs" || value === "kg";
}

export function readWeightUnit(value: unknown) {
  if (value === "lb") {
    return "lbs";
  }

  if (isWeightUnit(value)) {
    return value;
  }

  return null;
}
