import { NextResponse } from "next/server";
import { listRecentExerciseIds } from "@/lib/exercise-api";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listRecentExerciseIds());
}
