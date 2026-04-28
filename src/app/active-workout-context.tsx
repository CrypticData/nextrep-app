"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { MAX_WORKOUT_DURATION_SECONDS } from "@/lib/workout-duration";

export type ActiveWorkoutSession = {
  id: string;
  name: string | null;
  description: string | null;
  status: "active" | "completed";
  default_weight_unit: "lbs" | "kg";
  current_exercise_name: string | null;
  started_at: string;
  ended_at: string | null;
  server_now: string;
  created_at: string;
  updated_at: string;
};

type ActiveWorkoutContextValue = {
  clear: () => void;
  consumeOpenLiveRequest: () => void;
  error: string | null;
  isLoading: boolean;
  offsetMs: number | null;
  openLiveRequest: number;
  refresh: (options?: {
    suppressError?: boolean;
  }) => Promise<ActiveWorkoutSession | null>;
  requestOpenLive: () => void;
  session: ActiveWorkoutSession | null;
  setSession: (session: ActiveWorkoutSession | null) => void;
};

const ActiveWorkoutContext = createContext<ActiveWorkoutContextValue | null>(
  null,
);

export function ActiveWorkoutProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ActiveWorkoutSession | null>(null);
  const [offsetMs, setOffsetMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [openLiveRequest, setOpenLiveRequest] = useState(0);

  const replaceSession = useCallback(
    (nextSession: ActiveWorkoutSession | null) => {
      setSession(nextSession);
      setOffsetMs(getServerClockOffsetMs(nextSession));
      setError(null);
      setHasLoaded(true);
    },
    [],
  );

  const refresh = useCallback(
    async (options: { suppressError?: boolean } = {}) => {
      if (!options.suppressError) {
        setError(null);
      }

      try {
        const activeSession = await fetchJson<ActiveWorkoutSession | null>(
          "/api/workout-sessions/active",
        );

        replaceSession(activeSession);
        return activeSession;
      } catch (refreshError) {
        if (!options.suppressError) {
          setError(getErrorMessage(refreshError));
        }

        return null;
      } finally {
        setHasLoaded(true);
      }
    },
    [replaceSession],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [refresh]);

  const value = useMemo<ActiveWorkoutContextValue>(
    () => ({
      clear: () => {
        replaceSession(null);
        setOpenLiveRequest(0);
      },
      consumeOpenLiveRequest: () => setOpenLiveRequest(0),
      error,
      isLoading: !hasLoaded,
      openLiveRequest,
      offsetMs,
      refresh,
      requestOpenLive: () =>
        setOpenLiveRequest((currentRequest) => currentRequest + 1),
      session,
      setSession: replaceSession,
    }),
    [
      error,
      hasLoaded,
      offsetMs,
      openLiveRequest,
      refresh,
      replaceSession,
      session,
    ],
  );

  return (
    <ActiveWorkoutContext.Provider value={value}>
      {children}
    </ActiveWorkoutContext.Provider>
  );
}

export function useActiveWorkout() {
  const context = useContext(ActiveWorkoutContext);

  if (!context) {
    throw new Error(
      "useActiveWorkout must be used inside ActiveWorkoutProvider.",
    );
  }

  return context;
}

export function useElapsedSeconds(startedAt: string) {
  const { offsetMs } = useActiveWorkout();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAtMs = Date.parse(startedAt);

    if (Number.isNaN(startedAtMs)) {
      const timeout = window.setTimeout(() => setElapsedSeconds(0), 0);

      return () => window.clearTimeout(timeout);
    }

    const updateElapsedSeconds = () => {
      const estimatedServerNowMs = Date.now() + (offsetMs ?? 0);

      setElapsedSeconds(
        Math.min(
          MAX_WORKOUT_DURATION_SECONDS,
          Math.max(0, Math.floor((estimatedServerNowMs - startedAtMs) / 1000)),
        ),
      );
    };

    updateElapsedSeconds();

    const interval = window.setInterval(updateElapsedSeconds, 250);

    return () => window.clearInterval(interval);
  }, [offsetMs, startedAt]);

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

function getServerClockOffsetMs(session: ActiveWorkoutSession | null) {
  if (!session) {
    return null;
  }

  const serverNowMs = Date.parse(session.server_now);

  return Number.isNaN(serverNowMs) ? null : serverNowMs - Date.now();
}
