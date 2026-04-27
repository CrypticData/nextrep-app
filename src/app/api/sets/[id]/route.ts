import { NextResponse } from "next/server";
import {
  parseWorkoutSetPatchBody,
  toWorkoutSetResponse,
  updateActiveWorkoutSet,
} from "@/lib/workout-set-api";

export const dynamic = "force-dynamic";

type WorkoutSetRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function notFound() {
  return NextResponse.json(
    { error: "Active workout set not found." },
    { status: 404 },
  );
}

async function getWorkoutSetId(context: WorkoutSetRouteContext) {
  const { id } = await context.params;
  return id;
}

export async function PATCH(
  request: Request,
  context: WorkoutSetRouteContext,
) {
  const workoutSetId = await getWorkoutSetId(context);

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsedBody = parseWorkoutSetPatchBody(body);

  if (!parsedBody.ok) {
    return badRequest(parsedBody.message);
  }

  const result = await updateActiveWorkoutSet(workoutSetId, parsedBody.data);

  if (result.kind === "invalid_id") {
    return badRequest("Workout set id must be a valid UUID.");
  }

  if (result.kind === "set_not_found") {
    return notFound();
  }

  if (result.kind === "invalid_drop_set") {
    return badRequest(
      "Drop sets must come after a normal or failure set in the same exercise.",
    );
  }

  if (result.kind === "assistance_exceeds_bodyweight") {
    return badRequest("Assisted weight cannot exceed current bodyweight.");
  }

  return NextResponse.json(toWorkoutSetResponse(result.set));
}
