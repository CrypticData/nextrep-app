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
  active_rest_started_at: string | null;
  active_rest_duration_seconds: number | null;
  active_rest_workout_session_exercise_id: string | null;
  server_now: string;
  created_at: string;
  updated_at: string;
};

type ActiveWorkoutContextValue = {
  adjustRest: (deltaSeconds: number) => Promise<void>;
  clear: () => void;
  consumeOpenLiveRequest: () => void;
  error: string | null;
  isLoading: boolean;
  lastScrollTop: number | null;
  offsetMs: number | null;
  openLiveRequest: OpenLiveRequest;
  refresh: (options?: {
    suppressError?: boolean;
  }) => Promise<ActiveWorkoutSession | null>;
  requestOpenLive: (options?: OpenLiveRequestOptions) => void;
  session: ActiveWorkoutSession | null;
  setLastScrollTop: (scrollTop: number | null) => void;
  setSession: (session: ActiveWorkoutSession | null) => void;
  skipRest: () => Promise<void>;
  startRest: (
    workoutSessionExerciseId: string,
    durationSeconds: number,
  ) => Promise<void>;
};

type OpenLiveRequest = {
  sequence: number;
  scrollToWorkoutExerciseId: string | null;
};

type OpenLiveRequestOptions = {
  scrollToWorkoutExerciseId?: string;
};

const ActiveWorkoutContext = createContext<ActiveWorkoutContextValue | null>(
  null,
);

export function ActiveWorkoutProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ActiveWorkoutSession | null>(null);
  const [offsetMs, setOffsetMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [lastScrollTop, setLastScrollTop] = useState<number | null>(null);
  const [openLiveRequest, setOpenLiveRequest] = useState<OpenLiveRequest>({
    sequence: 0,
    scrollToWorkoutExerciseId: null,
  });

  const replaceSession = useCallback(
    (nextSession: ActiveWorkoutSession | null) => {
      const normalizedSession = normalizeExpiredRest(nextSession);

      setSession(normalizedSession);
      setOffsetMs(getServerClockOffsetMs(normalizedSession));
      setError(null);
      setHasLoaded(true);

      if (nextSession && normalizedSession !== nextSession) {
        void fetch(`/api/workout-sessions/${nextSession.id}/rest`, {
          method: "DELETE",
        }).catch(() => undefined);
      }
    },
    [],
  );

  const updateRest = useCallback((rest: ActiveRestResponse) => {
    setSession((currentSession) => {
      if (!currentSession) {
        return currentSession;
      }

      setOffsetMs(getServerClockOffsetMsFromValue(rest.server_now));

      return {
        ...currentSession,
        active_rest_started_at: rest.active_rest_started_at,
        active_rest_duration_seconds: rest.active_rest_duration_seconds,
        active_rest_workout_session_exercise_id:
          rest.active_rest_workout_session_exercise_id,
        server_now: rest.server_now,
      };
    });
  }, []);

  const startRest = useCallback(
    async (workoutSessionExerciseId: string, durationSeconds: number) => {
      if (!session) {
        return;
      }

      const rest = await fetchJson<ActiveRestResponse>(
        `/api/workout-sessions/${session.id}/rest`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workout_session_exercise_id: workoutSessionExerciseId,
            duration_seconds: durationSeconds,
          }),
        },
      );

      updateRest(rest);
    },
    [session, updateRest],
  );

  const adjustRest = useCallback(
    async (deltaSeconds: number) => {
      if (!session) {
        return;
      }

      const rest = await fetchJson<ActiveRestResponse>(
        `/api/workout-sessions/${session.id}/rest`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delta_seconds: deltaSeconds }),
        },
      );

      updateRest(rest);
    },
    [session, updateRest],
  );

  const skipRest = useCallback(async () => {
    if (!session) {
      return;
    }

    const rest = await fetchJson<ActiveRestResponse>(
      `/api/workout-sessions/${session.id}/rest`,
      { method: "DELETE" },
    );

    updateRest(rest);
  }, [session, updateRest]);

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
      adjustRest,
      clear: () => {
        replaceSession(null);
        setOpenLiveRequest({
          sequence: 0,
          scrollToWorkoutExerciseId: null,
        });
        setLastScrollTop(null);
      },
      consumeOpenLiveRequest: () =>
        setOpenLiveRequest((currentRequest) => ({
          ...currentRequest,
          sequence: 0,
          scrollToWorkoutExerciseId: null,
        })),
      error,
      isLoading: !hasLoaded,
      lastScrollTop,
      openLiveRequest,
      offsetMs,
      refresh,
      requestOpenLive: (options = {}) =>
        setOpenLiveRequest((currentRequest) => ({
          sequence: currentRequest.sequence + 1,
          scrollToWorkoutExerciseId:
            options.scrollToWorkoutExerciseId ?? null,
        })),
      session,
      setLastScrollTop,
      setSession: replaceSession,
      skipRest,
      startRest,
    }),
    [
      adjustRest,
      error,
      hasLoaded,
      lastScrollTop,
      offsetMs,
      openLiveRequest,
      refresh,
      replaceSession,
      session,
      skipRest,
      startRest,
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

export function useRestTimerRemainingSeconds() {
  const { offsetMs, session } = useActiveWorkout();
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    if (
      !session?.active_rest_started_at ||
      !session.active_rest_duration_seconds
    ) {
      const timeout = window.setTimeout(() => setRemainingSeconds(0), 0);

      return () => window.clearTimeout(timeout);
    }

    const startedAtMs = Date.parse(session.active_rest_started_at);
    const durationSeconds = session.active_rest_duration_seconds;

    if (Number.isNaN(startedAtMs)) {
      const timeout = window.setTimeout(() => setRemainingSeconds(0), 0);

      return () => window.clearTimeout(timeout);
    }

    const updateRemainingSeconds = () => {
      const estimatedServerNowMs = Date.now() + (offsetMs ?? 0);
      const elapsedSeconds = Math.floor(
        (estimatedServerNowMs - startedAtMs) / 1000,
      );

      setRemainingSeconds(
        Math.max(0, durationSeconds - elapsedSeconds),
      );
    };

    updateRemainingSeconds();

    const interval = window.setInterval(updateRemainingSeconds, 250);

    return () => window.clearInterval(interval);
  }, [
    offsetMs,
    session?.active_rest_duration_seconds,
    session?.active_rest_started_at,
  ]);

  return remainingSeconds;
}

type ActiveRestResponse = {
  server_now: string;
  active_rest_started_at: string | null;
  active_rest_duration_seconds: number | null;
  active_rest_workout_session_exercise_id: string | null;
};

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

  return getServerClockOffsetMsFromValue(session.server_now);
}

function getServerClockOffsetMsFromValue(serverNow: string) {
  const serverNowMs = Date.parse(serverNow);

  return Number.isNaN(serverNowMs) ? null : serverNowMs - Date.now();
}

function normalizeExpiredRest(session: ActiveWorkoutSession | null) {
  if (
    !session?.active_rest_started_at ||
    !session.active_rest_duration_seconds
  ) {
    return session;
  }

  const startedAtMs = Date.parse(session.active_rest_started_at);
  const serverNowMs = Date.parse(session.server_now);

  if (Number.isNaN(startedAtMs) || Number.isNaN(serverNowMs)) {
    return session;
  }

  const elapsedSeconds = Math.floor((serverNowMs - startedAtMs) / 1000);

  if (elapsedSeconds < session.active_rest_duration_seconds) {
    return session;
  }

  return {
    ...session,
    active_rest_started_at: null,
    active_rest_duration_seconds: null,
    active_rest_workout_session_exercise_id: null,
  };
}
