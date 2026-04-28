"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useActiveWorkout, useElapsedSeconds } from "./active-workout-context";
import type { ActiveWorkoutSession } from "./active-workout-context";
import { AppShell } from "./app-shell";
import { ConfirmSheet } from "./confirm-sheet";
import {
  WorkoutMetadataHeader,
  WorkoutMetadataSection,
} from "./workout-metadata-ui";
import {
  MAX_WORKOUT_DURATION_SECONDS,
  clampWorkoutDurationSeconds,
  durationInputsToSeconds,
  formatRoundedDuration,
  toVisibleDurationParts,
} from "@/lib/workout-duration";

type WorkoutScreen = "start" | "live" | "save";
type WorkoutSession = ActiveWorkoutSession;

type ExerciseType =
  | "weight_reps"
  | "bodyweight_reps"
  | "weighted_bodyweight"
  | "assisted_bodyweight";

type WorkoutSet = {
  id: string;
  row_index: number;
  set_number: number | null;
  set_type: "normal" | "warmup" | "failure" | "drop";
  reps: number | null;
  rpe: string | null;
  checked: boolean;
  checked_at: string | null;
  weight_input_value: string | null;
  weight_input_unit: "lbs" | "kg" | null;
  weight_normalized_value: string | null;
  weight_normalized_unit: "lbs" | "kg" | null;
  bodyweight_value: string | null;
  bodyweight_unit: "lbs" | "kg" | null;
  volume_value: string | null;
  volume_unit: "lbs" | "kg" | null;
  created_at: string;
  updated_at: string;
};

type WorkoutSessionExercise = {
  id: string;
  workout_session_id: string;
  exercise_id: string | null;
  exercise_type: ExerciseType | null;
  order_index: number;
  input_weight_unit: "lbs" | "kg" | null;
  exercise_name_snapshot: string;
  equipment_name_snapshot: string | null;
  primary_muscle_group_name_snapshot: string | null;
  notes: string | null;
  sets: WorkoutSet[];
  created_at: string;
  updated_at: string;
};

type WorkoutSetPatch = {
  weight_input_value?: string | null;
  weight_input_unit?: "lbs" | "kg";
  reps?: number | null;
  rpe?: string | null;
  checked?: boolean;
  set_type?: WorkoutSet["set_type"];
};

type FinishValidationResponse =
  | { can_continue: true }
  | {
      can_continue: false;
      reason: "no_recorded_sets" | "not_active";
    }
  | {
      can_continue: false;
      reason: "invalid_weighted_sets";
      invalid_set_count: number;
    };

type SaveWorkoutDraft = {
  name: string;
  description: string;
  startedAtLocal: string;
  durationHours: number;
  durationMinutes: number;
  durationSecondsRemainder: number;
  summary: {
    durationSeconds: number;
    recordedSetCount: number;
    volumeValue: number;
    volumeUnit: "lbs" | "kg";
  };
};

export function WorkoutApp() {
  const {
    clear,
    consumeOpenLiveRequest,
    error: activeWorkoutError,
    isLoading,
    openLiveRequest,
    refresh,
    session,
    setSession,
  } = useActiveWorkout();
  const [screen, setScreen] = useState<WorkoutScreen>("start");
  const [isStarting, setIsStarting] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [isDiscardSheetOpen, setIsDiscardSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [saveWorkoutDraft, setSaveWorkoutDraft] =
    useState<SaveWorkoutDraft | null>(null);

  useEffect(() => {
    if (openLiveRequest > 0 && session) {
      const timeout = window.setTimeout(() => {
        setScreen("live");
        consumeOpenLiveRequest();
      }, 0);

      return () => window.clearTimeout(timeout);
    }
  }, [consumeOpenLiveRequest, openLiveRequest, session]);

  useEffect(() => {
    if (!session && (screen === "live" || screen === "save")) {
      const timeout = window.setTimeout(() => setScreen("start"), 0);

      return () => window.clearTimeout(timeout);
    }
  }, [screen, session]);

  useEffect(() => {
    if (screen === "save" && !saveWorkoutDraft) {
      const timeout = window.setTimeout(() => setScreen("live"), 0);

      return () => window.clearTimeout(timeout);
    }
  }, [saveWorkoutDraft, screen]);

  async function handleStartWorkout() {
    setIsStarting(true);
    setError(null);
    setSuccessMessage(null);
    setSaveWorkoutDraft(null);

    try {
      const startedSession = await fetchJson<WorkoutSession>(
        "/api/workout-sessions",
        { method: "POST" },
      );

      setSession(startedSession);
      setScreen("live");
    } catch (startError) {
      setError(getErrorMessage(startError));
    } finally {
      setIsStarting(false);
    }
  }

  async function handleDiscardWorkout() {
    if (!session) {
      return;
    }

    setIsDiscarding(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/workout-sessions/${session.id}/discard`,
        { method: "POST" },
      );

      if (!response.ok) {
        throw new Error(await readErrorResponse(response));
      }

      clear();
      setIsDiscardSheetOpen(false);
      setScreen("start");
      setSuccessMessage(null);
      setSaveWorkoutDraft(null);
    } catch (discardError) {
      setError(getErrorMessage(discardError));
    } finally {
      setIsDiscarding(false);
    }
  }

  function handleWorkoutSaved() {
    clear();
    setScreen("start");
    setSaveWorkoutDraft(null);
    setSuccessMessage("Workout saved");
    window.setTimeout(() => setSuccessMessage(null), 2000);
  }

  const isActiveWorkoutScreen = screen === "live" || screen === "save";
  const blockingError = activeWorkoutError ?? error;

  return (
    <AppShell
      hideFloatingCard={isActiveWorkoutScreen}
      hideHeader={isActiveWorkoutScreen}
      mainClassName={isActiveWorkoutScreen ? "px-5 pb-6 pt-0" : undefined}
      title={isActiveWorkoutScreen ? "Log Workout" : "Workout"}
    >
      {isLoading ? <WorkoutLoading /> : null}

      {!isLoading && blockingError ? (
        <WorkoutError message={blockingError} onRetry={() => void refresh()} />
      ) : null}

      {!isLoading && !blockingError && screen === "live" && session ? (
        <LiveWorkout
          isDiscarding={isDiscarding}
          onReadyToSave={(draft) => {
            setSaveWorkoutDraft(draft);
            setScreen("save");
          }}
          onMinimize={() => setScreen("start")}
          onDiscard={() => {
            setError(null);
            setIsDiscardSheetOpen(true);
          }}
          session={session}
        />
      ) : null}

      {!isLoading &&
      !blockingError &&
      screen === "save" &&
      session &&
      saveWorkoutDraft ? (
        <SaveWorkoutScreen
          draft={saveWorkoutDraft}
          isDiscarding={isDiscarding}
          onBack={() => setScreen("live")}
          onDiscard={() => {
            setError(null);
            setIsDiscardSheetOpen(true);
          }}
          onSaved={handleWorkoutSaved}
          session={session}
        />
      ) : null}

      {!isLoading && !blockingError && screen === "start" ? (
        <StartWorkout
          disabled={session !== null}
          helperText={
            session
              ? "You have a workout in progress — tap the card below to resume."
              : undefined
          }
          isStarting={isStarting}
          onStart={() => void handleStartWorkout()}
          successMessage={successMessage}
        />
      ) : null}

      {isDiscardSheetOpen ? (
        <ConfirmSheet
          confirmLabel="Discard Workout"
          confirmingLabel="Discarding"
          description="Your in-progress sets and exercises will be deleted."
          error={error}
          isConfirming={isDiscarding}
          onCancel={() => {
            if (!isDiscarding) {
              setIsDiscardSheetOpen(false);
              setError(null);
            }
          }}
          onConfirm={() => void handleDiscardWorkout()}
          title="Discard this active workout?"
        />
      ) : null}
    </AppShell>
  );
}

function WorkoutLoading() {
  return (
    <div className="space-y-4">
      <div className="h-36 animate-pulse rounded-3xl bg-white/[0.04]" />
      <div className="h-56 animate-pulse rounded-3xl bg-white/[0.035]" />
    </div>
  );
}

function WorkoutError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-[58dvh] flex-col items-center justify-center text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-300">
        <XIcon className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-white">
        Could not load workout
      </h2>
      <p className="mt-2 max-w-64 text-sm leading-6 text-zinc-400">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition active:scale-95"
      >
        Retry
      </button>
    </div>
  );
}

function StartWorkout({
  disabled,
  helperText,
  isStarting,
  onStart,
  successMessage,
}: {
  disabled: boolean;
  helperText?: string;
  isStarting: boolean;
  onStart: () => void;
  successMessage: string | null;
}) {
  return (
    <div className="flex min-h-[58dvh] flex-col justify-center">
      {successMessage ? (
        <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100">
          {successMessage}
        </div>
      ) : null}
      <section className="rounded-3xl border border-white/10 bg-[#181818] p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
          <PlayIcon className="h-7 w-7" />
        </div>
        <h2 className="mt-5 text-2xl font-semibold tracking-normal text-white">
          Ready to train?
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          {helperText ??
            "Start a workout, then add exercises from your library as you train."}
        </p>
        <button
          type="button"
          onClick={onStart}
          disabled={disabled || isStarting}
          className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 text-base font-bold text-white shadow-lg shadow-emerald-950/50 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          <PlayIcon className="h-5 w-5" />
          {isStarting ? "Starting" : "Start Empty Workout"}
        </button>
      </section>
    </div>
  );
}

function LiveWorkout({
  isDiscarding,
  onDiscard,
  onMinimize,
  onReadyToSave,
  session,
}: {
  isDiscarding: boolean;
  onDiscard: () => void;
  onMinimize: () => void;
  onReadyToSave: (draft: SaveWorkoutDraft) => void;
  session: WorkoutSession;
}) {
  const router = useRouter();
  const { clear, offsetMs, refresh } = useActiveWorkout();
  const elapsedSeconds = useElapsedSeconds(session.started_at);
  const [workoutExercises, setWorkoutExercises] = useState<
    WorkoutSessionExercise[]
  >([]);
  const [isLoadingWorkoutExercises, setIsLoadingWorkoutExercises] =
    useState(true);
  const [workoutExercisesError, setWorkoutExercisesError] = useState<
    string | null
  >(null);
  const [savingSetIds, setSavingSetIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [deletingSetIds, setDeletingSetIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [addingSetExerciseIds, setAddingSetExerciseIds] = useState<
    Set<string>
  >(() => new Set());
  const [savingUnitExerciseIds, setSavingUnitExerciseIds] = useState<
    Set<string>
  >(() => new Set());
  const [removingWorkoutExerciseIds, setRemovingWorkoutExerciseIds] = useState<
    Set<string>
  >(() => new Set());
  const [setEditError, setSetEditError] = useState<string | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isInvalidRowsSheetOpen, setIsInvalidRowsSheetOpen] = useState(false);
  const [invalidWeightedSetCount, setInvalidWeightedSetCount] = useState(0);
  const [isDiscardingInvalidRows, setIsDiscardingInvalidRows] = useState(false);
  const hasAutoFinishedAtLimitRef = useRef(false);
  const finishWorkoutRef = useRef<() => void>(() => {});
  const latestExerciseNotesRef = useRef<Map<string, string>>(new Map());
  const noteSavePromisesRef = useRef<Map<string, Promise<void>>>(new Map());
  const noteSaveTimersRef = useRef<Map<string, number>>(new Map());

  const loadWorkoutExercises = useCallback(async () => {
    setIsLoadingWorkoutExercises(true);
    setWorkoutExercisesError(null);

    try {
      const workoutExerciseData = await fetchJson<WorkoutSessionExercise[]>(
        `/api/workout-sessions/${session.id}/exercises`,
      );
      const sortedWorkoutExercises = sortWorkoutExercises(workoutExerciseData);

      setWorkoutExercises(sortedWorkoutExercises);
      return sortedWorkoutExercises;
    } catch (error) {
      setWorkoutExercisesError(getErrorMessage(error));
      return null;
    } finally {
      setIsLoadingWorkoutExercises(false);
    }
  }, [session.id]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadWorkoutExercises();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadWorkoutExercises]);

  useEffect(() => {
    const noteSaveTimers = noteSaveTimersRef.current;

    return () => {
      for (const timeoutId of noteSaveTimers.values()) {
        window.clearTimeout(timeoutId);
      }
      noteSaveTimers.clear();
    };
  }, []);

  function openExercisePicker() {
    router.push("/profile/exercises?mode=add-to-workout");
  }

  async function handleUpdateSet(
    workoutExerciseId: string,
    setId: string,
    patch: WorkoutSetPatch,
  ) {
    setSavingSetIds((currentIds) => new Set(currentIds).add(setId));
    setSetEditError(null);
    setFinishError(null);

    try {
      const updatedSets = await fetchJson<WorkoutSet[]>(`/api/sets/${setId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
      });

      setWorkoutExercises((currentExercises) =>
        currentExercises.map((workoutExercise) => {
          if (workoutExercise.id !== workoutExerciseId) {
            return workoutExercise;
          }

          return {
            ...workoutExercise,
            input_weight_unit:
              workoutExercise.exercise_type === "weight_reps" &&
              patch.weight_input_unit
                ? patch.weight_input_unit
                : workoutExercise.input_weight_unit,
            sets: sortWorkoutSets(updatedSets),
          };
        }),
      );

      if (patch.checked !== undefined) {
        void refresh({ suppressError: true });
      }
    } catch (error) {
      setSetEditError(getErrorMessage(error));
    } finally {
      setSavingSetIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(setId);
        return nextIds;
      });
    }
  }

  async function handleAddSet(workoutExerciseId: string) {
    setAddingSetExerciseIds((currentIds) =>
      new Set(currentIds).add(workoutExerciseId),
    );
    setSetEditError(null);
    setFinishError(null);

    try {
      const createdSet = await fetchJson<WorkoutSet>(
        `/api/workout-session-exercises/${workoutExerciseId}/sets`,
        { method: "POST" },
      );

      setWorkoutExercises((currentExercises) =>
        currentExercises.map((workoutExercise) =>
          workoutExercise.id === workoutExerciseId
            ? {
                ...workoutExercise,
                sets: sortWorkoutSets([...workoutExercise.sets, createdSet]),
              }
            : workoutExercise,
        ),
      );
    } catch (error) {
      setSetEditError(getErrorMessage(error));
    } finally {
      setAddingSetExerciseIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(workoutExerciseId);
        return nextIds;
      });
    }
  }

  async function handleDeleteSet(workoutExerciseId: string, setId: string) {
    setDeletingSetIds((currentIds) => new Set(currentIds).add(setId));
    setSetEditError(null);
    setFinishError(null);

    try {
      const updatedSets = await fetchJson<WorkoutSet[]>(`/api/sets/${setId}`, {
        method: "DELETE",
      });

      setWorkoutExercises((currentExercises) =>
        currentExercises.map((workoutExercise) =>
          workoutExercise.id === workoutExerciseId
            ? {
                ...workoutExercise,
                sets: sortWorkoutSets(updatedSets),
              }
            : workoutExercise,
        ),
      );
    } catch (error) {
      setSetEditError(getErrorMessage(error));
    } finally {
      setDeletingSetIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(setId);
        return nextIds;
      });
    }
  }

  async function handleUpdateWorkoutExerciseUnit(
    workoutExerciseId: string,
    weightUnit: "lbs" | "kg",
  ) {
    setSavingUnitExerciseIds((currentIds) =>
      new Set(currentIds).add(workoutExerciseId),
    );
    setSetEditError(null);

    try {
      const updatedWorkoutExercise = await fetchJson<WorkoutSessionExercise>(
        `/api/workout-session-exercises/${workoutExerciseId}/weight-unit`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ weight_unit: weightUnit }),
        },
      );

      setWorkoutExercises((currentExercises) =>
        sortWorkoutExercises(
          currentExercises.map((workoutExercise) =>
            workoutExercise.id === workoutExerciseId
              ? updatedWorkoutExercise
              : workoutExercise,
          ),
        ),
      );
    } catch (error) {
      setSetEditError(getErrorMessage(error));
    } finally {
      setSavingUnitExerciseIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(workoutExerciseId);
        return nextIds;
      });
    }
  }

  const persistWorkoutExerciseNotes = useCallback(async (
    workoutExerciseId: string,
    notes: string,
  ) => {
    setSetEditError(null);

    try {
      const updatedWorkoutExercise = await fetchJson<WorkoutSessionExercise>(
        `/api/workout-session-exercises/${workoutExerciseId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ notes: notes.trim() || null }),
        },
      );

      setWorkoutExercises((currentExercises) =>
        sortWorkoutExercises(
          currentExercises.map((workoutExercise) =>
            workoutExercise.id === workoutExerciseId
              ? latestExerciseNotesRef.current.get(workoutExerciseId) === notes
                ? updatedWorkoutExercise
                : workoutExercise
              : workoutExercise,
          ),
        ),
      );
    } catch (error) {
      setSetEditError(getErrorMessage(error));
    }
  }, []);

  const saveWorkoutExerciseNotes = useCallback((
    workoutExerciseId: string,
    notes: string,
  ) => {
    const normalizedNotes = notes.trim();
    const existingTimeoutId = noteSaveTimersRef.current.get(workoutExerciseId);

    if (existingTimeoutId) {
      window.clearTimeout(existingTimeoutId);
      noteSaveTimersRef.current.delete(workoutExerciseId);
    }

    const savePromise = persistWorkoutExerciseNotes(
      workoutExerciseId,
      normalizedNotes,
    ).finally(() => {
      if (noteSavePromisesRef.current.get(workoutExerciseId) === savePromise) {
        noteSavePromisesRef.current.delete(workoutExerciseId);
      }
    });

    noteSavePromisesRef.current.set(workoutExerciseId, savePromise);

    return savePromise;
  }, [persistWorkoutExerciseNotes]);

  const flushPendingExerciseNotes = useCallback(async () => {
    const immediateSaves: Promise<void>[] = [];

    for (const [workoutExerciseId, timeoutId] of noteSaveTimersRef.current) {
      window.clearTimeout(timeoutId);
      noteSaveTimersRef.current.delete(workoutExerciseId);
      immediateSaves.push(
        saveWorkoutExerciseNotes(
          workoutExerciseId,
          latestExerciseNotesRef.current.get(workoutExerciseId) ?? "",
        ),
      );
    }

    await Promise.all([
      ...immediateSaves,
      ...noteSavePromisesRef.current.values(),
    ]);
  }, [saveWorkoutExerciseNotes]);

  function handleChangeWorkoutExerciseNotes(
    workoutExerciseId: string,
    notes: string,
  ) {
    latestExerciseNotesRef.current.set(workoutExerciseId, notes);

    setWorkoutExercises((currentExercises) =>
      currentExercises.map((workoutExercise) =>
        workoutExercise.id === workoutExerciseId
          ? { ...workoutExercise, notes }
          : workoutExercise,
      ),
    );

    const existingTimeoutId = noteSaveTimersRef.current.get(workoutExerciseId);

    if (existingTimeoutId) {
      window.clearTimeout(existingTimeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      noteSaveTimersRef.current.delete(workoutExerciseId);
      void saveWorkoutExerciseNotes(workoutExerciseId, notes);
    }, 500);

    noteSaveTimersRef.current.set(workoutExerciseId, timeoutId);
  }

  async function handleRemoveWorkoutExercise(
    workoutExercise: WorkoutSessionExercise,
  ) {
    setRemovingWorkoutExerciseIds((currentIds) =>
      new Set(currentIds).add(workoutExercise.id),
    );
    setSetEditError(null);
    setFinishError(null);

    try {
      const updatedWorkoutExercises = await fetchJson<
        WorkoutSessionExercise[]
      >(`/api/workout-session-exercises/${workoutExercise.id}`, {
        method: "DELETE",
      });

      setWorkoutExercises(sortWorkoutExercises(updatedWorkoutExercises));
    } catch (error) {
      setSetEditError(getErrorMessage(error));
    } finally {
      setRemovingWorkoutExerciseIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(workoutExercise.id);
        return nextIds;
      });
    }
  }

  async function handleDiscardInvalidRowsAndFinish() {
    setIsDiscardingInvalidRows(true);
    setFinishError(null);

    try {
      const response = await fetch(
        `/api/workout-sessions/${session.id}/sets/discard-invalid`,
        { method: "POST" },
      );

      if (!response.ok) {
        throw new Error(await readErrorResponse(response));
      }

      setIsInvalidRowsSheetOpen(false);
      setInvalidWeightedSetCount(0);
      const updatedWorkoutExercises = await loadWorkoutExercises();
      setIsFinishing(true);
      await validateAndFinishWorkout(updatedWorkoutExercises ?? workoutExercises);
    } catch (error) {
      setFinishError(getErrorMessage(error));
    } finally {
      setIsDiscardingInvalidRows(false);
      setIsFinishing(false);
    }
  }

  const validateAndFinishWorkout = useCallback(async (
    exercisesForSummary = workoutExercises,
  ) => {
    await flushPendingExerciseNotes();

    const validation = await fetchJson<FinishValidationResponse>(
      `/api/workout-sessions/${session.id}/finish/validate`,
      { method: "POST" },
    );

    if (validation.can_continue) {
      onReadyToSave(
        buildDefaultSaveWorkoutDraft(session, offsetMs, exercisesForSummary),
      );
      return;
    }

    if (validation.reason === "not_active") {
      setFinishError("This workout was already completed or discarded.");
      clear();
      return;
    }

    if (validation.reason === "invalid_weighted_sets") {
      setInvalidWeightedSetCount(validation.invalid_set_count);
      setIsInvalidRowsSheetOpen(true);
      return;
    }

    setFinishError(
      workoutExercises.length === 0
        ? "You haven't added any exercises yet. Add an exercise and log a set to finish this workout."
        : "You haven't logged any sets yet. Record at least one set with reps to finish this workout.",
    );
  }, [
    clear,
    flushPendingExerciseNotes,
    offsetMs,
    onReadyToSave,
    session,
    workoutExercises,
  ]);

  const handleFinishWorkout = useCallback(async () => {
    setIsFinishing(true);
    setFinishError(null);

    try {
      await validateAndFinishWorkout();
    } catch (error) {
      setFinishError(getErrorMessage(error));
    } finally {
      setIsFinishing(false);
    }
  }, [validateAndFinishWorkout]);

  useEffect(() => {
    finishWorkoutRef.current = () => {
      void handleFinishWorkout();
    };
  }, [handleFinishWorkout]);

  useEffect(() => {
    if (
      elapsedSeconds >= MAX_WORKOUT_DURATION_SECONDS &&
      !hasAutoFinishedAtLimitRef.current &&
      !isFinishing
    ) {
      hasAutoFinishedAtLimitRef.current = true;
      finishWorkoutRef.current();
    }
  }, [elapsedSeconds, isFinishing]);

  const workoutSummary = useMemo(
    () => getWorkoutSummary(workoutExercises, session.default_weight_unit),
    [session.default_weight_unit, workoutExercises],
  );

  return (
    <>
      <div className="space-y-4">
        <LiveWorkoutStickyHeader
          duration={formatElapsedWords(elapsedSeconds)}
          isFinishing={isFinishing}
          onMinimize={onMinimize}
          onFinish={() => void handleFinishWorkout()}
          sets={workoutSummary.checkedSets}
          volume={formatVolumeSummary(
            workoutSummary.volumeValue,
            workoutSummary.volumeUnit,
          )}
        />

        {isLoadingWorkoutExercises ? <WorkoutExerciseLoading /> : null}

        {!isLoadingWorkoutExercises && workoutExercisesError ? (
          <InlineError
            message={workoutExercisesError}
            onRetry={() => void loadWorkoutExercises()}
          />
        ) : null}

        {finishError ? <FinishError message={finishError} /> : null}

        {!isLoadingWorkoutExercises &&
        !workoutExercisesError &&
        workoutExercises.length === 0 ? (
          <EmptyWorkoutExerciseState onAddExercise={openExercisePicker} />
        ) : null}

        {!isLoadingWorkoutExercises &&
        !workoutExercisesError &&
        workoutExercises.length > 0 ? (
          <div className="space-y-3">
            {setEditError ? <SetEditError message={setEditError} /> : null}
            {workoutExercises.map((workoutExercise) => (
              <WorkoutExerciseCard
                key={workoutExercise.id}
                isAddingSet={addingSetExerciseIds.has(workoutExercise.id)}
                isSetDeleting={(setId) => deletingSetIds.has(setId)}
                isSetSaving={(setId) => savingSetIds.has(setId)}
                isUnitSaving={savingUnitExerciseIds.has(workoutExercise.id)}
                isRemoving={removingWorkoutExerciseIds.has(workoutExercise.id)}
                onAddSet={() => void handleAddSet(workoutExercise.id)}
                onDeleteSet={(setId) =>
                  void handleDeleteSet(workoutExercise.id, setId)
                }
                onRemoveExercise={() =>
                  void handleRemoveWorkoutExercise(workoutExercise)
                }
                onUpdateExerciseUnit={(weightUnit) =>
                  handleUpdateWorkoutExerciseUnit(
                    workoutExercise.id,
                    weightUnit,
                  )
                }
                onUpdateNotes={(notes) =>
                  saveWorkoutExerciseNotes(workoutExercise.id, notes)
                }
                onNotesChange={(notes) =>
                  handleChangeWorkoutExerciseNotes(workoutExercise.id, notes)
                }
                onUpdateSet={(setId, patch) =>
                  handleUpdateSet(workoutExercise.id, setId, patch)
                }
                sessionDefaultWeightUnit={session.default_weight_unit}
                workoutExercise={workoutExercise}
              />
            ))}
          </div>
        ) : null}

        {!isLoadingWorkoutExercises &&
        !workoutExercisesError &&
        workoutExercises.length > 0 ? (
          <button
            type="button"
            onClick={openExercisePicker}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 text-base font-bold text-white shadow-lg shadow-emerald-950/50 transition active:scale-[0.99]"
          >
            <PlusIcon className="h-5 w-5" />
            Add Exercise
          </button>
        ) : null}

        <button
          type="button"
          onClick={onDiscard}
          disabled={isDiscarding}
          className="h-12 w-full rounded-2xl border border-red-400/20 bg-red-500/10 px-4 text-base font-bold text-red-200 transition hover:bg-red-500/15 active:scale-[0.99] disabled:cursor-not-allowed disabled:text-red-200/50"
        >
          {isDiscarding ? "Discarding" : "Discard Workout"}
        </button>
      </div>

      {isInvalidRowsSheetOpen ? (
        <ConfirmSheet
          confirmLabel="Discard & Finish"
          confirmingLabel="Discarding"
          description="These rows have a weight but no reps. They cannot be saved."
          error={finishError}
          isConfirming={isDiscardingInvalidRows}
          onCancel={() => {
            if (!isDiscardingInvalidRows) {
              setIsInvalidRowsSheetOpen(false);
              setFinishError(null);
            }
          }}
          onConfirm={() => void handleDiscardInvalidRowsAndFinish()}
          title={`Discard ${invalidWeightedSetCount} unfinished ${invalidWeightedSetCount === 1 ? "row" : "rows"} to finish?`}
        />
      ) : null}
    </>
  );
}

function SaveWorkoutScreen({
  draft,
  isDiscarding,
  onBack,
  onDiscard,
  onSaved,
  session,
}: {
  draft: SaveWorkoutDraft;
  isDiscarding: boolean;
  onBack: () => void;
  onDiscard: () => void;
  onSaved: () => void;
  session: WorkoutSession;
}) {
  const [name, setName] = useState(draft.name);
  const [description, setDescription] = useState(draft.description);
  const [startedAtLocal, setStartedAtLocal] = useState(draft.startedAtLocal);
  const [durationHours, setDurationHours] = useState(
    draft.durationHours.toString(),
  );
  const [durationMinutes, setDurationMinutes] = useState(
    draft.durationMinutes.toString(),
  );
  const [durationSecondsRemainder, setDurationSecondsRemainder] = useState(
    draft.durationSecondsRemainder.toString(),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const durationSeconds = getDurationSecondsFromInputs(
    durationHours,
    durationMinutes,
    durationSecondsRemainder,
  );
  const durationLabel = formatRoundedDuration(
    durationSeconds ?? draft.summary.durationSeconds,
  );

  async function handleSaveWorkout() {
    const trimmedName = name.trim();
    const parsedStartedAt = readLocalDateTimeInput(startedAtLocal);

    setSaveError(null);

    if (trimmedName.length < 1 || trimmedName.length > 120) {
      setSaveError("Workout title must be 1-120 characters.");
      return;
    }

    if (!parsedStartedAt) {
      setSaveError("Start date and time must be valid.");
      return;
    }

    if (durationSeconds === null) {
      setSaveError("Duration must be between 0min and 4h 59min.");
      return;
    }

    setIsSaving(true);

    try {
      await fetchJson<WorkoutSession>(
        `/api/workout-sessions/${session.id}/finish`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: trimmedName,
            description: description.trim() || null,
            started_at: parsedStartedAt.toISOString(),
            duration_seconds: durationSeconds,
          }),
        },
      );

      onSaved();
    } catch (error) {
      setSaveError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <WorkoutMetadataHeader
        left={
          <button
            type="button"
            onClick={onBack}
            className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-zinc-100 transition active:scale-95 active:bg-white/[0.06]"
            aria-label="Back to live workout"
          >
            <ChevronDownIcon className="h-7 w-7 rotate-90" />
          </button>
        }
        right={
          <button
            type="button"
            onClick={() => void handleSaveWorkout()}
            disabled={isSaving}
            className="h-10 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-white shadow-lg shadow-emerald-950/40 transition active:scale-[0.99] disabled:cursor-wait disabled:bg-zinc-700 disabled:text-zinc-300"
          >
            {isSaving ? "Saving" : "Save"}
          </button>
        }
        title="Save Workout"
      />

      {saveError ? <FinishError message={saveError} /> : null}

      <WorkoutMetadataSection
        description={description}
        durationHours={durationHours}
        durationLabel={durationLabel}
        durationMinutes={durationMinutes}
        durationSecondsRemainder={durationSecondsRemainder}
        name={name}
        onDescriptionChange={setDescription}
        onDurationChange={(value) => {
          setDurationHours(value.hours);
          setDurationMinutes(value.minutes);
          setDurationSecondsRemainder(value.seconds);
        }}
        onNameChange={setName}
        onStartedAtLocalChange={setStartedAtLocal}
        setsLabel={draft.summary.recordedSetCount.toString()}
        startedAtLocal={startedAtLocal}
        volumeLabel={formatVolumeSummary(
          draft.summary.volumeValue,
          draft.summary.volumeUnit,
        )}
      />

      <button
        type="button"
        onClick={onDiscard}
        disabled={isDiscarding || isSaving}
        className="h-12 w-full rounded-2xl border border-red-400/20 bg-red-500/10 px-4 text-base font-bold text-red-200 transition hover:bg-red-500/15 active:scale-[0.99] disabled:cursor-not-allowed disabled:text-red-200/50"
      >
        {isDiscarding ? "Discarding" : "Discard Workout"}
      </button>
    </div>
  );
}

function WorkoutExerciseLoading() {
  return (
    <div className="space-y-3">
      {[0, 1].map((item) => (
        <div
          key={item}
          className="h-40 animate-pulse rounded-3xl bg-white/[0.04]"
        />
      ))}
    </div>
  );
}

function InlineError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-300">
          <XIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-red-100">
            Could not load exercises
          </h2>
          <p className="mt-1 text-sm leading-6 text-red-100/70">{message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition active:scale-95"
          >
            Retry
          </button>
        </div>
      </div>
    </section>
  );
}

function SetEditError({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm font-semibold text-amber-100">
      {message}
    </div>
  );
}

function FinishError({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm font-semibold leading-6 text-amber-100">
      {message}
    </div>
  );
}

function LiveWorkoutStickyHeader({
  duration,
  isFinishing,
  onFinish,
  onMinimize,
  sets,
  volume,
}: {
  duration: string;
  isFinishing: boolean;
  onFinish: () => void;
  onMinimize: () => void;
  sets: number;
  volume: string;
}) {
  return (
    <div className="sticky top-0 z-30 -mx-5 -mt-px bg-[#101010]">
      <div className="grid min-h-[68px] grid-cols-[40px_minmax(0,1fr)_40px_auto] items-center gap-2 border-b border-white/10 bg-[#181818] px-5 py-3">
        <button
          type="button"
          onClick={onMinimize}
          className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-zinc-100 transition active:scale-95 active:bg-white/[0.06]"
          aria-label="Minimize live workout"
        >
          <ChevronDownIcon className="h-7 w-7" />
        </button>
        <h1 className="min-w-0 truncate text-xl font-semibold tracking-normal text-white">
          Log Workout
        </h1>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-100 transition active:scale-95 active:bg-white/[0.06]"
          aria-label="Rest timer"
        >
          <TimerIcon className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={onFinish}
          disabled={isFinishing}
          className="h-10 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-white shadow-lg shadow-emerald-950/40 transition active:scale-[0.99] disabled:cursor-wait disabled:bg-zinc-700 disabled:text-zinc-300"
        >
          {isFinishing ? "Finishing" : "Finish"}
        </button>
      </div>

      <div className="grid min-h-[68px] grid-cols-[minmax(118px,1.35fr)_minmax(74px,0.85fr)_minmax(38px,0.45fr)] gap-2 border-b border-white/10 bg-[#101010] px-5 py-3">
        <LiveWorkoutStat label="Duration" value={duration} accent />
        <LiveWorkoutStat label="Volume" value={volume} />
        <LiveWorkoutStat label="Sets" value={sets.toString()} />
      </div>
    </div>
  );
}

function LiveWorkoutStat({
  accent = false,
  label,
  value,
}: {
  accent?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium tracking-normal text-zinc-500">
        {label}
      </p>
      <p
        className={`mt-2 whitespace-nowrap text-[1.35rem] font-semibold leading-none tracking-normal ${
          accent ? "text-emerald-300" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function EmptyWorkoutExerciseState({
  onAddExercise,
}: {
  onAddExercise: () => void;
}) {
  return (
    <section className="flex min-h-[36dvh] flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.05] text-zinc-400">
        <DumbbellIcon className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-white">
        No exercises yet
      </h2>
      <p className="mt-2 max-w-64 text-sm leading-6 text-zinc-500">
        Add an exercise from your library to start logging this workout.
      </p>
      <button
        type="button"
        onClick={onAddExercise}
        className="mt-5 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black transition active:scale-95"
      >
        Add Exercise
      </button>
    </section>
  );
}

function WorkoutExerciseCard({
  isAddingSet,
  isSetDeleting,
  isSetSaving,
  isRemoving,
  isUnitSaving,
  onAddSet,
  onDeleteSet,
  onRemoveExercise,
  onNotesChange,
  onUpdateExerciseUnit,
  onUpdateNotes,
  onUpdateSet,
  sessionDefaultWeightUnit,
  workoutExercise,
}: {
  isAddingSet: boolean;
  isSetDeleting: (setId: string) => boolean;
  isSetSaving: (setId: string) => boolean;
  isRemoving: boolean;
  isUnitSaving: boolean;
  onAddSet: () => void;
  onDeleteSet: (setId: string) => void;
  onRemoveExercise: () => void;
  onNotesChange: (notes: string) => void;
  onUpdateExerciseUnit: (weightUnit: "lbs" | "kg") => Promise<void>;
  onUpdateNotes: (notes: string) => Promise<void>;
  onUpdateSet: (setId: string, patch: WorkoutSetPatch) => Promise<void>;
  sessionDefaultWeightUnit: "lbs" | "kg";
  workoutExercise: WorkoutSessionExercise;
}) {
  const exerciseType = workoutExercise.exercise_type ?? "weight_reps";
  const [isUnitSheetOpen, setIsUnitSheetOpen] = useState(false);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const activeWeightUnit =
    workoutExercise.input_weight_unit ?? sessionDefaultWeightUnit;
  const canChangeExerciseUnit = exerciseType === "weight_reps";

  async function handleSelectExerciseUnit(weightUnit: "lbs" | "kg") {
    setIsUnitSheetOpen(false);

    if (canChangeExerciseUnit) {
      await onUpdateExerciseUnit(weightUnit);
    }
  }

  async function commitNotes() {
    await onUpdateNotes(workoutExercise.notes ?? "");
  }

  return (
    <section className="-mx-5 border-y border-white/[0.07] bg-[#101010] py-4">
      <div className="flex items-start justify-between gap-3 px-5">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-white">
            {workoutExercise.exercise_name_snapshot}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-bold text-zinc-300">
            #{workoutExercise.order_index + 1}
          </span>
          <button
            type="button"
            onClick={() => setIsActionSheetOpen(true)}
            disabled={isRemoving}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200 active:scale-95 disabled:cursor-wait disabled:opacity-50"
            aria-label="Workout exercise actions"
          >
            <MoreIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="mt-3 px-5">
        <AutosizeNotesTextarea
          value={workoutExercise.notes ?? ""}
          onBlur={() => void commitNotes()}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Notes"
        />
      </div>

      <div className="mt-5">
        <div className="grid grid-cols-[42px_minmax(54px,1fr)_68px_46px_56px_38px] items-center border-y border-white/[0.06] bg-[#101010] px-2 py-2.5 text-[10px] font-bold uppercase tracking-[0.09em] text-zinc-500">
          <span>Set</span>
          <span className="truncate">Previous</span>
          <button
            type="button"
            onClick={() => setIsUnitSheetOpen(true)}
            disabled={!canChangeExerciseUnit}
            className="flex min-w-0 items-center justify-center gap-1 rounded-full px-1.5 py-1 text-[10px] font-bold uppercase tracking-[0.09em] text-zinc-400 transition enabled:bg-white/[0.04] enabled:text-emerald-200 enabled:active:scale-95 disabled:cursor-default"
            aria-label="Change weight unit"
          >
            <DumbbellIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {getWeightColumnLabel(exerciseType, activeWeightUnit)}
            </span>
          </button>
          <span className="text-center">Reps</span>
          <span className="text-center">RPE</span>
          <span className="flex justify-center">
            <CheckIcon className="h-4 w-4" />
          </span>
        </div>
        {workoutExercise.sets.length > 0 ? (
          workoutExercise.sets.map((set) => (
            <WorkoutSetEditorRow
              exerciseType={exerciseType}
              inputWeightUnit={workoutExercise.input_weight_unit}
              isDeleting={isSetDeleting(set.id)}
              isSaving={isSetSaving(set.id)}
              key={`${set.id}:${workoutExercise.input_weight_unit ?? "default"}`}
              onDelete={() => onDeleteSet(set.id)}
              onUpdate={(patch) => onUpdateSet(set.id, patch)}
              sessionDefaultWeightUnit={sessionDefaultWeightUnit}
              set={set}
            />
          ))
        ) : (
          <p className="px-3 py-4 text-sm text-zinc-500">No sets yet.</p>
        )}
      </div>

      <div className="px-5 pt-4">
        <button
          type="button"
          onClick={onAddSet}
          disabled={isAddingSet || isRemoving}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white/[0.07] px-4 text-base font-bold text-zinc-300 transition active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
        >
          <PlusIcon className="h-5 w-5" />
          {isAddingSet ? "Adding Set" : "Add Set"}
        </button>
      </div>

      {isUnitSheetOpen ? (
        <WeightUnitSheet
          currentUnit={activeWeightUnit}
          defaultUnit={sessionDefaultWeightUnit}
          isSaving={isUnitSaving}
          onClose={() => setIsUnitSheetOpen(false)}
          onSelect={(weightUnit) => void handleSelectExerciseUnit(weightUnit)}
          title="Weight Units"
          subtitle={workoutExercise.exercise_name_snapshot}
        />
      ) : null}

      {isActionSheetOpen ? (
        <WorkoutExerciseActionsSheet
          isRemoving={isRemoving}
          onClose={() => setIsActionSheetOpen(false)}
          onRemove={() => {
            setIsActionSheetOpen(false);
            onRemoveExercise();
          }}
          title={workoutExercise.exercise_name_snapshot}
        />
      ) : null}
    </section>
  );
}

function AutosizeNotesTextarea({
  className = "bg-[#181818]",
  onBlur,
  onChange,
  placeholder,
  value,
}: {
  className?: string;
  onBlur?: () => void;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  value: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onBlur={onBlur}
      onChange={onChange}
      rows={1}
      maxLength={2000}
      className={`max-h-40 min-h-9 w-full resize-none overflow-hidden rounded-xl border border-white/10 px-3 py-2 text-sm font-medium leading-5 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/40 ${className}`}
      placeholder={placeholder}
    />
  );
}

function WorkoutExerciseActionsSheet({
  isRemoving,
  onClose,
  onRemove,
  title,
}: {
  isRemoving: boolean;
  onClose: () => void;
  onRemove: () => void;
  title: string;
}) {
  return (
    <BottomSheet onClose={onClose}>
      <SheetHeader onClose={onClose} subtitle={title} title="Exercise Actions" />
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <WorkoutSheetField label="Actions">
          <button
            type="button"
            onClick={onRemove}
            disabled={isRemoving}
            className="grid min-h-14 w-full grid-cols-[44px_1fr] items-center rounded-2xl border border-red-400/20 bg-red-500/10 px-3 text-left transition active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-400/10">
              <TrashIcon className="h-5 w-5 text-red-300" />
            </span>
            <span className="text-base font-semibold text-red-100">
              {isRemoving ? "Removing" : "Remove Exercise"}
            </span>
          </button>
        </WorkoutSheetField>
      </div>
    </BottomSheet>
  );
}

function WorkoutSetEditorRow({
  exerciseType,
  inputWeightUnit,
  isDeleting,
  isSaving,
  onDelete,
  onUpdate,
  sessionDefaultWeightUnit,
  set,
}: {
  exerciseType: ExerciseType;
  inputWeightUnit: "lbs" | "kg" | null;
  isDeleting: boolean;
  isSaving: boolean;
  onDelete: () => void;
  onUpdate: (patch: WorkoutSetPatch) => Promise<void>;
  sessionDefaultWeightUnit: "lbs" | "kg";
  set: WorkoutSet;
}) {
  const showWeightInput = exerciseType !== "bodyweight_reps";
  const [isSetTypeSheetOpen, setIsSetTypeSheetOpen] = useState(false);
  const [isRpeSheetOpen, setIsRpeSheetOpen] = useState(false);
  const [weightValue, setWeightValue] = useState(
    set.weight_input_value ? formatDecimal(set.weight_input_value) : "",
  );
  const [weightUnit] = useState<"lbs" | "kg">(
    set.weight_input_unit ??
      inputWeightUnit ??
      sessionDefaultWeightUnit,
  );
  const [repsValue, setRepsValue] = useState(
    set.reps === null ? "" : set.reps.toString(),
  );
  const [rpeValue, setRpeValue] = useState(
    set.rpe ? formatDecimal(set.rpe) : "",
  );

  async function commitSetValues(patch: WorkoutSetPatch = {}) {
    await onUpdate({
      ...(showWeightInput
        ? {
            weight_input_value: normalizeNullableText(weightValue),
            weight_input_unit: weightUnit,
          }
        : {
            weight_input_value: null,
          }),
      reps: parseNullableInteger(repsValue),
      rpe: normalizeNullableText(rpeValue),
      ...patch,
    });
  }

  async function handleRpeChange(value: string | null) {
    setRpeValue(value ?? "");
    setIsRpeSheetOpen(false);
    await commitSetValues({ rpe: value });
  }

  async function handleSetTypeChange(value: WorkoutSet["set_type"]) {
    setIsSetTypeSheetOpen(false);
    await onUpdate({ set_type: value });
  }

  function handleDeleteSet() {
    setIsSetTypeSheetOpen(false);
    onDelete();
  }

  const hasMissingBodyweight =
    usesBodyweightForVolume(exerciseType) &&
    set.reps !== null &&
    set.reps >= 1 &&
    !set.bodyweight_value;
  const savingTone = isSaving ? "opacity-70" : "";
  const weightPlaceholder = showWeightInput ? "0" : "-";

  return (
    <div className={`bg-[#101010] ${savingTone}`}>
      <div className="grid min-h-[64px] grid-cols-[42px_minmax(54px,1fr)_68px_46px_56px_38px] items-center border-b border-white/[0.05] px-2 py-2.5">
        <button
          type="button"
          onClick={() => setIsSetTypeSheetOpen(true)}
          className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.045] text-lg font-bold transition active:scale-95 ${getSetLabelClassName(set.set_type)}`}
          aria-label="Select set type"
        >
          {formatSetLabel(set)}
        </button>

        <span className="truncate pr-2 text-base font-semibold text-zinc-600">
          -
        </span>

        <div className="flex justify-center">
          {showWeightInput ? (
            <input
              inputMode="decimal"
              value={weightValue}
              onBlur={() => void commitSetValues()}
              onChange={(event) => setWeightValue(event.target.value)}
              placeholder={weightPlaceholder}
              className="h-11 w-full min-w-0 rounded-xl border border-transparent bg-transparent px-1 text-center text-xl font-semibold text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-300/40 focus:bg-white/[0.04]"
              aria-label={getWeightInputLabel(exerciseType)}
            />
          ) : (
            <span className="text-xl font-semibold text-zinc-700">
              {weightPlaceholder}
            </span>
          )}
        </div>

        <input
          inputMode="numeric"
          value={repsValue}
          onBlur={() => void commitSetValues()}
          onChange={(event) => setRepsValue(event.target.value)}
          placeholder="0"
          className="h-11 w-full min-w-0 rounded-xl border border-transparent bg-transparent px-1 text-center text-xl font-semibold text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-300/40 focus:bg-white/[0.04]"
          aria-label="Reps"
        />

        <button
          type="button"
          onClick={() => setIsRpeSheetOpen(true)}
          className={
            set.rpe
              ? "mx-auto flex h-10 min-w-[52px] items-center justify-center rounded-xl bg-emerald-400/15 px-2 text-sm font-bold text-emerald-200 transition active:scale-95"
              : "mx-auto flex h-10 min-w-[52px] items-center justify-center rounded-xl bg-white/[0.09] px-2 text-xs font-bold text-zinc-300 transition active:scale-95"
          }
          aria-label="Select RPE"
        >
          {set.rpe ? formatDecimal(set.rpe) : "RPE"}
        </button>

        <button
          type="button"
          onClick={() =>
            void onUpdate({
              checked: !set.checked,
            })
          }
          className={
            set.checked
              ? "mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-lg shadow-emerald-950/40 transition active:scale-95"
              : "mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.09] text-zinc-300 transition active:scale-95"
          }
          aria-label={set.checked ? "Mark set unchecked" : "Mark set checked"}
        >
          <CheckIcon className="h-5 w-5" />
        </button>
      </div>

      {hasMissingBodyweight ? (
        <p className="px-3 pb-2 text-xs font-semibold text-amber-300">
          Add bodyweight in Measures to calculate volume.
        </p>
      ) : null}

      {isSetTypeSheetOpen ? (
        <SetTypeSheet
          currentSetType={set.set_type}
          isDeleting={isDeleting}
          onClose={() => setIsSetTypeSheetOpen(false)}
          onDelete={handleDeleteSet}
          onSelect={(setType) => void handleSetTypeChange(setType)}
        />
      ) : null}

      {isRpeSheetOpen ? (
        <RpeSheet
          currentRpe={normalizeNullableText(rpeValue)}
          onClose={() => setIsRpeSheetOpen(false)}
          onSelect={(rpe) => void handleRpeChange(rpe)}
          setSummary={`Set ${formatSetLabel(set)}: ${formatSetSummary(
            weightValue,
            weightUnit,
            repsValue,
            showWeightInput,
          )}`}
        />
      ) : null}
    </div>
  );
}

function SetTypeSheet({
  currentSetType,
  isDeleting,
  onClose,
  onDelete,
  onSelect,
}: {
  currentSetType: WorkoutSet["set_type"];
  isDeleting: boolean;
  onClose: () => void;
  onDelete: () => void;
  onSelect: (setType: WorkoutSet["set_type"]) => void;
}) {
  const options: Array<{
    label: string;
    marker: string;
    markerClassName: string;
    value: WorkoutSet["set_type"];
  }> = [
    {
      label: "Warm Up Set",
      marker: "W",
      markerClassName: "text-amber-300",
      value: "warmup",
    },
    {
      label: "Normal Set",
      marker: "1",
      markerClassName: "text-white",
      value: "normal",
    },
    {
      label: "Failure Set",
      marker: "F",
      markerClassName: "text-red-400",
      value: "failure",
    },
    {
      label: "Drop Set",
      marker: "D",
      markerClassName: "text-sky-400",
      value: "drop",
    },
  ];

  return (
    <BottomSheet onClose={onClose}>
      <SheetHeader onClose={onClose} title="Select Set Type" />
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <WorkoutSheetField label="Set type">
          <div className="space-y-3">
          {options.map((option) => (
            <button
              type="button"
              onClick={() => onSelect(option.value)}
              key={option.value}
              className={
                currentSetType === option.value
                  ? "grid min-h-14 w-full grid-cols-[44px_1fr_28px] items-center rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-3 text-left transition active:scale-[0.99]"
                  : "grid min-h-14 w-full grid-cols-[44px_1fr_28px] items-center rounded-2xl border border-white/10 bg-[#232323] px-3 text-left transition active:scale-[0.99]"
              }
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-xl bg-black/20 text-base font-bold ${option.markerClassName}`}
              >
                {option.marker}
              </span>
              <span className="text-base font-semibold text-white">
                {option.label}
              </span>
              {currentSetType === option.value ? (
                <CheckIcon className="h-5 w-5 text-emerald-300" />
              ) : null}
            </button>
          ))}
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            className="grid min-h-14 w-full grid-cols-[44px_1fr] items-center rounded-2xl border border-red-400/20 bg-red-500/10 px-3 text-left transition active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-400/10">
              <XIcon className="h-5 w-5 text-red-300" />
            </span>
            <span className="text-base font-semibold text-red-100">
              {isDeleting ? "Removing Set" : "Remove Set"}
            </span>
          </button>
          </div>
        </WorkoutSheetField>
      </div>
    </BottomSheet>
  );
}

function WeightUnitSheet({
  currentUnit,
  defaultUnit,
  isSaving,
  onClose,
  onSelect,
  subtitle,
  title,
}: {
  currentUnit: "lbs" | "kg";
  defaultUnit: "lbs" | "kg";
  isSaving: boolean;
  onClose: () => void;
  onSelect: (unit: "lbs" | "kg") => void;
  subtitle: string;
  title: string;
}) {
  const options: Array<{ label: string; value: "lbs" | "kg" }> = [
    { label: `Default (${defaultUnit})`, value: defaultUnit },
    { label: "kg", value: "kg" },
    { label: "lbs", value: "lbs" },
  ];

  return (
    <BottomSheet onClose={onClose}>
      <SheetHeader onClose={onClose} subtitle={subtitle} title={title} />
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <WorkoutSheetField label="Unit">
          <div className="space-y-3">
          {options.map((option, index) => {
            const isSelected =
              index === 0
                ? currentUnit === defaultUnit
                : currentUnit === option.value && currentUnit !== defaultUnit;

            return (
            <button
              type="button"
              onClick={() => onSelect(option.value)}
              disabled={isSaving}
              key={`${option.label}-${index}`}
              className={
                isSelected
                  ? "grid min-h-14 w-full grid-cols-[1fr_28px] items-center rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-4 text-left transition active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
                  : "grid min-h-14 w-full grid-cols-[1fr_28px] items-center rounded-2xl border border-white/10 bg-[#232323] px-4 text-left transition active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
              }
            >
              <span className="text-base font-semibold text-white">
                {option.label}
              </span>
              {isSelected ? (
                <CheckIcon className="h-5 w-5 text-emerald-300" />
              ) : null}
            </button>
            );
          })}
          </div>
        </WorkoutSheetField>
      </div>
    </BottomSheet>
  );
}

function RpeSheet({
  currentRpe,
  onClose,
  onSelect,
  setSummary,
}: {
  currentRpe: string | null;
  onClose: () => void;
  onSelect: (rpe: string | null) => void;
  setSummary: string;
}) {
  const rpeOptions = ["6", "7", "7.5", "8", "8.5", "9", "9.5", "10"];
  const [selectedRpe, setSelectedRpe] = useState(currentRpe);

  return (
    <BottomSheet onClose={onClose}>
      <SheetHeader
        action={
          <button
            type="button"
            onClick={() => onSelect(selectedRpe)}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition active:scale-95"
          >
            Done
          </button>
        }
        onClose={onClose}
        subtitle={setSummary}
        title="Log Set RPE"
      />
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <WorkoutSheetField label="Selected RPE">
          <div className="flex h-16 items-center justify-center rounded-2xl border border-white/10 bg-[#232323] text-3xl font-semibold text-white">
            {selectedRpe ?? "0"}
          </div>
        </WorkoutSheetField>

        <WorkoutSheetField label="Select RPE">
          <div className="grid grid-cols-4 gap-2">
            {rpeOptions.map((rpe) => (
              <button
                type="button"
                onClick={() => setSelectedRpe(rpe)}
                key={rpe}
                className={
                  selectedRpe === rpe
                    ? "h-12 rounded-2xl bg-emerald-500 text-base font-bold text-white shadow-lg shadow-emerald-950/40"
                    : "h-12 rounded-2xl border border-white/10 bg-[#232323] text-base font-semibold text-zinc-300 transition active:scale-[0.99]"
                }
              >
                {rpe}
              </button>
            ))}
          </div>
        </WorkoutSheetField>

        <div className="mt-1">
          <button
            type="button"
            onClick={() => setSelectedRpe(null)}
            className="h-12 w-full rounded-2xl border border-white/10 bg-[#232323] text-sm font-bold text-zinc-300 transition active:scale-[0.99]"
          >
            Clear
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

function SheetHeader({
  action,
  onClose,
  subtitle,
  title,
}: {
  action?: ReactNode;
  onClose: () => void;
  subtitle?: string;
  title: string;
}) {
  return (
    <>
      <div className="flex justify-center px-5 py-3">
        <div className="h-1 w-10 rounded-full bg-white/20" />
      </div>
      <div className="flex items-center border-b border-white/10 px-5 pb-4">
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-medium text-zinc-400"
        >
          Cancel
        </button>
        <div className="min-w-0 flex-1 px-3 text-center">
          <h2 className="truncate text-base font-semibold text-white">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 truncate text-xs font-medium text-zinc-500">
              {subtitle}
            </p>
          ) : null}
        </div>
        {action ?? <div className="w-[52px]" />}
      </div>
    </>
  );
}

function WorkoutSheetField({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="mb-5">
      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </label>
      {children}
    </div>
  );
}

function BottomSheet({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label="Close sheet"
      />
      <section className="relative flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-[28px] border border-white/10 bg-[#141414] shadow-2xl shadow-black">
        {children}
      </section>
    </div>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(await readErrorResponse(response));
  }

  return (await response.json()) as T;
}

async function readErrorResponse(response: Response) {
  try {
    const data: unknown = await response.json();

    if (isErrorBody(data)) {
      return data.error;
    }
  } catch {
    return response.statusText || "Request failed.";
  }

  return response.statusText || "Request failed.";
}

function isErrorBody(value: unknown): value is { error: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "error" in value &&
    typeof value.error === "string"
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function formatElapsedWords(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}min ${seconds}s`;
  }

  return `${seconds}s`;
}

function buildDefaultSaveWorkoutDraft(
  session: WorkoutSession,
  offsetMs: number | null,
  workoutExercises: WorkoutSessionExercise[],
): SaveWorkoutDraft {
  const startedAtMs = Date.parse(session.started_at);
  const durationSeconds = Number.isNaN(startedAtMs)
    ? 0
    : clampWorkoutDurationSeconds(
        Math.floor((Date.now() + (offsetMs ?? 0) - startedAtMs) / 1000),
      );
  const durationParts = toVisibleDurationParts(durationSeconds);
  const workoutSummary = getWorkoutSummary(
    workoutExercises,
    session.default_weight_unit,
  );

  return {
    name: `Workout — ${formatWorkoutNameDate(session.started_at)}`,
    description: "",
    startedAtLocal: toLocalDateTimeInputValue(session.started_at),
    durationHours: durationParts.hours,
    durationMinutes: durationParts.minutes,
    durationSecondsRemainder: durationParts.secondsAdjustment,
    summary: {
      durationSeconds,
      recordedSetCount: workoutSummary.recordedSets,
      volumeValue: workoutSummary.volumeValue,
      volumeUnit: workoutSummary.volumeUnit,
    },
  };
}

function getDurationSecondsFromInputs(
  hours: string,
  minutes: string,
  secondsAdjustment: string,
) {
  const parsedHours = parseNonNegativeInteger(hours);
  const parsedMinutes = parseNonNegativeInteger(minutes);
  const parsedSecondsAdjustment = parseSignedInteger(secondsAdjustment);

  if (
    parsedHours === null ||
    parsedMinutes === null ||
    parsedSecondsAdjustment === null ||
    parsedHours > Math.floor(MAX_WORKOUT_DURATION_SECONDS / 3600) ||
    parsedMinutes > 59
  ) {
    return null;
  }

  return durationInputsToSeconds(
    parsedHours,
    parsedMinutes,
    parsedSecondsAdjustment,
  );
}

function parseNonNegativeInteger(value: string) {
  const trimmedValue = value.trim();

  if (!/^\d+$/.test(trimmedValue)) {
    return null;
  }

  const parsedValue = Number(trimmedValue);

  return Number.isSafeInteger(parsedValue) ? parsedValue : null;
}

function parseSignedInteger(value: string) {
  const trimmedValue = value.trim();

  if (!/^-?\d+$/.test(trimmedValue)) {
    return null;
  }

  const parsedValue = Number(trimmedValue);

  return Number.isSafeInteger(parsedValue) ? parsedValue : null;
}

function toLocalDateTimeInputValue(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getFullYear().toString().padStart(4, "0"),
    "-",
    (date.getMonth() + 1).toString().padStart(2, "0"),
    "-",
    date.getDate().toString().padStart(2, "0"),
    "T",
    date.getHours().toString().padStart(2, "0"),
    ":",
    date.getMinutes().toString().padStart(2, "0"),
  ].join("");
}

function readLocalDateTimeInput(value: string) {
  const parsedTime = new Date(value).getTime();

  return Number.isNaN(parsedTime) ? null : new Date(parsedTime);
}

function formatWorkoutNameDate(startedAt: string) {
  const date = new Date(startedAt);

  if (Number.isNaN(date.getTime())) {
    return "Today";
  }

  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const day = date.getDate();

  return `${weekday} ${month} ${day}`;
}

function sortWorkoutExercises(exercises: WorkoutSessionExercise[]) {
  return [...exercises].sort((first, second) => {
    return first.order_index - second.order_index;
  });
}

function sortWorkoutSets(sets: WorkoutSet[]) {
  return [...sets].sort((first, second) => {
    return first.row_index - second.row_index;
  });
}

function getWorkoutSummary(
  workoutExercises: WorkoutSessionExercise[],
  defaultWeightUnit: "lbs" | "kg",
) {
  const sets = workoutExercises.flatMap(
    (workoutExercise) => workoutExercise.sets,
  );
  const volumeValue = sets.reduce((total, set) => {
    const volume = set.volume_value ? Number(set.volume_value) : 0;

    return Number.isFinite(volume) ? total + volume : total;
  }, 0);

  return {
    checkedSets: sets.filter((set) => set.checked).length,
    recordedSets: sets.filter((set) => set.reps !== null && set.reps >= 1)
      .length,
    volumeValue,
    volumeUnit: defaultWeightUnit,
  };
}

function formatSetLabel(set: WorkoutSet) {
  if (set.set_type === "warmup") {
    return "W";
  }

  if (set.set_type === "failure") {
    return "F";
  }

  if (set.set_type === "drop") {
    return "D";
  }

  return set.set_number?.toString() ?? set.row_index.toString();
}

function getSetLabelClassName(setType: WorkoutSet["set_type"]) {
  if (setType === "warmup") {
    return "text-amber-300";
  }

  if (setType === "failure") {
    return "text-red-400";
  }

  if (setType === "drop") {
    return "text-sky-400";
  }

  return "text-white";
}

function getWeightColumnLabel(
  exerciseType: ExerciseType,
  weightUnit: "lbs" | "kg",
) {
  if (exerciseType === "bodyweight_reps") {
    return "BW";
  }

  return weightUnit.toUpperCase();
}

function formatVolumeSummary(value: number, unit: "lbs" | "kg") {
  if (value <= 0) {
    return `0 ${unit}`;
  }

  return `${formatDecimal(value.toFixed(2))} ${unit}`;
}

function formatDecimal(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return value;
  }

  return Number.isInteger(parsed) ? parsed.toString() : parsed.toFixed(2);
}

function formatSetSummary(
  weightValue: string,
  weightUnit: "lbs" | "kg",
  repsValue: string,
  showWeightInput: boolean,
) {
  const formattedReps = normalizeNullableText(repsValue) ?? "0";

  if (!showWeightInput) {
    return `${formattedReps} reps`;
  }

  return `${normalizeNullableText(weightValue) ?? "0"}${weightUnit} x ${formattedReps} reps`;
}

function normalizeNullableText(value: string) {
  const trimmedValue = value.trim();

  return trimmedValue.length === 0 ? null : trimmedValue;
}

function parseNullableInteger(value: string) {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return null;
  }

  const parsed = Number(trimmedValue);

  return Number.isInteger(parsed) ? parsed : null;
}

function usesBodyweightForVolume(exerciseType: ExerciseType) {
  return (
    exerciseType === "bodyweight_reps" ||
    exerciseType === "weighted_bodyweight" ||
    exerciseType === "assisted_bodyweight"
  );
}

function getWeightInputLabel(exerciseType: ExerciseType) {
  if (exerciseType === "weighted_bodyweight") {
    return "Added";
  }

  if (exerciseType === "assisted_bodyweight") {
    return "Assist";
  }

  return "Weight";
}

type IconProps = {
  className?: string;
};

function PlusIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function CheckIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="m5 12 4 4L19 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="m5 8 7 7 7-7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}

function TimerIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M12 7v5l3 2M7.8 3.6 5.5 5.8M16.2 3.6l2.3 2.2M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function MoreIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="5" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="19" r="2" fill="currentColor" />
    </svg>
  );
}

function TrashIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function PlayIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M8 5v14l11-7L8 5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function DumbbellIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M6 7v10M18 7v10M3 9v6M21 9v6M7 12h10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function XIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}
