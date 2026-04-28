"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/app/app-shell";

type ExerciseType =
  | "weight_reps"
  | "bodyweight_reps"
  | "weighted_bodyweight"
  | "assisted_bodyweight";

type CompletedWorkoutDetail = {
  id: string;
  name: string;
  description: string | null;
  status: "completed";
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  default_weight_unit: "lbs" | "kg";
  recorded_set_count: number;
  volume: {
    value: number;
    unit: "lbs" | "kg";
  };
  exercises: CompletedWorkoutExercise[];
};

type CompletedWorkoutExercise = {
  id: string;
  order_index: number;
  exercise_name_snapshot: string;
  equipment_name_snapshot: string | null;
  primary_muscle_group_name_snapshot: string | null;
  input_weight_unit: "lbs" | "kg" | null;
  exercise_type: ExerciseType | null;
  recorded_set_count: number;
  sets: CompletedWorkoutSet[];
};

type CompletedWorkoutSet = {
  id: string;
  row_index: number;
  set_number: number | null;
  set_type: "normal" | "warmup" | "failure" | "drop";
  weight: number | null;
  weight_unit: "lbs" | "kg" | null;
  reps: number;
  rpe: number | null;
  checked: boolean;
  checked_at: string | null;
};

type LoadState = "loading" | "ready" | "error";

export function SavedWorkoutDetailApp({ workoutId }: { workoutId: string }) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [workout, setWorkout] = useState<CompletedWorkoutDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadRequest, setReloadRequest] = useState(0);

  useEffect(() => {
    const abortController = new AbortController();

    async function loadWorkout() {
      setLoadState("loading");
      setErrorMessage(null);

      try {
        const response = await fetch(`/api/workout-sessions/${workoutId}`, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(await readErrorResponse(response));
        }

        const data = (await response.json()) as CompletedWorkoutDetail;

        if (!abortController.signal.aborted) {
          setWorkout(data);
          setLoadState("ready");
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          setErrorMessage(getErrorMessage(error));
          setLoadState("error");
        }
      }
    }

    void loadWorkout();

    return () => abortController.abort();
  }, [reloadRequest, workoutId]);

  return (
    <AppShell
      backHref="/profile"
      mainClassName="px-5 pb-24 pt-4"
      subpage
      title={workout?.name ?? "Workout"}
    >
      {loadState === "loading" ? <WorkoutDetailSkeleton /> : null}

      {loadState === "error" ? (
        <WorkoutDetailError
          message={errorMessage ?? "Workout could not load."}
          onRetry={() => {
            setWorkout(null);
            setLoadState("loading");
            setReloadRequest((request) => request + 1);
          }}
        />
      ) : null}

      {loadState === "ready" && workout ? (
        <WorkoutDetail workout={workout} />
      ) : null}
    </AppShell>
  );
}

function WorkoutDetail({ workout }: { workout: CompletedWorkoutDetail }) {
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/[0.08] bg-[#181818] p-4">
        <h2 className="text-xl font-semibold text-white">{workout.name}</h2>
        {workout.description ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
            {workout.description}
          </p>
        ) : null}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <MetadataTile label="Started" value={formatDateTime(workout.started_at)} />
          <MetadataTile label="Completed" value={formatDateTime(workout.ended_at)} />
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2">
        <SummaryTile label="Duration" value={formatDuration(workout.duration_seconds)} />
        <SummaryTile
          label="Volume"
          value={formatVolume(workout.volume.value, workout.volume.unit)}
        />
        <SummaryTile label="Sets" value={workout.recorded_set_count.toString()} />
      </section>

      <section className="space-y-3">
        {workout.exercises.map((exercise) => (
          <ExerciseSection exercise={exercise} key={exercise.id} />
        ))}
      </section>
    </div>
  );
}

function MetadataTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.035] px-3 py-3">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#181818] px-3 py-4">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-1 truncate text-base font-semibold text-white">{value}</p>
    </div>
  );
}

function ExerciseSection({
  exercise,
}: {
  exercise: CompletedWorkoutExercise;
}) {
  return (
    <article className="rounded-2xl border border-white/[0.08] bg-[#181818] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-white">
            {exercise.exercise_name_snapshot}
          </h3>
          <p className="mt-1 truncate text-xs font-medium text-zinc-500">
            {compactLabels([
              exercise.equipment_name_snapshot,
              exercise.primary_muscle_group_name_snapshot,
            ])}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white/[0.06] px-3 py-1 text-xs font-semibold text-zinc-300">
          {formatSetCount(exercise.recorded_set_count)}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {exercise.sets.map((set) => (
          <SetRow exercise={exercise} key={set.id} set={set} />
        ))}
      </div>
    </article>
  );
}

function SetRow({
  exercise,
  set,
}: {
  exercise: CompletedWorkoutExercise;
  set: CompletedWorkoutSet;
}) {
  return (
    <div className="grid min-h-14 grid-cols-[44px_1fr_58px_52px] items-center gap-2 rounded-xl bg-white/[0.035] px-3 py-2">
      <div>
        <p className={`text-sm font-bold ${getSetLabelClassName(set.set_type)}`}>
          {formatSetLabel(set)}
        </p>
        {set.set_type === "normal" ? null : (
          <p className="mt-0.5 text-[10px] font-semibold uppercase text-zinc-500">
            {formatSetType(set.set_type)}
          </p>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-zinc-100">
          {formatSetLoad(set, exercise.exercise_type)}
        </p>
        <p className="mt-0.5 text-xs font-medium text-zinc-500">
          row {set.row_index}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-white">{set.reps}</p>
        <p className="mt-0.5 text-[10px] font-semibold uppercase text-zinc-500">
          reps
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-zinc-200">
          {set.rpe === null ? "-" : formatDecimal(set.rpe)}
        </p>
        <p className="mt-0.5 text-[10px] font-semibold uppercase text-zinc-500">
          RPE
        </p>
      </div>
    </div>
  );
}

function WorkoutDetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-24 animate-pulse rounded-2xl bg-white/[0.04]" />
      <div className="grid grid-cols-3 gap-2">
        <div className="h-20 animate-pulse rounded-2xl bg-white/[0.035]" />
        <div className="h-20 animate-pulse rounded-2xl bg-white/[0.035]" />
        <div className="h-20 animate-pulse rounded-2xl bg-white/[0.035]" />
      </div>
      <div className="h-48 animate-pulse rounded-2xl bg-white/[0.04]" />
    </div>
  );
}

function WorkoutDetailError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-2xl border border-red-400/20 bg-red-500/[0.06] px-5 py-4">
      <p className="text-sm font-semibold text-red-100">
        Saved workout could not load.
      </p>
      <p className="mt-1 text-sm text-red-100/70">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-xl bg-red-100 px-4 py-2 text-sm font-semibold text-red-950 transition active:scale-[0.98]"
      >
        Retry
      </button>
    </div>
  );
}

function compactLabels(labels: Array<string | null>) {
  const compacted = labels.filter((label): label is string => Boolean(label));

  return compacted.length > 0 ? compacted.join(" · ") : "Exercise";
}

function formatSetLabel(set: CompletedWorkoutSet) {
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

function formatSetType(setType: CompletedWorkoutSet["set_type"]) {
  if (setType === "warmup") {
    return "Warmup";
  }

  if (setType === "failure") {
    return "Failure";
  }

  if (setType === "drop") {
    return "Drop";
  }

  return "Set";
}

function getSetLabelClassName(setType: CompletedWorkoutSet["set_type"]) {
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

function formatSetLoad(
  set: CompletedWorkoutSet,
  exerciseType: ExerciseType | null,
) {
  if (set.weight !== null && set.weight_unit) {
    return `${formatDecimal(set.weight)} ${set.weight_unit}`;
  }

  if (exerciseType === "bodyweight_reps") {
    return "Bodyweight";
  }

  return "No weight";
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return `${Math.max(0, totalSeconds)}s`;
}

function formatVolume(value: number, unit: "lbs" | "kg") {
  return `${formatDecimal(value)} ${unit}`;
}

function formatDecimal(value: number) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

function formatSetCount(count: number) {
  return `${count} ${count === 1 ? "set" : "sets"}`;
}

async function readErrorResponse(response: Response) {
  try {
    const data: unknown = await response.json();

    if (
      typeof data === "object" &&
      data !== null &&
      !Array.isArray(data) &&
      "error" in data &&
      typeof data.error === "string"
    ) {
      return data.error;
    }
  } catch {
    return response.statusText || "Request failed.";
  }

  return response.statusText || "Request failed.";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
