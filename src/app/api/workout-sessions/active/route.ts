import { NextResponse } from "next/server";
import {
  findActiveWorkoutSession,
  toWorkoutSessionResponse,
} from "@/lib/workout-session-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await findActiveWorkoutSession();

  return NextResponse.json(
    session ? await toWorkoutSessionResponse(session) : null,
  );
}
