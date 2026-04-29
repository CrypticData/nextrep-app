"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/app/app-shell";
import { ConfirmSheet } from "@/app/confirm-sheet";
import { ExerciseThumb } from "@/app/exercise-thumb";
import { useToast } from "@/app/toast";

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
  const toast = useToast();
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
        toast.success("Workout deleted");
        router.push("/profile");
        return;
      }

      throw new Error(await readErrorResponse(response));
    } catch (error) {
      const message = getErrorMessage(error);
      setDeleteError(message);
      toast.error(message);
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
      mainClassName="safe-main-x pb-8 pt-4"
      subpage
      title={workout?.name ?? "Workout Details"}
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
          onRetry={() => void handleDeleteWorkout()}
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
    <div className="space-y-5">
      <dl className="grid grid-cols-3 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#1a1a1a]">
        <WorkoutDetailStat
          label="Duration"
          value={formatDuration(workout.duration_seconds)}
        />
        <WorkoutDetailStat
          label="Volume"
          value={formatVolume(workout.volume.value, workout.volume.unit)}
        />
        <WorkoutDetailStat
          isLast
          label="Started"
          value={formatDateTime(workout.started_at)}
        />
      </dl>

      {workout.description ? (
        <p className="whitespace-pre-wrap text-[13px] leading-[1.6] text-zinc-500">
          {workout.description}
        </p>
      ) : null}

      <section>
        <h2 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.09em] text-zinc-500">
          Exercises
        </h2>
        <div className="space-y-5">
          {workout.exercises.map((exercise) => (
            <ExerciseSection exercise={exercise} key={exercise.id} />
          ))}
        </div>
      </section>
    </div>
  );
}

function WorkoutDetailStat({
  isLast = false,
  label,
  value,
}: {
  isLast?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div
      className={`min-w-0 px-3 py-3.5 text-center ${
        isLast ? "" : "border-r border-white/[0.06]"
      }`}
    >
      <dt className="text-[10px] font-semibold uppercase tracking-[0.07em] text-zinc-600">
        {label}
      </dt>
      <dd className="mt-1 truncate text-[13px] font-bold leading-tight text-white">
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
  const thumbName =
    exercise.primary_muscle_group_name_snapshot ??
    exercise.exercise_name_snapshot;

  return (
    <article>
      <div className="mb-2.5 flex items-center gap-3">
        <ExerciseThumb name={thumbName} size="sm" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-bold text-white">
            {exercise.exercise_name_snapshot}
          </h3>
          {exercise.notes ? (
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {exercise.notes}
            </p>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-[14px] border border-white/[0.08] bg-[#1a1a1a]">
        <div className="flex items-center border-b border-white/[0.06] px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.07em] text-zinc-600">
          <div className="w-8 shrink-0">Set</div>
          <div className="min-w-0 flex-1">Weight &amp; Reps</div>
        </div>
        {exercise.sets.map((set) => (
          <SetRow
            exercise={exercise}
            isLast={set.id === exercise.sets[exercise.sets.length - 1]?.id}
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
  isLast,
  set,
}: {
  exercise: CompletedWorkoutExercise;
  isLast: boolean;
  set: CompletedWorkoutSet;
}) {
  return (
    <div
      className={`flex items-center px-3.5 py-2.5 ${
        isLast ? "" : "border-b border-white/[0.06]"
      }`}
    >
      <div
        className={`w-8 shrink-0 text-sm font-bold ${getSetLabelClassName(set.set_type)}`}
      >
        {formatSetLabel(set)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-zinc-50">
          {formatSetSummary(set, exercise.exercise_type)}
        </p>
      </div>
    </div>
  );
}

function WorkoutDetailSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1a]">
        {[0, 1, 2].map((index) => (
          <div
            className={`px-3 py-3.5 ${
              index === 2 ? "" : "border-r border-white/[0.06]"
            }`}
            key={index}
          >
            <div className="mx-auto h-2.5 w-12 animate-pulse rounded bg-white/[0.06]" />
            <div className="mx-auto mt-2 h-3.5 w-16 animate-pulse rounded bg-white/[0.08]" />
          </div>
        ))}
      </div>
      <div className="h-10 w-full animate-pulse rounded-lg bg-white/[0.035]" />
      <div className="space-y-5">
        {[0, 1, 2].map((index) => (
          <div className="space-y-2.5" key={index}>
            <div className="flex items-center gap-3">
              <div className="h-[42px] w-[42px] animate-pulse rounded-full bg-white/[0.06]" />
              <div className="min-w-0 flex-1">
                <div className="h-4 w-3/5 animate-pulse rounded bg-white/[0.06]" />
                <div className="mt-2 h-3 w-2/5 animate-pulse rounded bg-white/[0.04]" />
              </div>
            </div>
            <div className="h-32 animate-pulse rounded-[14px] border border-white/[0.06] bg-white/[0.035]" />
          </div>
        ))}
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
  const baseSummary = `${formatSetLoad(set, exerciseType)} × ${set.reps}`;

  if (set.rpe === null) {
    return baseSummary;
  }

  return `${baseSummary} @ ${formatDecimal(set.rpe)} RPE`;
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

  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
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
