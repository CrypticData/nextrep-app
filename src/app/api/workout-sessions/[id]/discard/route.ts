import { NextResponse } from "next/server";
import {
  discardActiveWorkoutSession,
  isUuid,
} from "@/lib/workout-session-api";

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
    { error: "Active workout session not found." },
    { status: 404 },
  );
}

export async function POST(
  _request: Request,
  context: WorkoutSessionRouteContext,
) {
  const { id } = await context.params;

  if (!isUuid(id)) {
    return badRequest("Workout session id must be a valid UUID.");
  }

  const discarded = await discardActiveWorkoutSession(id);

  if (!discarded) {
    return notFound();
  }

  return new NextResponse(null, { status: 204 });
}
