import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SettingsResponse = {
  id: number;
  default_weight_unit: "lbs" | "kg";
};

function toSettingsResponse(settings: {
  id: number;
  defaultWeightUnit: "lbs" | "kg";
}): SettingsResponse {
  return {
    id: settings.id,
    default_weight_unit: settings.defaultWeightUnit,
  };
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function isSettingsPatchBody(
  value: unknown,
): value is { default_weight_unit: "lbs" | "kg" } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    ("default_weight_unit" in value &&
      (value.default_weight_unit === "lbs" ||
        value.default_weight_unit === "kg"))
  );
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

  if (!isSettingsPatchBody(body)) {
    return badRequest('default_weight_unit must be "lbs" or "kg".');
  }

  const settings = await prisma.appSettings.update({
    where: { id: 1 },
    data: { defaultWeightUnit: body.default_weight_unit },
    select: {
      id: true,
      defaultWeightUnit: true,
    },
  });

  return NextResponse.json(toSettingsResponse(settings));
}
