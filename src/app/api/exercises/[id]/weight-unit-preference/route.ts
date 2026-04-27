import { NextResponse } from "next/server";
import { isUuid } from "@/lib/exercise-api";
import {
  parseExerciseWeightUnitPreferenceBody,
  toExerciseWeightUnitPreferenceResponse,
  upsertExerciseWeightUnitPreference,
} from "@/lib/exercise-weight-unit-preference-api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type ExerciseWeightUnitPreferenceRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function notFound() {
  return NextResponse.json({ error: "Exercise not found." }, { status: 404 });
}

async function getExerciseId(
  context: ExerciseWeightUnitPreferenceRouteContext,
) {
  const { id } = await context.params;
  return id;
}

export async function GET(
  _request: Request,
  context: ExerciseWeightUnitPreferenceRouteContext,
) {
  const exerciseId = await getExerciseId(context);

  if (!isUuid(exerciseId)) {
    return badRequest("Exercise id must be a valid UUID.");
  }

  const exercise = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    select: {
      exerciseType: true,
      weightUnitPreference: {
        select: {
          exerciseId: true,
          weightUnit: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!exercise) {
    return notFound();
  }

  if (exercise.exerciseType !== "weight_reps") {
    return badRequest(
      "Exercise weight unit preference is only supported for weight_reps exercises.",
    );
  }

  return NextResponse.json(
    exercise.weightUnitPreference
      ? toExerciseWeightUnitPreferenceResponse(exercise.weightUnitPreference)
      : null,
  );
}

export async function PATCH(
  request: Request,
  context: ExerciseWeightUnitPreferenceRouteContext,
) {
  const exerciseId = await getExerciseId(context);

  if (!isUuid(exerciseId)) {
    return badRequest("Exercise id must be a valid UUID.");
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const weightUnit = parseExerciseWeightUnitPreferenceBody(body);

  if (!weightUnit) {
    return badRequest('weight_unit must be "lbs" or "kg".');
  }

  const result = await upsertExerciseWeightUnitPreference(
    exerciseId,
    weightUnit,
  );

  if (result.kind === "not_found") {
    return notFound();
  }

  if (result.kind === "unsupported_exercise_type") {
    return badRequest(
      "Exercise weight unit preference is only supported for weight_reps exercises.",
    );
  }

  return NextResponse.json(
    toExerciseWeightUnitPreferenceResponse(result.preference),
  );
}
