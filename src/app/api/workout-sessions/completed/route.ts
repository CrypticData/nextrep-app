import { NextResponse } from "next/server";
import { listCompletedWorkouts } from "@/lib/completed-workout-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const workouts = await listCompletedWorkouts();

  return NextResponse.json(workouts);
}
