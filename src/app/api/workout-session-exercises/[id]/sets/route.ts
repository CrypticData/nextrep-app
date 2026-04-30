import { NextResponse } from "next/server";
import {
  findActiveWorkoutExerciseResponseContext,
  toWorkoutSessionExerciseResponseWithPrevious,
} from "@/lib/workout-exercise-api";
import {
  addSetToActiveWorkoutExercise,
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

  const contextResult = await findActiveWorkoutExerciseResponseContext(
    result.workoutSessionExerciseId,
  );

  if (contextResult.kind === "workout_exercise_not_found") {
    return notFound();
  }

  const workoutExerciseResponse = await toWorkoutSessionExerciseResponseWithPrevious(
    contextResult.targetWorkoutExercise,
    contextResult.workoutExercises,
  );
  const createdSet = workoutExerciseResponse.sets.find(
    (set) => set.id === result.set.id,
  );

  if (!createdSet) {
    return notFound();
  }

  return NextResponse.json(createdSet, { status: 201 });
}
