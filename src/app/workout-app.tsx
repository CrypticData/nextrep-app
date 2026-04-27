"use client";

import { useCallback, useEffect, useState } from "react";
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
          Start an empty workout now. Exercise logging arrives in the next
          phase.
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

  return (
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

      <section className="flex min-h-[36dvh] flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.05] text-zinc-400">
          <DumbbellIcon className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-white">
          No exercises yet
        </h2>
        <p className="mt-2 max-w-64 text-sm leading-6 text-zinc-500">
          Exercises will appear here in the next phase.
        </p>
      </section>

      <button
        type="button"
        onClick={onDiscard}
        disabled={isDiscarding}
        className="h-12 w-full rounded-2xl border border-red-400/20 bg-red-500/10 px-4 text-base font-bold text-red-200 transition hover:bg-red-500/15 active:scale-[0.99] disabled:cursor-not-allowed disabled:text-red-200/50"
      >
        {isDiscarding ? "Discarding" : "Discard Workout"}
      </button>
    </div>
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

type IconProps = {
  className?: string;
};

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
