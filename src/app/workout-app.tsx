"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

  return (
    <AppShell title={screen === "live" ? "Active Workout" : "Workout"}>
      {isLoading ? <WorkoutLoading /> : null}

      {!isLoading && error ? (
        <WorkoutError message={error} onRetry={() => void loadActiveSession()} />
      ) : null}

      {!isLoading && !error && screen === "live" && session ? (
        <LiveWorkout
          isDiscarding={isDiscarding}
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
  session,
}: {
  isDiscarding: boolean;
  onDiscard: () => void;
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

  return (
    <>
      <div className="space-y-4">
        <section className="rounded-3xl border border-white/10 bg-[#181818] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">
                In progress
              </p>
              <p className="mt-3 font-mono text-5xl font-semibold tracking-normal text-white">
                {formatElapsed(elapsedSeconds)}
              </p>
              <p className="mt-2 text-sm text-zinc-500">
                Started {formatStartedTime(session.started_at)}
              </p>
            </div>
            <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300">
              Active
            </span>
          </div>
        </section>

        <button
          type="button"
          onClick={openExercisePicker}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 text-base font-bold text-white shadow-lg shadow-emerald-950/50 transition active:scale-[0.99]"
        >
          <PlusIcon className="h-5 w-5" />
          Add Exercise
        </button>

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
            {workoutExercises.map((workoutExercise) => (
              <WorkoutExerciseCard
                key={workoutExercise.id}
                workoutExercise={workoutExercise}
              />
            ))}
          </div>
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
  workoutExercise,
}: {
  workoutExercise: WorkoutSessionExercise;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-[#181818] p-4">
      <div className="flex items-start justify-between gap-3">
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
        <span className="shrink-0 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-bold text-zinc-300">
          #{workoutExercise.order_index + 1}
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.06]">
        <div className="grid grid-cols-[64px_1fr_72px_52px] bg-white/[0.04] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">
          <span>Set</span>
          <span>Weight</span>
          <span>Reps</span>
          <span className="text-right">Done</span>
        </div>
        {workoutExercise.sets.length > 0 ? (
          workoutExercise.sets.map((set) => (
            <WorkoutSetDisplayRow
              inputWeightUnit={workoutExercise.input_weight_unit}
              key={set.id}
              set={set}
            />
          ))
        ) : (
          <p className="px-3 py-4 text-sm text-zinc-500">No sets yet.</p>
        )}
      </div>
    </section>
  );
}

function WorkoutSetDisplayRow({
  inputWeightUnit,
  set,
}: {
  inputWeightUnit: "lbs" | "kg" | null;
  set: WorkoutSet;
}) {
  const weightUnit = set.weight_input_unit ?? inputWeightUnit;

  return (
    <div className="grid min-h-12 grid-cols-[64px_1fr_72px_52px] items-center border-t border-white/[0.06] px-3 py-2 text-sm">
      <span className="font-semibold text-white">{formatSetLabel(set)}</span>
      <span className="text-zinc-400">
        {set.weight_input_value
          ? `${formatDecimal(set.weight_input_value)} ${weightUnit ?? ""}`
          : weightUnit
            ? `-- ${weightUnit}`
            : "--"}
      </span>
      <span className="text-zinc-400">{set.reps ?? "--"}</span>
      <span className="flex justify-end">
        <span
          className={
            set.checked
              ? "flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white"
              : "flex h-7 w-7 items-center justify-center rounded-full border border-white/15 text-zinc-600"
          }
          aria-label={set.checked ? "Checked" : "Unchecked"}
        >
          <CheckIcon className="h-4 w-4" />
        </span>
      </span>
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

function sortExercises(exercises: Exercise[]) {
  return [...exercises].sort((first, second) => {
    return first.name.localeCompare(second.name);
  });
}

function compactLabels(labels: Array<string | null>) {
  const compacted = labels.filter((label): label is string => Boolean(label));

  return compacted.length > 0 ? compacted.join(" · ") : "Exercise";
}

function formatSetLabel(set: WorkoutSet) {
  if (set.set_type === "warmup") {
    return "W";
  }

  if (set.set_type === "drop") {
    return "D";
  }

  return set.set_number?.toString() ?? set.row_index.toString();
}

function formatDecimal(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return value;
  }

  return Number.isInteger(parsed) ? parsed.toString() : parsed.toFixed(2);
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
