import { NextResponse } from "next/server";
import {
  deleteCompletedWorkout,
  getCompletedWorkoutDetail,
} from "@/lib/completed-workout-api";

export const dynamic = "force-dynamic";

type WorkoutSessionRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function notFound() {
  return NextResponse.json(
    { error: "Completed workout session not found." },
    { status: 404 },
  );
}

export async function GET(
  _request: Request,
  context: WorkoutSessionRouteContext,
) {
  const { id } = await context.params;
  const result = await getCompletedWorkoutDetail(id);

  if (result.kind === "invalid_id") {
    return badRequest("Workout session id must be a valid UUID.");
  }

  if (result.kind === "not_found") {
    return notFound();
  }

  return NextResponse.json(result.workout);
}

export async function DELETE(
  _request: Request,
  context: WorkoutSessionRouteContext,
) {
  const { id } = await context.params;
  const result = await deleteCompletedWorkout(id);

  if (result.kind === "invalid_id") {
    return badRequest("Workout session id must be a valid UUID.");
  }

  if (result.kind === "not_found") {
    return notFound();
  }

  return new NextResponse(null, { status: 204 });
}
