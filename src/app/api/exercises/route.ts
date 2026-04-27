import { NextResponse } from "next/server";
import {
  exerciseSelect,
  getExerciseReferenceError,
  isKnownPrismaError,
  parseExerciseMutationBody,
  toExerciseResponse,
} from "@/lib/exercise-api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET() {
  const exercises = await prisma.exercise.findMany({
    orderBy: { name: "asc" },
    select: exerciseSelect,
  });

  return NextResponse.json(exercises.map(toExerciseResponse));
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = parseExerciseMutationBody(body);

  if (!parsed.ok) {
    return badRequest(parsed.message);
  }

  const referenceError = await getExerciseReferenceError(prisma, parsed.data);

  if (referenceError) {
    return badRequest(referenceError);
  }

  try {
    const exercise = await prisma.exercise.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        exerciseType: parsed.data.exerciseType,
        equipmentTypeId: parsed.data.equipmentTypeId,
        primaryMuscleGroupId: parsed.data.primaryMuscleGroupId,
        secondaryMuscles: {
          create: parsed.data.secondaryMuscleGroupIds.map((muscleGroupId) => ({
            muscleGroupId,
          })),
        },
      },
      select: exerciseSelect,
    });

    return NextResponse.json(toExerciseResponse(exercise), { status: 201 });
  } catch (error) {
    if (isKnownPrismaError(error, "P2003")) {
      return badRequest("Exercise references must point to existing rows.");
    }

    throw error;
  }
}
