import { NextResponse } from "next/server";
import {
  createOrReturnActiveWorkoutSession,
  toWorkoutSessionResponse,
} from "@/lib/workout-session-api";

export const dynamic = "force-dynamic";

export async function POST() {
  const { session, created } = await createOrReturnActiveWorkoutSession();

  return NextResponse.json(await toWorkoutSessionResponse(session), {
    status: created ? 201 : 200,
  });
}
