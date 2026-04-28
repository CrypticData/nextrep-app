import { NextResponse } from "next/server";
import { getExerciseHistory } from "@/lib/exercise-history-api";

export const dynamic = "force-dynamic";

type ExerciseHistoryRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function notFound() {
  return NextResponse.json({ error: "Exercise not found." }, { status: 404 });
}

export async function GET(
  _request: Request,
  context: ExerciseHistoryRouteContext,
) {
  const { id } = await context.params;
  const result = await getExerciseHistory(id);

  if (result.kind === "invalid_id") {
    return badRequest("Exercise id must be a valid UUID.");
  }

  if (result.kind === "not_found") {
    return notFound();
  }

  return NextResponse.json(result.history);
}
