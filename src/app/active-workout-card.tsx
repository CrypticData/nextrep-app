"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useActiveWorkout, useElapsedSeconds } from "./active-workout-context";
import type { ActiveWorkoutSession } from "./active-workout-context";
import { ConfirmSheet } from "./confirm-sheet";
import { MAX_WORKOUT_DURATION_SECONDS } from "@/lib/workout-duration";

export function ActiveWorkoutCard({
  session,
}: {
  session: ActiveWorkoutSession;
}) {
  const router = useRouter();
  const { clear, requestOpenLive } = useActiveWorkout();
  const elapsedSeconds = useElapsedSeconds(session.started_at);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);

  useEffect(() => {
    if (elapsedSeconds >= MAX_WORKOUT_DURATION_SECONDS) {
      requestOpenLive();
      router.push("/");
    }
  }, [elapsedSeconds, requestOpenLive, router]);

  function openLiveWorkout() {
    requestOpenLive();
    router.push("/");
  }

  async function discardWorkout() {
    setIsDiscarding(true);
    setDiscardError(null);

    try {
      const response = await fetch(
        `/api/workout-sessions/${session.id}/discard`,
        { method: "POST" },
      );

      if (!response.ok) {
        throw new Error(await readErrorResponse(response));
      }

      clear();
      setIsConfirmOpen(false);
    } catch (error) {
      setDiscardError(getErrorMessage(error));
    } finally {
      setIsDiscarding(false);
    }
  }

  return (
    <>
      <div className="safe-floating-card shrink-0 pb-2 pt-1">
        <section className="grid min-h-[72px] grid-cols-[minmax(0,1fr)_40px] items-center gap-3 rounded-2xl bg-[#181818] px-3.5 py-3 ring-1 ring-white/10">
          <button
            type="button"
            onClick={openLiveWorkout}
            className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)] items-center gap-3 text-left transition active:scale-[0.99]"
            aria-label="Resume active workout"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-zinc-100">
              <ChevronUpIcon className="h-5 w-5" />
            </span>

            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400" />
                <span className="shrink-0 text-sm font-semibold text-white">
                  Workout
                </span>
                <span className="min-w-0 truncate font-mono text-sm font-semibold text-zinc-300">
                  {formatElapsedShort(elapsedSeconds)}
                </span>
              </span>
              <span className="mt-1 block truncate text-sm font-medium text-zinc-500">
                {session.current_exercise_name ?? "No exercise"}
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setDiscardError(null);
              setIsConfirmOpen(true);
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-400 transition active:scale-95"
            aria-label="Discard active workout"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        </section>
      </div>

      {isConfirmOpen ? (
        <ConfirmSheet
          confirmLabel="Discard Workout"
          confirmingLabel="Discarding"
          description="Your in-progress sets and exercises will be deleted."
          error={discardError}
          isConfirming={isDiscarding}
          onCancel={() => {
            if (!isDiscarding) {
              setIsConfirmOpen(false);
              setDiscardError(null);
            }
          }}
          onConfirm={() => void discardWorkout()}
          title="Discard this active workout?"
        />
      ) : null}
    </>
  );
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

function formatElapsedShort(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

type IconProps = {
  className?: string;
};

function ChevronUpIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="m5 16 7-7 7 7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
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
