import { NextResponse } from "next/server";
import {
  editCompletedWorkout,
  parseEditCompletedWorkoutBody,
} from "@/lib/completed-workout-edit-api";

export const dynamic = "force-dynamic";

type EditWorkoutSessionRouteContext = {
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

export async function PATCH(
  request: Request,
  context: EditWorkoutSessionRouteContext,
) {
  const { id } = await context.params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = parseEditCompletedWorkoutBody(body);

  if (!parsed.ok) {
    return badRequest(parsed.message);
  }

  const result = await editCompletedWorkout(id, parsed.data);

  if (result.kind === "invalid_id") {
    return badRequest("Workout session id must be a valid UUID.");
  }

  if (result.kind === "invalid_body") {
    return badRequest(result.message);
  }

  if (result.kind === "invalid_weighted_sets") {
    return badRequest(
      `${result.invalidSetCount} weighted ${result.invalidSetCount === 1 ? "row has" : "rows have"} weight but no reps.`,
    );
  }

  if (result.kind === "no_recorded_sets") {
    return badRequest("Record at least one set with reps to save this workout.");
  }

  if (result.kind === "assistance_exceeds_bodyweight") {
    return badRequest("Assistance cannot exceed bodyweight.");
  }

  if (result.kind === "not_found") {
    return notFound();
  }

  return NextResponse.json(result.workout);
}
