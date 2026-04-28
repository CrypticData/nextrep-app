"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/app/app-shell";
import { ConfirmSheet } from "@/app/confirm-sheet";

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
  notes: string | null;
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
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [workout, setWorkout] = useState<CompletedWorkoutDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadRequest, setReloadRequest] = useState(0);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleEditWorkout() {
    setIsActionsOpen(false);
    router.push(`/profile/workouts/${workoutId}/edit`);
  }

  function handleRequestDelete() {
    setIsActionsOpen(false);
    setDeleteError(null);
    setIsConfirmDeleteOpen(true);
  }

  async function handleDeleteWorkout() {
    if (isDeleting) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/workout-sessions/${workoutId}`, {
        method: "DELETE",
      });

      if (response.status === 204) {
        router.push("/profile");
        return;
      }

      throw new Error(await readErrorResponse(response));
    } catch (error) {
      setDeleteError(getErrorMessage(error));
      setIsDeleting(false);
    }
  }

  function handleCancelDelete() {
    if (isDeleting) {
      return;
    }

    setDeleteError(null);
    setIsConfirmDeleteOpen(false);
  }

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
      action={
        <button
          type="button"
          onClick={() => setIsActionsOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.06] text-zinc-200 transition active:scale-95"
          aria-label="Workout actions"
        >
          <EditIcon className="h-5 w-5" />
        </button>
      }
      backHref="/profile"
      mainClassName="safe-main-x pb-6 pt-4"
      subpage
      title="Workout Details"
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

      {isActionsOpen ? (
        <WorkoutActionsSheet
          onCancel={() => setIsActionsOpen(false)}
          onDelete={handleRequestDelete}
          onEdit={handleEditWorkout}
        />
      ) : null}

      {isConfirmDeleteOpen ? (
        <ConfirmSheet
          confirmLabel="Delete"
          confirmingLabel="Deleting"
          description="This permanently removes the workout, including all logged exercises and sets. This can't be undone."
          error={deleteError}
          isConfirming={isDeleting}
          onCancel={handleCancelDelete}
          onConfirm={() => void handleDeleteWorkout()}
          title="Delete this workout?"
        />
      ) : null}
    </AppShell>
  );
}

function WorkoutActionsSheet({
  onCancel,
  onDelete,
  onEdit,
}: {
  onCancel: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="safe-sheet fixed inset-0 z-50 flex items-end justify-center bg-black/60">
      <button
        type="button"
        aria-label="Close workout actions"
        className="absolute inset-0 cursor-default"
        onClick={onCancel}
      />
      <section className="safe-sheet-panel confirm-sheet-in relative w-full max-w-md rounded-t-3xl border border-white/10 bg-[#141414] px-5 pb-5 shadow-2xl shadow-black">
        <div className="flex justify-center py-3">
          <div className="h-1 w-9 rounded-full bg-white/15" />
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={onEdit}
            className="flex h-14 w-full items-center gap-3 rounded-2xl bg-white/[0.06] px-4 text-left text-base font-bold text-white transition active:scale-[0.99]"
          >
            <EditIcon className="h-5 w-5 text-zinc-300" />
            <span>Edit workout</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex h-14 w-full items-center gap-3 rounded-2xl bg-red-500/10 px-4 text-left text-base font-bold text-red-300 ring-1 ring-red-500/20 transition active:scale-[0.99]"
          >
            <XIcon className="h-5 w-5" />
            <span>Delete workout</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function WorkoutDetail({ workout }: { workout: CompletedWorkoutDetail }) {
  return (
    <div className="space-y-6">
      <section className="border-b border-white/[0.06] pb-5">
        <h2 className="text-lg font-bold leading-tight text-white">
          {workout.name}
        </h2>
        {workout.description ? (
          <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-zinc-500">
            {workout.description}
          </p>
        ) : null}
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          <WorkoutDetailMetric
            label="Started"
            value={formatDateTime(workout.started_at)}
          />
          <WorkoutDetailMetric
            label="Completed"
            value={formatDateTime(workout.ended_at)}
          />
          <WorkoutDetailMetric
            label="Duration"
            value={formatDuration(workout.duration_seconds)}
          />
          <WorkoutDetailMetric
            label="Volume"
            value={formatVolume(workout.volume.value, workout.volume.unit)}
          />
        </dl>
      </section>
      {workout.exercises.map((exercise) => (
        <ExerciseSection exercise={exercise} key={exercise.id} />
      ))}
    </div>
  );
}

function WorkoutDetailMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-semibold text-zinc-200">
        {value}
      </dd>
    </div>
  );
}

function ExerciseSection({
  exercise,
}: {
  exercise: CompletedWorkoutExercise;
}) {
  return (
    <article className="border-b border-white/[0.06] pb-5 last:border-b-0">
      <div className="space-y-3">
        <h2 className="text-lg font-bold leading-tight text-white">
          {exercise.exercise_name_snapshot}
        </h2>
        {exercise.notes ? (
          <p className="whitespace-pre-wrap text-xs leading-5 text-zinc-500">
            {exercise.notes}
          </p>
        ) : null}
        <div className="grid grid-cols-[64px_1fr] items-center gap-3 px-1 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
          <span>Set</span>
          <span>Weight &amp; Reps</span>
        </div>
      </div>

      <div className="mt-2">
        {exercise.sets.map((set) => (
          <SetRow
            exercise={exercise}
            key={set.id}
            set={set}
          />
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
    <div className="grid min-h-12 grid-cols-[64px_1fr] items-center gap-3 px-1 py-2">
      <div className={`text-base font-bold ${getSetLabelClassName(set.set_type)}`}>
        {formatSetLabel(set)}
      </div>
      <div className="min-w-0">
        <p className="truncate text-base font-medium text-zinc-100">
          {formatSetSummary(set, exercise.exercise_type)}
        </p>
      </div>
    </div>
  );
}

function WorkoutDetailSkeleton() {
  return (
    <div className="space-y-10">
      <div className="space-y-5">
        <div className="h-8 w-4/5 animate-pulse rounded-lg bg-white/[0.05]" />
        <div className="h-4 w-2/5 animate-pulse rounded-lg bg-white/[0.04]" />
        <div className="h-40 animate-pulse bg-white/[0.035]" />
      </div>
      <div className="space-y-5">
        <div className="h-8 w-3/4 animate-pulse rounded-lg bg-white/[0.05]" />
        <div className="h-56 animate-pulse bg-white/[0.035]" />
      </div>
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

function formatSetSummary(
  set: CompletedWorkoutSet,
  exerciseType: ExerciseType | null,
) {
  const baseSummary = `${formatSetLoad(set, exerciseType)} x ${set.reps}`;

  if (set.rpe === null) {
    return baseSummary;
  }

  return `${baseSummary} @ ${formatDecimal(set.rpe)} rpe`;
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

type IconProps = {
  className?: string;
};

function EditIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="m13.5 6.5 4 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function XIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
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
