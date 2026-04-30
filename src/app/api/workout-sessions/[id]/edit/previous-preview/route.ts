import { NextResponse } from "next/server";
import {
  parsePreviewCompletedWorkoutPreviousBody,
  previewCompletedWorkoutPrevious,
} from "@/lib/completed-workout-edit-api";

export const dynamic = "force-dynamic";

type PreviousPreviewRouteContext = {
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

export async function POST(
  request: Request,
  context: PreviousPreviewRouteContext,
) {
  const { id } = await context.params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = parsePreviewCompletedWorkoutPreviousBody(body);

  if (!parsed.ok) {
    return badRequest(parsed.message);
  }

  const result = await previewCompletedWorkoutPrevious(id, parsed.data);

  if (result.kind === "invalid_id") {
    return badRequest("Workout session id must be a valid UUID.");
  }

  if (result.kind === "invalid_body") {
    return badRequest(result.message);
  }

  if (result.kind === "not_found") {
    return notFound();
  }

  return NextResponse.json({ sets: result.sets });
}
