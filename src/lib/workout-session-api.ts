import { Prisma } from "@/generated/prisma/client";
import type { WorkoutSessionGetPayload } from "@/generated/prisma/models/WorkoutSession";
import { prisma } from "@/lib/prisma";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const workoutSessionSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  defaultWeightUnit: true,
  startedAt: true,
  endedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WorkoutSessionSelect;

type SelectedWorkoutSession = WorkoutSessionGetPayload<{
  select: typeof workoutSessionSelect;
}>;

type WorkoutSessionClient = Pick<
  Prisma.TransactionClient,
  "workoutSession"
>;

type WorkoutSessionResponseClient = Pick<Prisma.TransactionClient, "workoutSet">;

export type WorkoutSessionResponse = {
  id: string;
  name: string | null;
  description: string | null;
  status: "active" | "completed";
  default_weight_unit: "lbs" | "kg";
  current_exercise_name: string | null;
  started_at: string;
  ended_at: string | null;
  server_now: string;
  created_at: string;
  updated_at: string;
};

export function isUuid(value: string) {
  return uuidPattern.test(value);
}

export function isKnownPrismaError(error: unknown, code: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

export async function toWorkoutSessionResponse(
  session: SelectedWorkoutSession,
  db: WorkoutSessionResponseClient = prisma,
): Promise<WorkoutSessionResponse> {
  const currentExerciseName = await findCurrentExerciseName(session.id, db);

  return {
    id: session.id,
    name: session.name,
    description: session.description,
    status: session.status,
    default_weight_unit: session.defaultWeightUnit,
    current_exercise_name: currentExerciseName,
    started_at: session.startedAt.toISOString(),
    ended_at: session.endedAt?.toISOString() ?? null,
    server_now: new Date().toISOString(),
    created_at: session.createdAt.toISOString(),
    updated_at: session.updatedAt.toISOString(),
  };
}

async function findCurrentExerciseName(
  workoutSessionId: string,
  db: WorkoutSessionResponseClient,
) {
  const checkedSet = await db.workoutSet.findFirst({
    where: {
      checked: true,
      checkedAt: { not: null },
      workoutSessionExercise: {
        workoutSessionId,
      },
    },
    orderBy: {
      checkedAt: "desc",
    },
    select: {
      workoutSessionExercise: {
        select: {
          exerciseNameSnapshot: true,
        },
      },
    },
  });

  return checkedSet?.workoutSessionExercise.exerciseNameSnapshot ?? null;
}

export async function findActiveWorkoutSession(
  db: WorkoutSessionClient = prisma,
) {
  return db.workoutSession.findFirst({
    where: { status: "active" },
    select: workoutSessionSelect,
  });
}

export async function createOrReturnActiveWorkoutSession() {
  const activeSession = await findActiveWorkoutSession();

  if (activeSession) {
    return { session: activeSession, created: false };
  }

  const settings = await prisma.appSettings.findUniqueOrThrow({
    where: { id: 1 },
    select: { defaultWeightUnit: true },
  });

  try {
    const session = await prisma.workoutSession.create({
      data: {
        status: "active",
        defaultWeightUnit: settings.defaultWeightUnit,
      },
      select: workoutSessionSelect,
    });

    return { session, created: true };
  } catch (error) {
    if (isKnownPrismaError(error, "P2002")) {
      const session = await findActiveWorkoutSession();

      if (session) {
        return { session, created: false };
      }
    }

    throw error;
  }
}

export async function discardActiveWorkoutSession(id: string) {
  const deleted = await prisma.workoutSession.deleteMany({
    where: {
      id,
      status: "active",
    },
  });

  return deleted.count > 0;
}
