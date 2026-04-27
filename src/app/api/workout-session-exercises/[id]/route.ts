import { NextResponse } from "next/server";
import { isUuid } from "@/lib/exercise-api";
import {
  removeExerciseFromActiveWorkout,
  toWorkoutSessionExerciseResponse,
} from "@/lib/workout-exercise-api";

export const dynamic = "force-dynamic";

type WorkoutExerciseRouteContext = {
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

async function getWorkoutExerciseId(context: WorkoutExerciseRouteContext) {
  const { id } = await context.params;
  return id;
}

export async function DELETE(
  _request: Request,
  context: WorkoutExerciseRouteContext,
) {
  const workoutExerciseId = await getWorkoutExerciseId(context);

  if (!isUuid(workoutExerciseId)) {
    return badRequest("Workout exercise id must be a valid UUID.");
  }

  const result = await removeExerciseFromActiveWorkout(workoutExerciseId);

  if (result.kind === "workout_exercise_not_found") {
    return notFound();
  }

  return NextResponse.json(
    result.workoutExercises.map(toWorkoutSessionExerciseResponse),
  );
}
