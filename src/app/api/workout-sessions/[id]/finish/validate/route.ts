import { NextResponse } from "next/server";
import { validateFinishWorkout } from "@/lib/workout-session-api";

export const dynamic = "force-dynamic";

type WorkoutSessionFinishValidateRouteContext = {
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

export async function POST(
  _request: Request,
  context: WorkoutSessionFinishValidateRouteContext,
) {
  const { id } = await context.params;
  const result = await validateFinishWorkout(id);

  if (result.kind === "invalid_id") {
    return badRequest("Workout session id must be a valid UUID.");
  }

  if (result.kind === "not_found") {
    return notFound("Workout session not found.");
  }

  if (result.kind === "not_active") {
    return NextResponse.json({
      can_continue: false,
      reason: "not_active",
    });
  }

  if (result.kind === "invalid_weighted_sets") {
    return NextResponse.json({
      can_continue: false,
      reason: "invalid_weighted_sets",
      invalid_set_count: result.invalidSetCount,
    });
  }

  if (result.kind === "no_recorded_sets") {
    return NextResponse.json({
      can_continue: false,
      reason: "no_recorded_sets",
    });
  }

  return NextResponse.json({ can_continue: true });
}
