import { NextResponse } from "next/server";
import { isUuid } from "@/lib/exercise-api";
import {
  parseWorkoutExerciseOrderBody,
  reorderActiveWorkoutExercises,
  toWorkoutSessionExerciseResponse,
} from "@/lib/workout-exercise-api";

export const dynamic = "force-dynamic";

type ExerciseOrderRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function notFound() {
  return NextResponse.json(
    { error: "Active workout session not found." },
    { status: 404 },
  );
}

function conflict() {
  return NextResponse.json(
    { error: "Workout exercise order could not be saved." },
    { status: 409 },
  );
}

export async function PATCH(
  request: Request,
  context: ExerciseOrderRouteContext,
) {
  const { id } = await context.params;

  if (!isUuid(id)) {
    return badRequest("Workout session id must be a valid UUID.");
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = parseWorkoutExerciseOrderBody(body);

  if (!parsed.ok) {
    return badRequest(parsed.message);
  }

  const result = await reorderActiveWorkoutExercises(
    id,
    parsed.workoutExerciseIds,
  );

  if (
    result.kind === "workout_not_found" ||
    result.kind === "workout_exercise_set_mismatch"
  ) {
    return notFound();
  }

  if (result.kind === "order_conflict") {
    return conflict();
  }

  return NextResponse.json(
    result.workoutExercises.map(toWorkoutSessionExerciseResponse),
  );
}
