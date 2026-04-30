import { NextResponse } from "next/server";
import {
  adjustActiveRest,
  clearActiveRest,
  parseAdjustRestBody,
  parseStartRestBody,
  startActiveRest,
} from "@/lib/workout-session-api";

export const dynamic = "force-dynamic";

type WorkoutSessionRestRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function notFound() {
  return NextResponse.json(
    { error: "Active workout session or exercise not found." },
    { status: 404 },
  );
}

export async function POST(
  request: Request,
  context: WorkoutSessionRestRouteContext,
) {
  const { id } = await context.params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsedBody = parseStartRestBody(body);

  if (!parsedBody.ok) {
    return badRequest(parsedBody.message);
  }

  const result = await startActiveRest(
    id,
    parsedBody.workoutSessionExerciseId,
    parsedBody.durationSeconds,
  );

  if (result.kind === "invalid_id") {
    return badRequest("Workout session id must be a valid UUID.");
  }

  if (result.kind === "not_found") {
    return notFound();
  }

  return NextResponse.json(result.rest);
}

export async function PATCH(
  request: Request,
  context: WorkoutSessionRestRouteContext,
) {
  const { id } = await context.params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsedBody = parseAdjustRestBody(body);

  if (!parsedBody.ok) {
    return badRequest(parsedBody.message);
  }

  const result = await adjustActiveRest(id, parsedBody.deltaSeconds);

  if (result.kind === "invalid_id") {
    return badRequest("Workout session id must be a valid UUID.");
  }

  if (result.kind === "not_found") {
    return notFound();
  }

  if (result.kind === "no_active_rest") {
    return badRequest("No active rest timer is running.");
  }

  return NextResponse.json(result.rest);
}

export async function DELETE(
  _request: Request,
  context: WorkoutSessionRestRouteContext,
) {
  const { id } = await context.params;
  const result = await clearActiveRest(id);

  if (result.kind === "invalid_id") {
    return badRequest("Workout session id must be a valid UUID.");
  }

  if (result.kind === "not_found") {
    return notFound();
  }

  return NextResponse.json(result.rest);
}
