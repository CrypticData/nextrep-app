import { NextResponse } from "next/server";
import { isUuid } from "@/lib/exercise-api";
import {
  findActiveWorkoutExerciseResponseContext,
  parseWorkoutExerciseWeightUnitBody,
  toWorkoutSessionExerciseResponseWithPrevious,
  updateWorkoutExerciseWeightUnit,
} from "@/lib/workout-exercise-api";

export const dynamic = "force-dynamic";

type WorkoutExerciseWeightUnitRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function notFound() {
  return NextResponse.json(
    { error: "Active workout exercise not found." },
    { status: 404 },
  );
}

async function getWorkoutExerciseId(
  context: WorkoutExerciseWeightUnitRouteContext,
) {
  const { id } = await context.params;
  return id;
}

export async function PATCH(
  request: Request,
  context: WorkoutExerciseWeightUnitRouteContext,
) {
  const workoutExerciseId = await getWorkoutExerciseId(context);

  if (!isUuid(workoutExerciseId)) {
    return badRequest("Workout exercise id must be a valid UUID.");
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const weightUnit = parseWorkoutExerciseWeightUnitBody(body);

  if (!weightUnit) {
    return badRequest('weight_unit must be "lbs" or "kg".');
  }

  const result = await updateWorkoutExerciseWeightUnit(
    workoutExerciseId,
    weightUnit,
  );

  if (result.kind === "workout_exercise_not_found") {
    return notFound();
  }

  if (result.kind === "unsupported_exercise_type") {
    return badRequest(
      "Exercise weight unit preference is only supported for weight_reps exercises.",
    );
  }

  const contextResult = await findActiveWorkoutExerciseResponseContext(
    result.workoutExercise.id,
  );

  if (contextResult.kind === "workout_exercise_not_found") {
    return notFound();
  }

  return NextResponse.json(
    await toWorkoutSessionExerciseResponseWithPrevious(
      contextResult.targetWorkoutExercise,
      contextResult.workoutExercises,
    ),
  );
}
