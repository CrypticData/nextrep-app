import { NextResponse } from "next/server";
import {
  addSetToActiveWorkoutExercise,
  toWorkoutSetResponse,
} from "@/lib/workout-set-api";

export const dynamic = "force-dynamic";

type WorkoutExerciseSetsRouteContext = {
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

async function getWorkoutExerciseId(context: WorkoutExerciseSetsRouteContext) {
  const { id } = await context.params;
  return id;
}

export async function POST(
  _request: Request,
  context: WorkoutExerciseSetsRouteContext,
) {
  const workoutExerciseId = await getWorkoutExerciseId(context);
  const result = await addSetToActiveWorkoutExercise(workoutExerciseId);

  if (result.kind === "invalid_id") {
    return badRequest("Workout exercise id must be a valid UUID.");
  }

  if (result.kind === "workout_exercise_not_found") {
    return notFound();
  }

  return NextResponse.json(toWorkoutSetResponse(result.set), { status: 201 });
}
