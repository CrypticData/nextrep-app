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

export type WorkoutSessionResponse = {
  id: string;
  name: string | null;
  description: string | null;
  status: "active" | "completed";
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

export function toWorkoutSessionResponse(
  session: SelectedWorkoutSession,
): WorkoutSessionResponse {
  return {
    id: session.id,
    name: session.name,
    description: session.description,
    status: session.status,
    started_at: session.startedAt.toISOString(),
    ended_at: session.endedAt?.toISOString() ?? null,
    server_now: new Date().toISOString(),
    created_at: session.createdAt.toISOString(),
    updated_at: session.updatedAt.toISOString(),
  };
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

  try {
    const session = await prisma.workoutSession.create({
      data: { status: "active" },
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
