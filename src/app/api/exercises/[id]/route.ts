import { NextResponse } from "next/server";
import {
  exerciseSelect,
  getExerciseReferenceError,
  isKnownPrismaError,
  isUuid,
  parseExerciseMutationBody,
  toExerciseResponse,
} from "@/lib/exercise-api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type ExerciseRouteContext = {
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

async function getExerciseId(context: ExerciseRouteContext) {
  const { id } = await context.params;
  return id;
}

export async function GET(
  _request: Request,
  context: ExerciseRouteContext,
) {
  const id = await getExerciseId(context);

  if (!isUuid(id)) {
    return badRequest("Exercise id must be a valid UUID.");
  }

  const exercise = await prisma.exercise.findUnique({
    where: { id },
    select: exerciseSelect,
  });

  if (!exercise) {
    return notFound();
  }

  return NextResponse.json(toExerciseResponse(exercise));
}

export async function PATCH(
  request: Request,
  context: ExerciseRouteContext,
) {
  const id = await getExerciseId(context);

  if (!isUuid(id)) {
    return badRequest("Exercise id must be a valid UUID.");
  }

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
    const exercise = await prisma.$transaction(async (tx) => {
      const existingExercise = await tx.exercise.findUnique({
        where: { id },
        select: { exerciseType: true },
      });

      if (!existingExercise) {
        return null;
      }

      if (existingExercise.exerciseType !== parsed.data.exerciseType) {
        throw new ExerciseTypeChangeError();
      }

      return tx.exercise.update({
        where: { id },
        data: {
          name: parsed.data.name,
          description: parsed.data.description,
          equipmentTypeId: parsed.data.equipmentTypeId,
          primaryMuscleGroupId: parsed.data.primaryMuscleGroupId,
          secondaryMuscles: {
            deleteMany: {},
            create: parsed.data.secondaryMuscleGroupIds.map(
              (muscleGroupId) => ({
                muscleGroupId,
              }),
            ),
          },
        },
        select: exerciseSelect,
      });
    });

    if (!exercise) {
      return notFound();
    }

    return NextResponse.json(toExerciseResponse(exercise));
  } catch (error) {
    if (error instanceof ExerciseTypeChangeError) {
      return badRequest("exercise_type cannot be changed after creation.");
    }

    if (isKnownPrismaError(error, "P2025")) {
      return notFound();
    }

    if (isKnownPrismaError(error, "P2003")) {
      return badRequest("Exercise references must point to existing rows.");
    }

    throw error;
  }
}

class ExerciseTypeChangeError extends Error {}

export async function DELETE(
  _request: Request,
  context: ExerciseRouteContext,
) {
  const id = await getExerciseId(context);

  if (!isUuid(id)) {
    return badRequest("Exercise id must be a valid UUID.");
  }

  try {
    await prisma.exercise.delete({
      where: { id },
      select: { id: true },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (isKnownPrismaError(error, "P2025")) {
      return notFound();
    }

    throw error;
  }
}
