"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AppShell } from "./app-shell";

type WorkoutSession = {
  id: string;
  name: string | null;
  description: string | null;
  status: "active" | "completed";
  default_weight_unit: "lbs" | "kg";
  started_at: string;
  ended_at: string | null;
  server_now: string;
  created_at: string;
  updated_at: string;
};

type WorkoutScreen = "start" | "resume" | "live";

type Reference = {
  id: string;
  name: string;
};

type ExerciseType =
  | "weight_reps"
  | "bodyweight_reps"
  | "weighted_bodyweight"
  | "assisted_bodyweight";

type Exercise = {
  id: string;
  name: string;
  description: string | null;
  exercise_type: ExerciseType;
  weight_unit_preference: "lbs" | "kg" | null;
  equipment_type: Reference;
  primary_muscle_group: Reference;
  secondary_muscle_groups: Reference[];
  created_at: string;
  updated_at: string;
};

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

export function WorkoutApp() {
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [screen, setScreen] = useState<WorkoutScreen>("start");
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadActiveSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const activeSession = await fetchJson<WorkoutSession | null>(
        "/api/workout-sessions/active",
      );

      setSession(activeSession);
      setScreen(activeSession ? "resume" : "start");
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadActiveSession();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadActiveSession]);

  async function handleStartWorkout() {
    setIsStarting(true);
    setError(null);

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

    const confirmed = window.confirm(
      "Discard this active workout? This deletes the empty workout session.",
    );

    if (!confirmed) {
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

      setSession(null);
      setScreen("start");
    } catch (discardError) {
      setError(getErrorMessage(discardError));
    } finally {
      setIsDiscarding(false);
    }
  }

  const isLiveScreen = screen === "live";

  return (
    <AppShell
      hideHeader={isLiveScreen}
      mainClassName={isLiveScreen ? "px-5 pb-6 pt-0" : undefined}
      title={isLiveScreen ? "Log Workout" : "Workout"}
    >
      {isLoading ? <WorkoutLoading /> : null}

      {!isLoading && error ? (
        <WorkoutError message={error} onRetry={() => void loadActiveSession()} />
      ) : null}

      {!isLoading && !error && screen === "live" && session ? (
        <LiveWorkout
          isDiscarding={isDiscarding}
          onMinimize={() => setScreen("resume")}
          onDiscard={handleDiscardWorkout}
          session={session}
        />
      ) : null}

      {!isLoading && !error && screen !== "live" && session ? (
        <ResumeWorkout
          onResume={() => setScreen("live")}
          session={session}
        />
      ) : null}

      {!isLoading && !error && screen === "start" && !session ? (
        <StartWorkout
          isStarting={isStarting}
          onStart={() => void handleStartWorkout()}
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
  isStarting,
  onStart,
}: {
  isStarting: boolean;
  onStart: () => void;
}) {
  return (
    <div className="flex min-h-[58dvh] flex-col justify-center">
      <section className="rounded-3xl border border-white/10 bg-[#181818] p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
          <PlayIcon className="h-7 w-7" />
        </div>
        <h2 className="mt-5 text-2xl font-semibold tracking-normal text-white">
          Ready to train?
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Start a workout, then add exercises from your library as you train.
        </p>
        <button
          type="button"
          onClick={onStart}
          disabled={isStarting}
          className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 text-base font-bold text-white shadow-lg shadow-emerald-950/50 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          <PlayIcon className="h-5 w-5" />
          {isStarting ? "Starting" : "Start Empty Workout"}
        </button>
      </section>
    </div>
  );
}

function ResumeWorkout({
  onResume,
  session,
}: {
  onResume: () => void;
  session: WorkoutSession;
}) {
  const elapsedSeconds = useElapsedSeconds(
    session.started_at,
    session.server_now,
  );

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.06] p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">
          Active workout
        </p>
        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-4xl font-semibold tracking-normal text-white">
              {formatElapsed(elapsedSeconds)}
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              Started {formatStartedTime(session.started_at)}
            </p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
            <PlayIcon className="h-5 w-5" />
          </div>
        </div>
        <button
          type="button"
          onClick={onResume}
          className="mt-6 h-12 w-full rounded-2xl bg-white px-4 text-base font-bold text-black transition active:scale-[0.99]"
        >
          Resume Workout
        </button>
      </section>
    </div>
  );
}

function LiveWorkout({
  isDiscarding,
  onDiscard,
  onMinimize,
  session,
}: {
  isDiscarding: boolean;
  onDiscard: () => void;
  onMinimize: () => void;
  session: WorkoutSession;
}) {
  const elapsedSeconds = useElapsedSeconds(
    session.started_at,
    session.server_now,
  );
  const [workoutExercises, setWorkoutExercises] = useState<
    WorkoutSessionExercise[]
  >([]);
  const [exerciseLibrary, setExerciseLibrary] = useState<Exercise[]>([]);
  const [isLoadingWorkoutExercises, setIsLoadingWorkoutExercises] =
    useState(true);
  const [workoutExercisesError, setWorkoutExercisesError] = useState<
    string | null
  >(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [addingExerciseId, setAddingExerciseId] = useState<string | null>(null);
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

  const loadWorkoutExercises = useCallback(async () => {
    setIsLoadingWorkoutExercises(true);
    setWorkoutExercisesError(null);

    try {
      const workoutExerciseData = await fetchJson<WorkoutSessionExercise[]>(
        `/api/workout-sessions/${session.id}/exercises`,
      );

      setWorkoutExercises(sortWorkoutExercises(workoutExerciseData));
    } catch (error) {
      setWorkoutExercisesError(getErrorMessage(error));
    } finally {
      setIsLoadingWorkoutExercises(false);
    }
  }, [session.id]);

  const loadExerciseLibrary = useCallback(async () => {
    setIsLoadingLibrary(true);
    setLibraryError(null);

    try {
      const exerciseData = await fetchJson<Exercise[]>("/api/exercises");

      setExerciseLibrary(sortExercises(exerciseData));
    } catch (error) {
      setLibraryError(getErrorMessage(error));
    } finally {
      setIsLoadingLibrary(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadWorkoutExercises();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadWorkoutExercises]);

  const filteredExerciseLibrary = useMemo(() => {
    const normalizedSearch = exerciseSearch.trim().toLowerCase();

    if (normalizedSearch.length === 0) {
      return exerciseLibrary;
    }

    return exerciseLibrary.filter((exercise) => {
      return (
        exercise.name.toLowerCase().includes(normalizedSearch) ||
        exercise.primary_muscle_group.name
          .toLowerCase()
          .includes(normalizedSearch) ||
        exercise.equipment_type.name.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [exerciseLibrary, exerciseSearch]);

  function openExercisePicker() {
    setIsPickerOpen(true);

    if (exerciseLibrary.length === 0 && !isLoadingLibrary) {
      void loadExerciseLibrary();
    }
  }

  async function handleAddExercise(exercise: Exercise) {
    setAddingExerciseId(exercise.id);
    setLibraryError(null);

    try {
      const workoutExercise = await fetchJson<WorkoutSessionExercise>(
        `/api/workout-sessions/${session.id}/exercises`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ exercise_id: exercise.id }),
        },
      );

      setWorkoutExercises((currentExercises) =>
        sortWorkoutExercises([...currentExercises, workoutExercise]),
      );
      setExerciseSearch("");
      setIsPickerOpen(false);
    } catch (error) {
      setLibraryError(getErrorMessage(error));
    } finally {
      setAddingExerciseId(null);
    }
  }

  async function handleUpdateSet(
    workoutExerciseId: string,
    setId: string,
    patch: WorkoutSetPatch,
  ) {
    setSavingSetIds((currentIds) => new Set(currentIds).add(setId));
    setSetEditError(null);

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

  async function handleRemoveWorkoutExercise(
    workoutExercise: WorkoutSessionExercise,
  ) {
    setRemovingWorkoutExerciseIds((currentIds) =>
      new Set(currentIds).add(workoutExercise.id),
    );
    setSetEditError(null);

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

  const workoutSummary = useMemo(
    () => getWorkoutSummary(workoutExercises, session.default_weight_unit),
    [session.default_weight_unit, workoutExercises],
  );

  return (
    <>
      <div className="space-y-4">
        <LiveWorkoutStickyHeader
          duration={formatElapsedWords(elapsedSeconds)}
          onMinimize={onMinimize}
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

      {isPickerOpen ? (
        <ExercisePickerSheet
          addingExerciseId={addingExerciseId}
          exercises={filteredExerciseLibrary}
          isLoading={isLoadingLibrary}
          loadError={libraryError}
          onAddExercise={(exercise) => void handleAddExercise(exercise)}
          onClose={() => {
            setIsPickerOpen(false);
            setLibraryError(null);
            setExerciseSearch("");
          }}
          onRetry={() => void loadExerciseLibrary()}
          onSearchChange={setExerciseSearch}
          search={exerciseSearch}
          totalExerciseCount={exerciseLibrary.length}
        />
      ) : null}
    </>
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

function LiveWorkoutStickyHeader({
  duration,
  onMinimize,
  sets,
  volume,
}: {
  duration: string;
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
          className="h-10 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-white shadow-lg shadow-emerald-950/40 transition active:scale-[0.99]"
        >
          Finish
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
  onUpdateExerciseUnit,
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
  onUpdateExerciseUnit: (weightUnit: "lbs" | "kg") => Promise<void>;
  onUpdateSet: (setId: string, patch: WorkoutSetPatch) => Promise<void>;
  sessionDefaultWeightUnit: "lbs" | "kg";
  workoutExercise: WorkoutSessionExercise;
}) {
  const exerciseType = workoutExercise.exercise_type ?? "weight_reps";
  const checkedSetCount = workoutExercise.sets.filter(
    (set) => set.checked,
  ).length;
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

  return (
    <section className="-mx-5 border-y border-white/[0.07] bg-[#101010] py-4">
      <div className="flex items-start justify-between gap-3 px-5">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-white">
            {workoutExercise.exercise_name_snapshot}
          </h2>
          <p className="mt-1 truncate text-sm text-zinc-500">
            {compactLabels([
              workoutExercise.primary_muscle_group_name_snapshot,
              workoutExercise.equipment_name_snapshot,
            ])}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-bold text-zinc-300">
              #{workoutExercise.order_index + 1}
            </span>
            <div className="relative">
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
          <span className="text-xs font-semibold text-zinc-500">
            {checkedSetCount}/{workoutExercise.sets.length} done
          </span>
        </div>
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

function ExercisePickerSheet({
  addingExerciseId,
  exercises,
  isLoading,
  loadError,
  onAddExercise,
  onClose,
  onRetry,
  onSearchChange,
  search,
  totalExerciseCount,
}: {
  addingExerciseId: string | null;
  exercises: Exercise[];
  isLoading: boolean;
  loadError: string | null;
  onAddExercise: (exercise: Exercise) => void;
  onClose: () => void;
  onRetry: () => void;
  onSearchChange: (value: string) => void;
  search: string;
  totalExerciseCount: number;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-0">
      <section className="flex max-h-[82dvh] w-full max-w-md flex-col rounded-t-3xl border border-white/10 bg-[#101010] shadow-2xl shadow-black">
        <div className="shrink-0 border-b border-white/10 px-5 pb-4 pt-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Add Exercise
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                {totalExerciseCount} in library
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-zinc-300 transition active:scale-95"
              aria-label="Close exercise picker"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-[#1b1b1b] px-3 py-2.5">
            <SearchIcon className="h-4 w-4 shrink-0 text-zinc-500" />
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search exercise"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-zinc-600"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-[74px] animate-pulse rounded-2xl bg-white/[0.04]"
                />
              ))}
            </div>
          ) : null}

          {!isLoading && loadError ? (
            <InlineError message={loadError} onRetry={onRetry} />
          ) : null}

          {!isLoading && !loadError && totalExerciseCount === 0 ? (
            <div className="py-14 text-center">
              <p className="text-base font-semibold text-white">
                No exercises yet
              </p>
              <p className="mx-auto mt-2 max-w-64 text-sm leading-6 text-zinc-500">
                Create exercises in the Profile tab, then add them here.
              </p>
            </div>
          ) : null}

          {!isLoading &&
          !loadError &&
          totalExerciseCount > 0 &&
          exercises.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-base font-semibold text-white">No matches</p>
              <p className="mt-2 text-sm text-zinc-500">
                Try a different search.
              </p>
            </div>
          ) : null}

          {!isLoading && !loadError && exercises.length > 0 ? (
            <div className="space-y-2 pb-4">
              {exercises.map((exercise) => (
                <ExercisePickerRow
                  exercise={exercise}
                  isAdding={addingExerciseId === exercise.id}
                  key={exercise.id}
                  onAdd={() => onAddExercise(exercise)}
                />
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ExercisePickerRow({
  exercise,
  isAdding,
  onAdd,
}: {
  exercise: Exercise;
  isAdding: boolean;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={isAdding}
      className="flex min-h-[74px] w-full items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#181818] px-3.5 py-3 text-left transition hover:border-white/10 hover:bg-[#1e1e1e] active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/10 text-sm font-bold text-emerald-300">
        {exercise.primary_muscle_group.name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-white">
          {exercise.name}
        </p>
        <p className="mt-1 truncate text-sm text-zinc-500">
          {exercise.primary_muscle_group.name} · {exercise.equipment_type.name}
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-zinc-300">
        {isAdding ? "Adding" : getExerciseTypeLabel(exercise.exercise_type)}
      </span>
    </button>
  );
}

function useElapsedSeconds(startedAt: string, serverNow: string) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const clientAnchorMs = Date.now();
    const serverAnchorMs = parseDateOrFallback(serverNow, clientAnchorMs);
    const startedAtMs = parseDateOrFallback(startedAt, serverAnchorMs);
    const updateElapsedSeconds = () => {
      setElapsedSeconds(
        getElapsedSeconds(startedAtMs, serverAnchorMs, clientAnchorMs),
      );
    };

    updateElapsedSeconds();

    const interval = window.setInterval(() => {
      updateElapsedSeconds();
    }, 250);

    return () => window.clearInterval(interval);
  }, [serverNow, startedAt]);

  return elapsedSeconds;
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

function parseDateOrFallback(value: string, fallback: number) {
  const parsed = Date.parse(value);

  return Number.isNaN(parsed) ? fallback : parsed;
}

function getElapsedSeconds(
  startedAtMs: number,
  serverAnchorMs: number,
  clientAnchorMs: number,
) {
  const estimatedServerNowMs =
    serverAnchorMs + (Date.now() - clientAnchorMs);

  return Math.max(
    0,
    Math.floor((estimatedServerNowMs - startedAtMs) / 1000),
  );
}

function formatElapsed(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    hours.toString(),
    minutes.toString().padStart(2, "0"),
    seconds.toString().padStart(2, "0"),
  ].join(":");
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

function formatStartedTime(startedAt: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(startedAt));
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

function sortExercises(exercises: Exercise[]) {
  return [...exercises].sort((first, second) => {
    return first.name.localeCompare(second.name);
  });
}

function compactLabels(labels: Array<string | null>) {
  const compacted = labels.filter((label): label is string => Boolean(label));

  return compacted.length > 0 ? compacted.join(" · ") : "Exercise";
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

function getExerciseTypeLabel(exerciseType: ExerciseType) {
  switch (exerciseType) {
    case "weight_reps":
      return "Weight";
    case "bodyweight_reps":
      return "Bodyweight";
    case "weighted_bodyweight":
      return "Weighted";
    case "assisted_bodyweight":
      return "Assisted";
  }
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

function SearchIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
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
