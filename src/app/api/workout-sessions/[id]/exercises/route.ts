import { NextResponse } from "next/server";
import { isUuid } from "@/lib/exercise-api";
import {
  addExerciseToActiveWorkoutSession,
  parseAddWorkoutExerciseBody,
  toWorkoutSessionExerciseResponse,
} from "@/lib/workout-exercise-api";

export const dynamic = "force-dynamic";

type WorkoutSessionExercisesRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

async function getWorkoutSessionId(
  context: WorkoutSessionExercisesRouteContext,
) {
  const { id } = await context.params;
  return id;
}

export async function POST(
  request: Request,
  context: WorkoutSessionExercisesRouteContext,
) {
  const workoutSessionId = await getWorkoutSessionId(context);

  if (!isUuid(workoutSessionId)) {
    return badRequest("Workout session id must be a valid UUID.");
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const exerciseId = parseAddWorkoutExerciseBody(body);

  if (!exerciseId) {
    return badRequest("exercise_id must be a valid UUID.");
  }

  const result = await addExerciseToActiveWorkoutSession(
    workoutSessionId,
    exerciseId,
  );

  if (result.kind === "workout_not_found") {
    return notFound("Active workout session not found.");
  }

  if (result.kind === "exercise_not_found") {
    return notFound("Exercise not found.");
  }

  return NextResponse.json(
    toWorkoutSessionExerciseResponse(result.workoutExercise),
    { status: 201 },
  );
}
