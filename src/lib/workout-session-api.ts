import { Prisma } from "@/generated/prisma/client";
import type { WorkoutSessionGetPayload } from "@/generated/prisma/models/WorkoutSession";
import { prisma } from "@/lib/prisma";
import { reindexWorkoutExerciseSets } from "@/lib/workout-set-api";

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

type WorkoutSessionFinishClient = Pick<
  Prisma.TransactionClient,
  "workoutSession" | "workoutSessionExercise" | "workoutSet"
>;

type FinishWorkoutPayload = {
  name: string;
  description: string | null;
  startedAt: Date;
  durationSeconds: number;
};

export type FinishValidationResult =
  | { kind: "invalid_id" }
  | { kind: "not_found" }
  | { kind: "not_active" }
  | { kind: "invalid_weighted_sets"; invalidSetCount: number }
  | { kind: "no_recorded_sets" }
  | { kind: "ok" };

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

export async function validateFinishWorkout(
  id: string,
  db: WorkoutSessionFinishClient = prisma,
): Promise<FinishValidationResult> {
  if (!isUuid(id)) {
    return { kind: "invalid_id" };
  }

  const session = await db.workoutSession.findUnique({
    where: { id },
    select: { status: true },
  });

  if (!session) {
    return { kind: "not_found" };
  }

  if (session.status !== "active") {
    return { kind: "not_active" };
  }

  const invalidSetCount = await countInvalidWeightedSets(id, db);

  if (invalidSetCount > 0) {
    return { kind: "invalid_weighted_sets", invalidSetCount };
  }

  const recordedSetCount = await db.workoutSet.count({
    where: {
      reps: { gte: 1 },
      workoutSessionExercise: {
        workoutSessionId: id,
      },
    },
  });

  if (recordedSetCount === 0) {
    return { kind: "no_recorded_sets" };
  }

  return { kind: "ok" };
}

export async function discardInvalidSets(id: string) {
  if (!isUuid(id)) {
    return { kind: "invalid_id" as const };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const session = await tx.workoutSession.findUnique({
        where: { id },
        select: { status: true },
      });

      if (!session) {
        return { kind: "not_found" as const };
      }

      if (session.status !== "active") {
        return { kind: "not_active" as const };
      }

      const affectedExercises = await findExercisesWithInvalidWeightedSets(
        id,
        tx,
      );

      if (affectedExercises.length === 0) {
        return { kind: "ok" as const, deletedCount: 0 };
      }

      const deleted = await tx.workoutSet.deleteMany({
        where: invalidWeightedSetWhere(id),
      });

      for (const workoutSessionExerciseId of affectedExercises) {
        const reindexResult = await reindexWorkoutExerciseSets(
          tx,
          workoutSessionExerciseId,
        );

        if (!reindexResult.ok) {
          throw new InvalidDropSetReindexError();
        }
      }

      return { kind: "ok" as const, deletedCount: deleted.count };
    });
  } catch (error) {
    if (error instanceof InvalidDropSetReindexError) {
      return { kind: "invalid_drop_set" as const };
    }

    throw error;
  }
}

export function parseFinishWorkoutBody(value: unknown):
  | { ok: true; data: FinishWorkoutPayload }
  | { ok: false; message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }

  if (typeof value.name !== "string") {
    return { ok: false, message: "name is required." };
  }

  const name = value.name.trim();

  if (name.length < 1 || name.length > 120) {
    return { ok: false, message: "name must be 1-120 characters." };
  }

  if (
    value.description !== null &&
    value.description !== undefined &&
    typeof value.description !== "string"
  ) {
    return { ok: false, message: "description must be a string or null." };
  }

  if (typeof value.started_at !== "string") {
    return { ok: false, message: "started_at must be an ISO8601 string." };
  }

  const startedAtMs = Date.parse(value.started_at);

  if (Number.isNaN(startedAtMs)) {
    return { ok: false, message: "started_at must be a valid ISO8601 string." };
  }

  const nowMs = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  if (startedAtMs > nowMs + 60 * 1000) {
    return { ok: false, message: "started_at cannot be in the future." };
  }

  if (startedAtMs < nowMs - thirtyDaysMs) {
    return {
      ok: false,
      message: "started_at cannot be more than 30 days in the past.",
    };
  }

  if (
    typeof value.duration_seconds !== "number" ||
    !Number.isInteger(value.duration_seconds) ||
    value.duration_seconds < 0
  ) {
    return {
      ok: false,
      message: "duration_seconds must be a non-negative integer.",
    };
  }

  return {
    ok: true,
    data: {
      name,
      description: value.description?.trim() || null,
      startedAt: new Date(startedAtMs),
      durationSeconds: value.duration_seconds,
    },
  };
}

export async function finishWorkout(id: string, payload: FinishWorkoutPayload) {
  if (!isUuid(id)) {
    return { kind: "invalid_id" as const };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const session = await tx.workoutSession.findUnique({
        where: { id },
        select: { status: true },
      });

      if (!session) {
        return { kind: "not_found" as const };
      }

      if (session.status !== "active") {
        return { kind: "not_active" as const };
      }

      const validation = await validateFinishWorkout(id, tx);

      if (validation.kind === "invalid_weighted_sets") {
        return {
          kind: "invalid_weighted_sets" as const,
          invalidSetCount: validation.invalidSetCount,
        };
      }

      if (validation.kind === "no_recorded_sets") {
        return { kind: "no_recorded_sets" as const };
      }

      if (validation.kind !== "ok") {
        return { kind: validation.kind };
      }

      const affectedExercises = await findExercisesWithEmptySets(id, tx);

      if (affectedExercises.length > 0) {
        await tx.workoutSet.deleteMany({
          where: emptySetWhere(id),
        });

        for (const workoutSessionExerciseId of affectedExercises) {
          const reindexResult = await reindexWorkoutExerciseSets(
            tx,
            workoutSessionExerciseId,
          );

          if (!reindexResult.ok) {
            throw new InvalidDropSetReindexError();
          }
        }
      }

      const endedAt = new Date(
        payload.startedAt.getTime() + payload.durationSeconds * 1000,
      );
      const completedSession = await tx.workoutSession.update({
        where: { id },
        data: {
          name: payload.name,
          description: payload.description,
          startedAt: payload.startedAt,
          endedAt,
          status: "completed",
        },
        select: workoutSessionSelect,
      });

      return {
        kind: "ok" as const,
        session: await toWorkoutSessionResponse(completedSession, tx),
      };
    });
  } catch (error) {
    if (error instanceof InvalidDropSetReindexError) {
      return { kind: "invalid_drop_set" as const };
    }

    throw error;
  }
}

async function countInvalidWeightedSets(
  workoutSessionId: string,
  db: WorkoutSessionFinishClient,
) {
  return db.workoutSet.count({
    where: invalidWeightedSetWhere(workoutSessionId),
  });
}

async function findExercisesWithInvalidWeightedSets(
  workoutSessionId: string,
  db: WorkoutSessionFinishClient,
) {
  const sets = await db.workoutSet.findMany({
    where: invalidWeightedSetWhere(workoutSessionId),
    distinct: ["workoutSessionExerciseId"],
    select: { workoutSessionExerciseId: true },
  });

  return sets.map((set) => set.workoutSessionExerciseId);
}

async function findExercisesWithEmptySets(
  workoutSessionId: string,
  db: WorkoutSessionFinishClient,
) {
  const sets = await db.workoutSet.findMany({
    where: emptySetWhere(workoutSessionId),
    distinct: ["workoutSessionExerciseId"],
    select: { workoutSessionExerciseId: true },
  });

  return sets.map((set) => set.workoutSessionExerciseId);
}

function invalidWeightedSetWhere(
  workoutSessionId: string,
): Prisma.WorkoutSetWhereInput {
  return {
    weightInputValue: { gt: 0 },
    OR: [{ reps: null }, { reps: 0 }],
    workoutSessionExercise: {
      workoutSessionId,
    },
  };
}

function emptySetWhere(workoutSessionId: string): Prisma.WorkoutSetWhereInput {
  return {
    OR: [{ weightInputValue: null }, { weightInputValue: 0 }],
    AND: [
      {
        OR: [{ reps: null }, { reps: 0 }],
      },
    ],
    workoutSessionExercise: {
      workoutSessionId,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class InvalidDropSetReindexError extends Error {}
