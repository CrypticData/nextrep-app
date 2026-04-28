import { NextResponse } from "next/server";
import { discardInvalidSets } from "@/lib/workout-session-api";

export const dynamic = "force-dynamic";

type WorkoutSessionDiscardInvalidRouteContext = {
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

function conflict(message: string, reason: string) {
  return NextResponse.json({ error: message, reason }, { status: 409 });
}

export async function POST(
  _request: Request,
  context: WorkoutSessionDiscardInvalidRouteContext,
) {
  const { id } = await context.params;
  const result = await discardInvalidSets(id);

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

  if (result.kind === "invalid_drop_set") {
    return conflict(
      "Unfinished rows could not be discarded because a drop set would lose its parent set.",
      "invalid_drop_set",
    );
  }

  return NextResponse.json({ deleted_count: result.deletedCount });
}
