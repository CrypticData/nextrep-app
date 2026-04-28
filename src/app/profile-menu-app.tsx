"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AppShell } from "./app-shell";

type UserProfile = {
  id: string;
  username: string;
  avatarUrl?: string | null;
  workoutCount: number;
};

type WorkoutHistoryState = "loading" | "ready" | "empty" | "unavailable";

type WorkoutHistoryCardViewModel = {
  id: string;
  title: string;
  completedAtLabel: string;
  durationLabel: string;
  volumeLabel: string;
  setCountLabel: string;
  exercises: WorkoutExercisePreview[];
};

type WorkoutExercisePreview = {
  id: string;
  name: string;
  setCount: number;
  metadataLabel: string;
  thumbnailLabel: string;
};

type CompletedWorkoutListItem = {
  id: string;
  name: string;
  description: string | null;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  default_weight_unit: "lbs" | "kg";
  recorded_set_count: number;
  volume: {
    value: number;
    unit: "lbs" | "kg";
  };
  exercises: {
    id: string;
    name: string;
    equipment_name: string | null;
    primary_muscle_group_name: string | null;
    recorded_set_count: number;
  }[];
};

type DashboardTileConfig = {
  id: string;
  label: string;
  icon: ReactNode;
  onClick?: () => void;
};

const profile: UserProfile = {
  id: "current-user",
  username: "crypticdata",
  avatarUrl: null,
  workoutCount: 0,
};

export function ProfileMenuApp() {
  const router = useRouter();
  const [workoutHistoryState, setWorkoutHistoryState] =
    useState<WorkoutHistoryState>("loading");
  const [workouts, setWorkouts] = useState<WorkoutHistoryCardViewModel[]>([]);
  const [workoutHistoryError, setWorkoutHistoryError] = useState<string | null>(
    null,
  );
  const currentProfile = useMemo(
    () => ({ ...profile, workoutCount: workouts.length }),
    [workouts.length],
  );

  useEffect(() => {
    const abortController = new AbortController();

    async function loadCompletedWorkouts() {
      setWorkoutHistoryState("loading");
      setWorkoutHistoryError(null);

      try {
        const response = await fetch("/api/workout-sessions/completed", {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(await readErrorResponse(response));
        }

        const data = (await response.json()) as CompletedWorkoutListItem[];
        const mappedWorkouts = data.map(toWorkoutHistoryCardViewModel);

        if (!abortController.signal.aborted) {
          setWorkouts(mappedWorkouts);
          setWorkoutHistoryState(
            mappedWorkouts.length > 0 ? "ready" : "empty",
          );
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          setWorkoutHistoryError(getErrorMessage(error));
          setWorkoutHistoryState("unavailable");
        }
      }
    }

    void loadCompletedWorkouts();

    return () => abortController.abort();
  }, []);

  return (
    <AppShell
      title={currentProfile.username}
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.alert("Profile editing arrives later.")}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.08] text-zinc-200 transition hover:bg-white/[0.12] active:scale-95"
            aria-label="Edit profile"
          >
            <EditIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => router.push("/profile/settings")}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.08] text-zinc-200 transition hover:bg-white/[0.12] active:scale-95"
            aria-label="Settings"
          >
            <SettingsIcon className="h-5 w-5" />
          </button>
        </div>
      }
    >
      <div className="space-y-6 pb-24">
        <ProfileSummary profile={currentProfile} />
        <DashboardSection
          onOpenExercises={() => router.push("/profile/exercises")}
          onOpenMeasures={() => router.push("/profile/measures")}
          onOpenMetrics={() => window.alert("Metrics arrive later.")}
          onOpenCalendar={() => window.alert("Calendar arrives later.")}
        />
        <WorkoutHistorySection
          errorMessage={workoutHistoryError}
          state={workoutHistoryState}
          workouts={workouts}
        />
      </div>
    </AppShell>
  );
}

function ProfileSummary({ profile }: { profile: UserProfile }) {
  return (
    <section className="flex items-center gap-4">
      <ProfileAvatar username={profile.username} avatarUrl={profile.avatarUrl} />
      <div className="min-w-0">
        <h2 className="truncate text-xl font-semibold text-white">
          {profile.username}
        </h2>
        <div className="mt-2">
          <p className="text-sm font-medium text-zinc-500">Workouts</p>
          <p className="text-lg font-semibold text-white">
            {profile.workoutCount}
          </p>
        </div>
      </div>
    </section>
  );
}

function ProfileAvatar({
  avatarUrl,
  username,
}: {
  avatarUrl?: string | null;
  username: string;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className="h-20 w-20 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-2xl font-bold text-emerald-200">
      {username.slice(0, 1).toUpperCase()}
    </div>
  );
}

function DashboardSection({
  onOpenCalendar,
  onOpenExercises,
  onOpenMeasures,
  onOpenMetrics,
}: {
  onOpenCalendar: () => void;
  onOpenExercises: () => void;
  onOpenMeasures: () => void;
  onOpenMetrics: () => void;
}) {
  const tiles = [
    {
      id: "exercises",
      label: "Exercises",
      icon: <DumbbellIcon className="h-5 w-5" />,
      onClick: onOpenExercises,
    },
    {
      id: "measures",
      label: "Measures",
      icon: <MeasuresIcon className="h-5 w-5" />,
      onClick: onOpenMeasures,
    },
    {
      id: "metrics",
      label: "Metrics",
      icon: <MetricsIcon className="h-5 w-5" />,
      onClick: onOpenMetrics,
    },
    {
      id: "calendar",
      label: "Calendar",
      icon: <CalendarIcon className="h-5 w-5" />,
      onClick: onOpenCalendar,
    },
  ] satisfies DashboardTileConfig[];

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-zinc-500">Dashboard</h2>
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <DashboardTile
            key={tile.id}
            icon={tile.icon}
            label={tile.label}
            onClick={tile.onClick}
          />
        ))}
      </div>
    </section>
  );
}

function DashboardTile({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-24 flex-col items-start justify-between rounded-2xl border border-white/[0.08] bg-[#181818] p-4 text-left transition hover:border-white/15 hover:bg-[#1d1d1d] active:scale-[0.99]"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-emerald-300">
        {icon}
      </span>
      <span className="text-base font-semibold text-white">{label}</span>
    </button>
  );
}

function WorkoutHistorySection({
  errorMessage,
  state,
  workouts,
}: {
  errorMessage: string | null;
  state: WorkoutHistoryState;
  workouts: WorkoutHistoryCardViewModel[];
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-zinc-500">Workouts</h2>
      {state === "loading" ? (
        <div className="space-y-3">
          <div className="h-32 animate-pulse rounded-2xl bg-white/[0.04]" />
          <div className="h-24 animate-pulse rounded-2xl bg-white/[0.035]" />
        </div>
      ) : null}
      {state === "ready" && workouts.length > 0 ? (
        <div className="space-y-3">
          {workouts.map((workout) => (
            <WorkoutHistoryCard key={workout.id} workout={workout} />
          ))}
        </div>
      ) : null}
      {state === "empty" || (state === "ready" && workouts.length === 0) ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-5 py-8 text-center">
          <p className="text-sm font-medium text-zinc-400">
            Saved workouts will appear here.
          </p>
        </div>
      ) : null}
      {state === "unavailable" ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/[0.06] px-5 py-4">
          <p className="text-sm font-semibold text-red-100">
            Workout history could not load.
          </p>
          <p className="mt-1 text-sm text-red-100/70">
            {errorMessage ?? "Request failed."}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function WorkoutHistoryCard({
  workout,
}: {
  workout: WorkoutHistoryCardViewModel;
}) {
  return (
    <Link
      href={`/profile/workouts/${workout.id}`}
      className="block rounded-2xl border border-white/[0.08] bg-[#181818] p-4 text-left transition hover:border-white/15 hover:bg-[#1d1d1d] active:scale-[0.99]"
      aria-label={`Open ${workout.title}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-white">
            {workout.title}
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            {workout.completedAtLabel}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white/[0.06] px-3 py-1 text-xs font-semibold text-zinc-300">
          {workout.setCountLabel}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <WorkoutMetric label="Duration" value={workout.durationLabel} />
        <WorkoutMetric label="Volume" value={workout.volumeLabel} />
      </div>
      {workout.exercises.length > 0 ? (
        <div className="mt-4 space-y-2">
          {workout.exercises.map((exercise) => (
            <WorkoutExercisePreviewRow
              exercise={exercise}
              key={exercise.id}
            />
          ))}
        </div>
      ) : null}
    </Link>
  );
}

function WorkoutMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.035] px-3 py-3">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

function WorkoutExercisePreviewRow({
  exercise,
}: {
  exercise: WorkoutExercisePreview;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/[0.035] px-3 py-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-sm font-bold text-emerald-200">
        {exercise.thumbnailLabel.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">
          {exercise.name}
        </p>
        <p className="mt-0.5 truncate text-xs font-medium text-zinc-500">
          {formatSetCount(exercise.setCount)}
          {exercise.metadataLabel ? ` · ${exercise.metadataLabel}` : ""}
        </p>
      </div>
    </div>
  );
}

function toWorkoutHistoryCardViewModel(
  workout: CompletedWorkoutListItem,
): WorkoutHistoryCardViewModel {
  return {
    id: workout.id,
    title: workout.name,
    completedAtLabel: formatDateTime(workout.ended_at),
    durationLabel: formatDuration(workout.duration_seconds),
    volumeLabel: formatVolume(workout.volume.value, workout.volume.unit),
    setCountLabel: formatSetCount(workout.recorded_set_count),
    exercises: workout.exercises.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      setCount: exercise.recorded_set_count,
      metadataLabel: compactLabels([
        exercise.equipment_name,
        exercise.primary_muscle_group_name,
      ]),
      thumbnailLabel: exercise.name,
    })),
  };
}

function compactLabels(labels: Array<string | null>) {
  return labels.filter((label): label is string => Boolean(label)).join(" · ");
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Saved workout";
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
    </svg>
  );
}

function SettingsIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.08a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.08A1.7 1.7 0 0 0 4.6 8.92a1.7 1.7 0 0 0-.34-1.87L4.2 6.99a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.08a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.04A1.7 1.7 0 0 0 21 10h.08a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function DumbbellIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden>
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

function MeasuresIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4 17 17 4l3 3L7 20H4v-3ZM14 7l3 3M5 12l2 2M9 8l2 2M13 4l2 2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function MetricsIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function CalendarIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M7 3v4M17 3v4M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
