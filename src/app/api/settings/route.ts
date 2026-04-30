import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readWeightUnit } from "@/lib/weight-units";
import type { WeightUnit } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

type SettingsResponse = {
  id: number;
  weight_unit: WeightUnit;
  default_weight_unit: WeightUnit;
  silence_success_toasts: boolean;
  sound_enabled: boolean;
};

function toSettingsResponse(settings: {
  id: number;
  defaultWeightUnit: WeightUnit;
  silenceSuccessToasts: boolean;
  soundEnabled: boolean;
}): SettingsResponse {
  return {
    id: settings.id,
    weight_unit: settings.defaultWeightUnit,
    default_weight_unit: settings.defaultWeightUnit,
    silence_success_toasts: settings.silenceSuccessToasts,
    sound_enabled: settings.soundEnabled,
  };
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

type SettingsPatch = {
  silenceSuccessToasts?: boolean;
  soundEnabled?: boolean;
  weightUnit?: WeightUnit;
};

function readSettingsPatchBody(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false as const, message: "Request body must be an object." };
  }

  const body = value as Record<string, unknown>;
  const patch: SettingsPatch = {};

  if ("weight_unit" in body || "default_weight_unit" in body) {
    const rawUnit =
      "weight_unit" in body ? body.weight_unit : body.default_weight_unit;
    const weightUnit = readWeightUnit(rawUnit);

    if (!weightUnit) {
      return {
        ok: false as const,
        message: 'weight_unit must be "lbs" or "kg".',
      };
    }

    patch.weightUnit = weightUnit;
  }

  if ("silence_success_toasts" in body) {
    if (typeof body.silence_success_toasts !== "boolean") {
      return {
        ok: false as const,
        message: "silence_success_toasts must be a boolean.",
      };
    }

    patch.silenceSuccessToasts = body.silence_success_toasts;
  }

  if ("sound_enabled" in body) {
    if (typeof body.sound_enabled !== "boolean") {
      return {
        ok: false as const,
        message: "sound_enabled must be a boolean.",
      };
    }

    patch.soundEnabled = body.sound_enabled;
  }

  if (
    patch.weightUnit === undefined &&
    patch.silenceSuccessToasts === undefined &&
    patch.soundEnabled === undefined
  ) {
    return {
      ok: false as const,
      message:
        'Request body must include "weight_unit", "silence_success_toasts", or "sound_enabled".',
    };
  }

  return { ok: true as const, patch };
}

export async function GET() {
  const settings = await prisma.appSettings.findUniqueOrThrow({
    where: { id: 1 },
    select: {
      id: true,
      defaultWeightUnit: true,
      silenceSuccessToasts: true,
      soundEnabled: true,
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

  const parsedBody = readSettingsPatchBody(body);

  if (!parsedBody.ok) {
    return badRequest(parsedBody.message);
  }

  const settings = await prisma.appSettings.update({
    where: { id: 1 },
    data: {
      ...(parsedBody.patch.weightUnit
        ? { defaultWeightUnit: parsedBody.patch.weightUnit }
        : {}),
      ...(parsedBody.patch.silenceSuccessToasts !== undefined
        ? { silenceSuccessToasts: parsedBody.patch.silenceSuccessToasts }
        : {}),
      ...(parsedBody.patch.soundEnabled !== undefined
        ? { soundEnabled: parsedBody.patch.soundEnabled }
        : {}),
    },
    select: {
      id: true,
      defaultWeightUnit: true,
      silenceSuccessToasts: true,
      soundEnabled: true,
    },
  });

  return NextResponse.json(toSettingsResponse(settings));
}
