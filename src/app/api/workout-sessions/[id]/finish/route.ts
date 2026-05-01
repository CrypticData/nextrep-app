import { NextResponse } from "next/server";
import {
  finishWorkout,
  parseFinishWorkoutBody,
} from "@/lib/workout-session-api";

export const dynamic = "force-dynamic";

type WorkoutSessionFinishRouteContext = {
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

function conflict(message: string, reason: string, extra?: object) {
  return NextResponse.json(
    { error: message, reason, ...extra },
    { status: 409 },
  );
}

export async function POST(
  request: Request,
  context: WorkoutSessionFinishRouteContext,
) {
  const { id } = await context.params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsedBody = parseFinishWorkoutBody(body);

  if (!parsedBody.ok) {
    return badRequest(parsedBody.message);
  }

  const result = await finishWorkout(id, parsedBody.data);

  if (result.kind === "invalid_id") {
    return badRequest("Workout session id must be a valid UUID.");
  }

  if (result.kind === "not_found") {
    return notFound("Workout session not found.");
  }

  if (result.kind === "not_active") {
    return conflict(
      "This workout was already completed or discarded.",
      "not_active",
    );
  }

  if (result.kind === "invalid_weighted_sets") {
    return conflict(
      "This workout still has unfinished rows with weight but no reps.",
      "invalid_weighted_sets",
      { invalid_set_count: result.invalidSetCount },
    );
  }

  if (result.kind === "no_recorded_sets") {
    return conflict(
      "Record at least one set with reps to finish this workout.",
      "no_recorded_sets",
    );
  }

  return NextResponse.json(result.session);
}
