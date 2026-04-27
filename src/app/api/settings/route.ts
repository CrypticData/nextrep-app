import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readWeightUnit } from "@/lib/weight-units";
import type { WeightUnit } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

type SettingsResponse = {
  id: number;
  weight_unit: WeightUnit;
  default_weight_unit: WeightUnit;
};

function toSettingsResponse(settings: {
  id: number;
  defaultWeightUnit: WeightUnit;
}): SettingsResponse {
  return {
    id: settings.id,
    weight_unit: settings.defaultWeightUnit,
    default_weight_unit: settings.defaultWeightUnit,
  };
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function readSettingsPatchBody(value: unknown): WeightUnit | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const body = value as Record<string, unknown>;
  const rawUnit =
    "weight_unit" in body ? body.weight_unit : body.default_weight_unit;

  return readWeightUnit(rawUnit);
}

export async function GET() {
  const settings = await prisma.appSettings.findUniqueOrThrow({
    where: { id: 1 },
    select: {
      id: true,
      defaultWeightUnit: true,
    },
  });

  return NextResponse.json(toSettingsResponse(settings));
}

export async function PATCH(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const weightUnit = readSettingsPatchBody(body);

  if (!weightUnit) {
    return badRequest('weight_unit must be "lbs" or "kg".');
  }

  const settings = await prisma.appSettings.update({
    where: { id: 1 },
    data: { defaultWeightUnit: weightUnit },
    select: {
      id: true,
      defaultWeightUnit: true,
    },
  });

  return NextResponse.json(toSettingsResponse(settings));
}
