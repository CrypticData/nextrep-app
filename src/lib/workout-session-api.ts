import { Prisma } from "@/generated/prisma/client";
import type { WorkoutSessionGetPayload } from "@/generated/prisma/models/WorkoutSession";
import { prisma } from "@/lib/prisma";
import { MAX_WORKOUT_DURATION_SECONDS } from "@/lib/workout-duration";
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
  activeRestStartedAt: true,
  activeRestDurationSeconds: true,
  activeRestWorkoutSessionExerciseId: true,
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
  "exercise" | "workoutSession" | "workoutSessionExercise" | "workoutSet"
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
  active_rest_started_at: string | null;
  active_rest_duration_seconds: number | null;
  active_rest_workout_session_exercise_id: string | null;
  server_now: string;
  created_at: string;
  updated_at: string;
};

export type ActiveRestResponse = {
  server_now: string;
  active_rest_started_at: string | null;
  active_rest_duration_seconds: number | null;
  active_rest_workout_session_exercise_id: string | null;
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
    active_rest_started_at: session.activeRestStartedAt?.toISOString() ?? null,
    active_rest_duration_seconds: session.activeRestDurationSeconds,
    active_rest_workout_session_exercise_id:
      session.activeRestWorkoutSessionExerciseId,
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

  return prisma.$transaction(async (tx) => {
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
      await reindexWorkoutExerciseSets(tx, workoutSessionExerciseId);
    }

    return { kind: "ok" as const, deletedCount: deleted.count };
  });
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
    value.duration_seconds < 0 ||
    value.duration_seconds > MAX_WORKOUT_DURATION_SECONDS
  ) {
    return {
      ok: false,
      message: "duration_seconds must be between 0 and 17940.",
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

  return prisma.$transaction(async (tx) => {
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
        await reindexWorkoutExerciseSets(tx, workoutSessionExerciseId);
      }
    }

    const endedAt = new Date(
      payload.startedAt.getTime() + payload.durationSeconds * 1000,
    );

    const restDefaults = await tx.workoutSessionExercise.findMany({
      where: {
        workoutSessionId: id,
        exerciseId: { not: null },
      },
      select: {
        exerciseId: true,
        restSeconds: true,
      },
    });

    for (const restDefault of restDefaults) {
      if (!restDefault.exerciseId) {
        continue;
      }

      await tx.exercise.update({
        where: { id: restDefault.exerciseId },
        data: { defaultRestSeconds: restDefault.restSeconds },
        select: { id: true },
      });
    }

    const completedSession = await tx.workoutSession.update({
      where: { id },
      data: {
        name: payload.name,
        description: payload.description,
        startedAt: payload.startedAt,
        endedAt,
        status: "completed",
        activeRestStartedAt: null,
        activeRestDurationSeconds: null,
        activeRestWorkoutSessionExerciseId: null,
      },
      select: workoutSessionSelect,
    });

    return {
      kind: "ok" as const,
      session: await toWorkoutSessionResponse(completedSession, tx),
    };
  });
}

export function parseStartRestBody(value: unknown):
  | {
      ok: true;
      workoutSessionExerciseId: string;
      durationSeconds: number;
    }
  | { ok: false; message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }

  if (
    typeof value.workout_session_exercise_id !== "string" ||
    !isUuid(value.workout_session_exercise_id)
  ) {
    return {
      ok: false,
      message: "workout_session_exercise_id must be a valid UUID.",
    };
  }

  if (!isRestDuration(value.duration_seconds)) {
    return {
      ok: false,
      message: "duration_seconds must be an integer between 5 and 300.",
    };
  }

  return {
    ok: true,
    workoutSessionExerciseId: value.workout_session_exercise_id,
    durationSeconds: Number(value.duration_seconds),
  };
}

export function parseAdjustRestBody(value: unknown):
  | { ok: true; deltaSeconds: number }
  | { ok: false; message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }

  if (
    typeof value.delta_seconds !== "number" ||
    !Number.isInteger(value.delta_seconds) ||
    value.delta_seconds === 0
  ) {
    return { ok: false, message: "delta_seconds must be a non-zero integer." };
  }

  return { ok: true, deltaSeconds: Number(value.delta_seconds) };
}

export function isRestDuration(value: unknown) {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 5 &&
    value <= 300
  );
}

export async function startActiveRest(
  workoutSessionId: string,
  workoutSessionExerciseId: string,
  durationSeconds: number,
) {
  if (!isUuid(workoutSessionId)) {
    return { kind: "invalid_id" as const };
  }

  const result = await prisma.$transaction(async (tx) => {
    const workoutExercise = await tx.workoutSessionExercise.findUnique({
      where: { id: workoutSessionExerciseId },
      select: {
        id: true,
        workoutSessionId: true,
        workoutSession: { select: { status: true } },
      },
    });

    if (
      !workoutExercise ||
      workoutExercise.workoutSessionId !== workoutSessionId ||
      workoutExercise.workoutSession.status !== "active"
    ) {
      return null;
    }

    return tx.workoutSession.update({
      where: { id: workoutSessionId },
      data: {
        activeRestStartedAt: new Date(),
        activeRestDurationSeconds: durationSeconds,
        activeRestWorkoutSessionExerciseId: workoutSessionExerciseId,
      },
      select: workoutSessionSelect,
    });
  });

  if (!result) {
    return { kind: "not_found" as const };
  }

  return { kind: "ok" as const, rest: toActiveRestResponse(result) };
}

export async function adjustActiveRest(
  workoutSessionId: string,
  deltaSeconds: number,
) {
  if (!isUuid(workoutSessionId)) {
    return { kind: "invalid_id" as const };
  }

  const session = await prisma.workoutSession.findUnique({
    where: { id: workoutSessionId },
    select: workoutSessionSelect,
  });

  if (!session || session.status !== "active") {
    return { kind: "not_found" as const };
  }

  if (
    !session.activeRestStartedAt ||
    !session.activeRestDurationSeconds ||
    !session.activeRestWorkoutSessionExerciseId
  ) {
    return { kind: "no_active_rest" as const };
  }

  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - session.activeRestStartedAt.getTime()) / 1000),
  );
  const remainingSeconds = Math.max(
    0,
    session.activeRestDurationSeconds - elapsedSeconds,
  );
  const nextRemainingSeconds = remainingSeconds + deltaSeconds;

  if (nextRemainingSeconds <= 0) {
    return clearActiveRest(workoutSessionId);
  }

  const updatedSession = await prisma.workoutSession.update({
    where: { id: workoutSessionId },
    data: {
      activeRestStartedAt: new Date(),
      activeRestDurationSeconds: nextRemainingSeconds,
    },
    select: workoutSessionSelect,
  });

  return { kind: "ok" as const, rest: toActiveRestResponse(updatedSession) };
}

export async function clearActiveRest(workoutSessionId: string) {
  if (!isUuid(workoutSessionId)) {
    return { kind: "invalid_id" as const };
  }

  const updated = await prisma.workoutSession.updateMany({
    where: { id: workoutSessionId, status: "active" },
    data: {
      activeRestStartedAt: null,
      activeRestDurationSeconds: null,
      activeRestWorkoutSessionExerciseId: null,
    },
  });

  if (updated.count === 0) {
    return { kind: "not_found" as const };
  }

  return {
    kind: "ok" as const,
    rest: {
      server_now: new Date().toISOString(),
      active_rest_started_at: null,
      active_rest_duration_seconds: null,
      active_rest_workout_session_exercise_id: null,
    },
  };
}

function toActiveRestResponse(session: SelectedWorkoutSession): ActiveRestResponse {
  return {
    server_now: new Date().toISOString(),
    active_rest_started_at: session.activeRestStartedAt?.toISOString() ?? null,
    active_rest_duration_seconds: session.activeRestDurationSeconds,
    active_rest_workout_session_exercise_id:
      session.activeRestWorkoutSessionExerciseId,
  };
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

// Checked state is intentionally ignored. Empty rows are discarded regardless
// of checkmark because the checkmark is a visual indicator, never a save filter.
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
