"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS as DndCSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useActiveWorkout, useElapsedSeconds } from "./active-workout-context";
import type { ActiveWorkoutSession } from "./active-workout-context";
import { AppShell } from "./app-shell";
import { ConfirmSheet } from "./confirm-sheet";
import { ExerciseThumb } from "./exercise-thumb";
import {
  TOP_BAR_BORDER_CLASS,
  TOP_BAR_ROW_CLASS,
  TOP_BAR_TITLE_CLASS,
} from "./top-bar";
import { useToast } from "./toast";
import {
  WorkoutMetadataHeader,
  WorkoutMetadataSection,
} from "./workout-metadata-ui";
import {
  MAX_WORKOUT_DURATION_SECONDS,
  clampWorkoutDurationSeconds,
  durationInputsToSeconds,
  formatRoundedDuration,
  toVisibleDurationParts,
} from "@/lib/workout-duration";
import type { ExerciseType } from "@/generated/prisma/enums";
import {
  getWeightColumnLabel,
  getWeightInputLabel,
  hasWeightInput,
  storesInputWeightUnit,
  usesBodyweight,
} from "@/lib/exercise-type";
import { HttpError } from "@/lib/http-error";
import { useSaveQueue } from "@/lib/save-queue";
import { formatSetLabel, getSetLabelClassName } from "@/lib/set-display";

type WorkoutScreen = "start" | "live" | "save";
type WorkoutSession = ActiveWorkoutSession;

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
  rest_seconds: number | null;
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

type SetDirtyField = keyof WorkoutSetPatch;

type FinishValidationResponse =
  | { can_continue: true }
  | {
      can_continue: false;
      reason: "no_recorded_sets" | "not_active";
    }
  | {
      can_continue: false;
      reason: "invalid_weighted_sets";
      invalid_set_count: number;
    };

type SaveWorkoutDraft = {
  name: string;
  description: string;
  startedAtLocal: string;
  durationHours: number;
  durationMinutes: number;
  durationSecondsRemainder: number;
  summary: {
    durationSeconds: number;
    recordedSetCount: number;
    volumeValue: number;
    volumeUnit: "lbs" | "kg";
  };
};

type SortableHandleProps = {
  attributes: ReturnType<typeof useSortable>["attributes"];
  isDragging: boolean;
  listeners: ReturnType<typeof useSortable>["listeners"];
  setActivatorNodeRef: ReturnType<typeof useSortable>["setActivatorNodeRef"];
};

const SET_SAVE_DEBOUNCE_MS = 350;
const EXERCISE_NOTES_SAVE_DEBOUNCE_MS = 800;
const LBS_PER_KG = 2.2046226218;
const REST_TIMER_ROW_HEIGHT = 40;
const REST_TIMER_VISIBLE_ROWS = 3;
const REST_TIMER_PICKER_HEIGHT =
  REST_TIMER_ROW_HEIGHT * REST_TIMER_VISIBLE_ROWS;
const REST_TIMER_SELECTED_ROW_OFFSET =
  (REST_TIMER_PICKER_HEIGHT - REST_TIMER_ROW_HEIGHT) / 2;

export function WorkoutApp() {
  const toast = useToast();
  const {
    clear,
    consumeOpenLiveRequest,
    error: activeWorkoutError,
    isLoading,
    openLiveRequest,
    refresh,
    session,
    setSession,
  } = useActiveWorkout();
  const [screen, setScreen] = useState<WorkoutScreen>("start");
  const [scrollToWorkoutExerciseId, setScrollToWorkoutExerciseId] = useState<
    string | null
  >(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [isDiscardSheetOpen, setIsDiscardSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [saveWorkoutDraft, setSaveWorkoutDraft] =
    useState<SaveWorkoutDraft | null>(null);

  useEffect(() => {
    if (openLiveRequest.sequence > 0 && session) {
      const timeout = window.setTimeout(() => {
        setScrollToWorkoutExerciseId(
          openLiveRequest.scrollToWorkoutExerciseId,
        );
        setScreen("live");
        consumeOpenLiveRequest();
      }, 0);

      return () => window.clearTimeout(timeout);
    }
  }, [consumeOpenLiveRequest, openLiveRequest, session]);

  useEffect(() => {
    if (!session && (screen === "live" || screen === "save")) {
      const timeout = window.setTimeout(() => setScreen("start"), 0);

      return () => window.clearTimeout(timeout);
    }
  }, [screen, session]);

  useEffect(() => {
    if (screen === "save" && !saveWorkoutDraft) {
      const timeout = window.setTimeout(() => setScreen("live"), 0);

      return () => window.clearTimeout(timeout);
    }
  }, [saveWorkoutDraft, screen]);

  async function handleStartWorkout() {
    setIsStarting(true);
    setError(null);
    setSuccessMessage(null);
    setSaveWorkoutDraft(null);

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

      clear();
      setIsDiscardSheetOpen(false);
      setScreen("start");
      setSuccessMessage(null);
      setSaveWorkoutDraft(null);
      toast.success("Workout discarded");
    } catch (discardError) {
      const message = getErrorMessage(discardError);
      setError(message);
      toast.error(message);
    } finally {
      setIsDiscarding(false);
    }
  }

  function handleWorkoutSaved() {
    clear();
    setScreen("start");
    setSaveWorkoutDraft(null);
    setSuccessMessage("Workout saved");
    toast.success("Workout saved");
  }

  const isActiveWorkoutScreen = screen === "live" || screen === "save";
  const blockingError = activeWorkoutError ?? error;

  return (
    <AppShell
      hideBottomNav={isActiveWorkoutScreen}
      hideFloatingCard={isActiveWorkoutScreen}
      hideHeader={isActiveWorkoutScreen}
      hideRestTimer={screen === "save"}
      mainClassName={isActiveWorkoutScreen ? "safe-main-x pb-6 pt-0" : undefined}
      showRestTimer={screen === "live"}
      title={isActiveWorkoutScreen ? "Log Workout" : "Workout"}
    >
      {isLoading ? <WorkoutLoading /> : null}

      {!isLoading && blockingError ? (
        <WorkoutError message={blockingError} onRetry={() => void refresh()} />
      ) : null}

      {!isLoading && !blockingError && screen === "live" && session ? (
        <LiveWorkout
          isDiscarding={isDiscarding}
          onReadyToSave={(draft) => {
            setSaveWorkoutDraft(draft);
            setScreen("save");
          }}
          onMinimize={() => setScreen("start")}
          onDiscard={() => {
            setError(null);
            setIsDiscardSheetOpen(true);
          }}
          onScrollToWorkoutExerciseHandled={() =>
            setScrollToWorkoutExerciseId(null)
          }
          scrollToWorkoutExerciseId={scrollToWorkoutExerciseId}
          session={session}
        />
      ) : null}

      {!isLoading &&
      !blockingError &&
      screen === "save" &&
      session &&
      saveWorkoutDraft ? (
        <SaveWorkoutScreen
          draft={saveWorkoutDraft}
          isDiscarding={isDiscarding}
          onBack={() => setScreen("live")}
          onDiscard={() => {
            setError(null);
            setIsDiscardSheetOpen(true);
          }}
          onSaved={handleWorkoutSaved}
          session={session}
        />
      ) : null}

      {!isLoading && !blockingError && screen === "start" ? (
        <StartWorkout
          disabled={session !== null}
          helperText={
            session
              ? "You have a workout in progress — tap the card below to resume."
              : undefined
          }
          isStarting={isStarting}
          onStart={() => void handleStartWorkout()}
          successMessage={successMessage}
        />
      ) : null}

      {isDiscardSheetOpen ? (
        <ConfirmSheet
          confirmLabel="Discard Workout"
          confirmingLabel="Discarding"
          description="Your in-progress sets and exercises will be deleted."
          error={error}
          isConfirming={isDiscarding}
          onCancel={() => {
            if (!isDiscarding) {
              setIsDiscardSheetOpen(false);
              setError(null);
            }
          }}
          onConfirm={() => void handleDiscardWorkout()}
          onRetry={() => void handleDiscardWorkout()}
          title="Discard this active workout?"
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
  disabled,
  helperText,
  isStarting,
  onStart,
  successMessage,
}: {
  disabled: boolean;
  helperText?: string;
  isStarting: boolean;
  onStart: () => void;
  successMessage: string | null;
}) {
  return (
    <div className="flex min-h-[58dvh] flex-col justify-center">
      {successMessage ? (
        <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100">
          {successMessage}
        </div>
      ) : null}
      <section className="rounded-3xl border border-white/10 bg-[#181818] p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
          <PlayIcon className="h-7 w-7" />
        </div>
        <h2 className="mt-5 text-2xl font-semibold tracking-normal text-white">
          Ready to train?
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          {helperText ??
            "Start a workout, then add exercises from your library as you train."}
        </p>
        <button
          type="button"
          onClick={onStart}
          disabled={disabled || isStarting}
          className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 text-base font-bold text-white shadow-lg shadow-emerald-950/50 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          <PlayIcon className="h-5 w-5" />
          {isStarting ? "Starting" : "Start Empty Workout"}
        </button>
      </section>
    </div>
  );
}

function LiveWorkout({
  isDiscarding,
  onDiscard,
  onMinimize,
  onReadyToSave,
  onScrollToWorkoutExerciseHandled,
  scrollToWorkoutExerciseId,
  session,
}: {
  isDiscarding: boolean;
  onDiscard: () => void;
  onMinimize: () => void;
  onReadyToSave: (draft: SaveWorkoutDraft) => void;
  onScrollToWorkoutExerciseHandled: () => void;
  scrollToWorkoutExerciseId: string | null;
  session: WorkoutSession;
}) {
  const router = useRouter();
  const toast = useToast();
  const {
    clear,
    lastScrollTop,
    offsetMs,
    refresh,
    setLastScrollTop,
    skipRest,
    startRest,
  } = useActiveWorkout();
  const elapsedSeconds = useElapsedSeconds(session.started_at);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [workoutExercises, setWorkoutExercises] = useState<
    WorkoutSessionExercise[]
  >([]);
  const latestWorkoutExercisesRef = useRef<WorkoutSessionExercise[]>([]);
  const [isLoadingWorkoutExercises, setIsLoadingWorkoutExercises] =
    useState(true);
  const [workoutExercisesError, setWorkoutExercisesError] = useState<
    string | null
  >(null);
  const saveQueue = useSaveQueue();
  const {
    drop: dropSave,
    enqueue: enqueueSave,
    isBusy: isSaveQueueBusy,
    retryAll: retryFailedSaves,
    waitForKeys: waitForSaveKeys,
  } = saveQueue;
  const saveQueueState = saveQueue.state;
  const activeSaveKeys = useMemo(() => {
    return new Set([
      ...saveQueueState.pending.keys(),
      ...saveQueueState.inFlight.keys(),
    ]);
  }, [saveQueueState.inFlight, saveQueueState.pending]);
  const [setEditError, setSetEditError] = useState<string | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [debouncedNoteTimerCount, setDebouncedNoteTimerCount] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isInvalidRowsSheetOpen, setIsInvalidRowsSheetOpen] = useState(false);
  const [invalidWeightedSetCount, setInvalidWeightedSetCount] = useState(0);
  const [isDiscardingInvalidRows, setIsDiscardingInvalidRows] = useState(false);
  const hasAutoFinishedAtLimitRef = useRef(false);
  const finishWorkoutRef = useRef<() => void>(() => {});
  const dirtySetFieldVersionsRef = useRef<Map<string, Map<SetDirtyField, number>>>(
    new Map(),
  );
  const latestExerciseNotesRef = useRef<Map<string, string>>(new Map());
  const noteSaveTimersRef = useRef<Map<string, number>>(new Map());
  const exerciseNoteVersionsRef = useRef<Map<string, number>>(new Map());
  const workoutExerciseElementsRef = useRef<Map<string, HTMLDivElement>>(
    new Map(),
  );
  const highlightedWorkoutExerciseTimerRef = useRef<number | null>(null);
  const exerciseOrderRequestRef = useRef(0);
  const addSetNonceRef = useRef(0);
  const unitRequestRef = useRef(0);
  const latestUnitRequestRef = useRef<Map<string, number>>(new Map());
  const [highlightedWorkoutExerciseId, setHighlightedWorkoutExerciseId] =
    useState<string | null>(null);
  const exerciseOrderIds = useMemo(
    () => workoutExercises.map((workoutExercise) => workoutExercise.id),
    [workoutExercises],
  );
  const exerciseOrderSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const setWorkoutExercisesAndRef = useCallback((
    updater:
      | WorkoutSessionExercise[]
      | ((currentExercises: WorkoutSessionExercise[]) => WorkoutSessionExercise[]),
  ) => {
    const nextExercises =
      typeof updater === "function"
        ? updater(latestWorkoutExercisesRef.current)
        : updater;

    latestWorkoutExercisesRef.current = nextExercises;
    setWorkoutExercises(nextExercises);
  }, []);
  const isSyncBusy =
    isSaveQueueBusy || debouncedNoteTimerCount > 0;

  useEffect(() => {
    const firstFailure = saveQueueState.failed.values().next().value;

    if (firstFailure) {
      toast.error(firstFailure.error);
    }
  }, [saveQueueState.failed, toast]);

  const showSyncBusyToast = useCallback(() => {
    toast.error("Wait for changes to save before finishing.");
  }, [toast]);

  const syncDebouncedNoteTimerCount = useCallback(() => {
    setDebouncedNoteTimerCount(noteSaveTimersRef.current.size);
  }, []);

  function isQueueKeyActive(key: string) {
    return activeSaveKeys.has(key);
  }

  function isQueuePrefixActive(prefix: string) {
    for (const key of activeSaveKeys) {
      if (key.startsWith(prefix)) {
        return true;
      }
    }

    return false;
  }

  const loadWorkoutExercises = useCallback(async () => {
    setIsLoadingWorkoutExercises(true);
    setWorkoutExercisesError(null);

    try {
      const workoutExerciseData = await fetchJson<WorkoutSessionExercise[]>(
        `/api/workout-sessions/${session.id}/exercises`,
      );
      const sortedWorkoutExercises = sortWorkoutExercises(workoutExerciseData);

      setWorkoutExercisesAndRef(sortedWorkoutExercises);
      return sortedWorkoutExercises;
    } catch (error) {
      setWorkoutExercisesError(getErrorMessage(error));
      return null;
    } finally {
      setIsLoadingWorkoutExercises(false);
    }
  }, [session.id, setWorkoutExercisesAndRef]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadWorkoutExercises();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadWorkoutExercises]);

  const registerWorkoutExerciseElement = useCallback(
    (workoutExerciseId: string, element: HTMLDivElement | null) => {
      if (element) {
        workoutExerciseElementsRef.current.set(workoutExerciseId, element);
        return;
      }

      workoutExerciseElementsRef.current.delete(workoutExerciseId);
    },
    [],
  );

  useEffect(() => {
    if (
      !scrollToWorkoutExerciseId ||
      isLoadingWorkoutExercises ||
      workoutExercisesError
    ) {
      return;
    }

    const targetExists = workoutExercises.some(
      (workoutExercise) => workoutExercise.id === scrollToWorkoutExerciseId,
    );

    if (!targetExists) {
      onScrollToWorkoutExerciseHandled();
      return;
    }

    const targetElement = workoutExerciseElementsRef.current.get(
      scrollToWorkoutExerciseId,
    );

    if (!targetElement) {
      return;
    }

    targetElement.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlightedWorkoutExerciseId(scrollToWorkoutExerciseId);

    if (highlightedWorkoutExerciseTimerRef.current !== null) {
      window.clearTimeout(highlightedWorkoutExerciseTimerRef.current);
    }

    highlightedWorkoutExerciseTimerRef.current = window.setTimeout(() => {
      setHighlightedWorkoutExerciseId(null);
      highlightedWorkoutExerciseTimerRef.current = null;
    }, 1800);

    onScrollToWorkoutExerciseHandled();
  }, [
    isLoadingWorkoutExercises,
    onScrollToWorkoutExerciseHandled,
    scrollToWorkoutExerciseId,
    workoutExercises,
    workoutExercisesError,
  ]);

  useEffect(() => {
    const noteSaveTimers = noteSaveTimersRef.current;

    return () => {
      for (const timeoutId of noteSaveTimers.values()) {
        window.clearTimeout(timeoutId);
      }
      noteSaveTimers.clear();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (highlightedWorkoutExerciseTimerRef.current !== null) {
        window.clearTimeout(highlightedWorkoutExerciseTimerRef.current);
      }
    };
  }, []);

  function openExercisePicker() {
    router.push("/profile/exercises?mode=add-to-workout");
  }

  function markSetDirty(setId: string, patch: WorkoutSetPatch) {
    let fieldVersions = dirtySetFieldVersionsRef.current.get(setId);

    if (!fieldVersions) {
      fieldVersions = new Map();
      dirtySetFieldVersionsRef.current.set(setId, fieldVersions);
    }

    for (const field of getSetPatchFields(patch)) {
      fieldVersions.set(field, (fieldVersions.get(field) ?? 0) + 1);
    }
  }

  function snapshotSetFieldVersions(setId: string, patch: WorkoutSetPatch) {
    const currentVersions = dirtySetFieldVersionsRef.current.get(setId);
    const sentVersions = new Map<SetDirtyField, number>();

    if (!currentVersions) {
      return sentVersions;
    }

    for (const field of getSetPatchFields(patch)) {
      const version = currentVersions.get(field);

      if (version !== undefined) {
        sentVersions.set(field, version);
      }
    }

    return sentVersions;
  }

  function clearResolvedSetFields(
    setId: string,
    sentVersions: Map<SetDirtyField, number>,
  ) {
    const currentVersions = dirtySetFieldVersionsRef.current.get(setId);

    if (!currentVersions) {
      return;
    }

    for (const [field, version] of sentVersions) {
      if (currentVersions.get(field) === version) {
        currentVersions.delete(field);
      }
    }

    if (currentVersions.size === 0) {
      dirtySetFieldVersionsRef.current.delete(setId);
    }
  }

  function buildSetPatchFromLocalState(setId: string): WorkoutSetPatch {
    for (const workoutExercise of latestWorkoutExercisesRef.current) {
      const set = workoutExercise.sets.find((candidate) => {
        return candidate.id === setId;
      });

      if (set) {
        return getWorkoutSetPatch(set);
      }
    }

    return {};
  }

  async function handleUpdateSet(
    workoutExerciseId: string,
    setId: string,
    patch: WorkoutSetPatch,
  ) {
    setSetEditError(null);
    setFinishError(null);

    markSetDirty(setId, patch);
    setWorkoutExercisesAndRef((currentExercises) =>
      currentExercises.map((workoutExercise) => {
        if (workoutExercise.id !== workoutExerciseId) {
          return workoutExercise;
        }

        return {
          ...workoutExercise,
          input_weight_unit:
            workoutExercise.exercise_type &&
            storesInputWeightUnit(workoutExercise.exercise_type) &&
            patch.weight_input_unit
              ? patch.weight_input_unit
              : workoutExercise.input_weight_unit,
          sets: workoutExercise.sets.map((set) =>
            set.id === setId ? mergeWorkoutSetPatch(set, patch) : set,
          ),
        };
      }),
    );

    let sentVersions = new Map<SetDirtyField, number>();

    enqueueSave({
      key: getSetUpdateKey(setId),
      describe: "set update",
      run: async (signal) => {
        await sleep(SET_SAVE_DEBOUNCE_MS, signal);

        const payload = buildSetPatchFromLocalState(setId);
        sentVersions = snapshotSetFieldVersions(setId, payload);

        return fetchJson<WorkoutSet[]>(`/api/sets/${setId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal,
        });
      },
      onSuccess: (response) => {
        const updatedSets = response as WorkoutSet[];

        if (!hasLocalWorkoutSet(latestWorkoutExercisesRef.current, setId)) {
          return;
        }

        clearResolvedSetFields(setId, sentVersions);
        setWorkoutExercisesAndRef((currentExercises) =>
          currentExercises.map((workoutExercise) => {
            if (workoutExercise.id !== workoutExerciseId) {
              return workoutExercise;
            }

            return {
              ...workoutExercise,
              sets: mergeServerWorkoutSets(
                workoutExercise.sets,
                sortWorkoutSets(updatedSets),
                dirtySetFieldVersionsRef.current,
              ),
            };
          }),
        );

        if (patch.checked !== undefined) {
          void refresh({ suppressError: true });
        }

        if (patch.checked === true) {
          const workoutExercise = latestWorkoutExercisesRef.current.find(
            (candidate) => candidate.id === workoutExerciseId,
          );

          if (workoutExercise?.rest_seconds) {
            void startRest(workoutExerciseId, workoutExercise.rest_seconds);
          }
        }
      },
    });
  }

  async function handleAddSet(workoutExerciseId: string) {
    setSetEditError(null);
    setFinishError(null);
    addSetNonceRef.current += 1;
    const nonce = addSetNonceRef.current.toString();

    enqueueSave({
      key: `${getSetAddKeyPrefix(workoutExerciseId)}${nonce}`,
      describe: "add set",
      run: (signal) =>
        fetchJson<WorkoutSet>(
          `/api/workout-session-exercises/${workoutExerciseId}/sets`,
          { method: "POST", signal },
        ),
      onSuccess: (response) => {
        const createdSet = response as WorkoutSet;

        setWorkoutExercisesAndRef((currentExercises) =>
          currentExercises.map((workoutExercise) =>
            workoutExercise.id === workoutExerciseId
              ? {
                  ...workoutExercise,
                  sets: sortWorkoutSets([...workoutExercise.sets, createdSet]),
                }
              : workoutExercise,
          ),
        );
      },
    });
  }

  async function handleDeleteSet(workoutExerciseId: string, setId: string) {
    setSetEditError(null);
    setFinishError(null);

    dropSave(getSetUpdateKey(setId));
    setWorkoutExercisesAndRef((currentExercises) =>
      currentExercises.map((workoutExercise) =>
        workoutExercise.id === workoutExerciseId
          ? {
              ...workoutExercise,
              sets: workoutExercise.sets.filter((set) => set.id !== setId),
            }
          : workoutExercise,
      ),
    );

    enqueueSave({
      key: getSetDeleteKey(setId),
      describe: "delete set",
      run: (signal) =>
        fetchJson<WorkoutSet[]>(`/api/sets/${setId}`, {
          method: "DELETE",
          signal,
        }),
      onSuccess: (response) => {
        const updatedSets = response as WorkoutSet[];

        setWorkoutExercisesAndRef((currentExercises) =>
          currentExercises.map((workoutExercise) =>
            workoutExercise.id === workoutExerciseId
              ? {
                  ...workoutExercise,
                  sets: sortWorkoutSets(updatedSets),
                }
              : workoutExercise,
          ),
        );
      },
    });
  }

  async function handleUpdateWorkoutExerciseUnit(
    workoutExerciseId: string,
    weightUnit: "lbs" | "kg",
  ) {
    setSetEditError(null);
    const requestId = unitRequestRef.current + 1;

    unitRequestRef.current = requestId;
    latestUnitRequestRef.current.set(workoutExerciseId, requestId);

    setWorkoutExercisesAndRef((currentExercises) =>
      sortWorkoutExercises(
        currentExercises.map((workoutExercise) =>
          workoutExercise.id === workoutExerciseId
            ? {
                ...workoutExercise,
                input_weight_unit: weightUnit,
                sets: workoutExercise.sets.map((set) => ({
                  ...set,
                  weight_input_value: convertWorkoutSetInputValue(
                    set.weight_input_value,
                    set.weight_input_unit ??
                      workoutExercise.input_weight_unit ??
                      session.default_weight_unit,
                    weightUnit,
                  ),
                  weight_input_unit: weightUnit,
                })),
              }
            : workoutExercise,
        ),
      ),
    );

    enqueueSave({
      key: getWorkoutExerciseFieldKey(workoutExerciseId, "weight-unit"),
      describe: "exercise weight unit",
      run: (signal) =>
        fetchJson<WorkoutSessionExercise>(
          `/api/workout-session-exercises/${workoutExerciseId}/weight-unit`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ weight_unit: weightUnit }),
            signal,
          },
        ),
      onSuccess: (response) => {
        if (latestUnitRequestRef.current.get(workoutExerciseId) !== requestId) {
          return;
        }

        latestUnitRequestRef.current.delete(workoutExerciseId);
        const updatedWorkoutExercise = response as WorkoutSessionExercise;

        setWorkoutExercisesAndRef((currentExercises) =>
          sortWorkoutExercises(
            currentExercises.map((workoutExercise) =>
              workoutExercise.id === workoutExerciseId
                ? updatedWorkoutExercise
                : workoutExercise,
            ),
          ),
        );
      },
    });
  }

  const persistWorkoutExerciseNotes = useCallback(async (
    workoutExerciseId: string,
    notes: string,
  ) => {
    setSetEditError(null);
    let sentNotes = notes;
    let sentVersion = exerciseNoteVersionsRef.current.get(workoutExerciseId) ?? 0;

    enqueueSave({
      key: getWorkoutExerciseFieldKey(workoutExerciseId, "notes"),
      describe: "exercise notes",
      run: (signal) => {
        sentNotes = latestExerciseNotesRef.current.get(workoutExerciseId) ?? "";
        sentVersion = exerciseNoteVersionsRef.current.get(workoutExerciseId) ?? 0;

        return fetchJson<WorkoutSessionExercise>(
          `/api/workout-session-exercises/${workoutExerciseId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ notes: sentNotes.trim() || null }),
            signal,
          },
        );
      },
      onSuccess: (response) => {
        const updatedWorkoutExercise = response as WorkoutSessionExercise;
        const currentVersion =
          exerciseNoteVersionsRef.current.get(workoutExerciseId) ?? 0;

        if (currentVersion !== sentVersion) {
          return;
        }

        setWorkoutExercisesAndRef((currentExercises) =>
          sortWorkoutExercises(
            currentExercises.map((workoutExercise) =>
              workoutExercise.id === workoutExerciseId &&
              latestExerciseNotesRef.current.get(workoutExerciseId) === sentNotes
                ? updatedWorkoutExercise
                : workoutExercise,
            ),
          ),
        );
      },
    });

    await waitForSaveKeys([
      getWorkoutExerciseFieldKey(workoutExerciseId, "notes"),
    ]);
  }, [enqueueSave, setWorkoutExercisesAndRef, waitForSaveKeys]);

  const saveWorkoutExerciseNotes = useCallback((
    workoutExerciseId: string,
    notes: string,
  ) => {
    const normalizedNotes = notes.trim();
    const existingTimeoutId = noteSaveTimersRef.current.get(workoutExerciseId);

    if (existingTimeoutId) {
      window.clearTimeout(existingTimeoutId);
      noteSaveTimersRef.current.delete(workoutExerciseId);
      syncDebouncedNoteTimerCount();
    }

    return persistWorkoutExerciseNotes(workoutExerciseId, normalizedNotes);
  }, [persistWorkoutExerciseNotes, syncDebouncedNoteTimerCount]);

  async function saveWorkoutExerciseRest(
    workoutExerciseId: string,
    restSeconds: number | null,
  ) {
    setSetEditError(null);
    setFinishError(null);
    setWorkoutExercisesAndRef((currentExercises) =>
      currentExercises.map((workoutExercise) =>
        workoutExercise.id === workoutExerciseId
          ? { ...workoutExercise, rest_seconds: restSeconds }
          : workoutExercise,
      ),
    );

    enqueueSave({
      key: getWorkoutExerciseFieldKey(workoutExerciseId, "rest_seconds"),
      describe: "exercise rest timer",
      run: (signal) =>
        fetchJson<WorkoutSessionExercise>(
          `/api/workout-session-exercises/${workoutExerciseId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ rest_seconds: restSeconds }),
            signal,
          },
        ),
      onSuccess: (response) => {
        const updatedWorkoutExercise = response as WorkoutSessionExercise;

        setWorkoutExercisesAndRef((currentExercises) =>
          sortWorkoutExercises(
            currentExercises.map((workoutExercise) =>
              workoutExercise.id === workoutExerciseId
                ? updatedWorkoutExercise
                : workoutExercise,
            ),
          ),
        );
      },
    });

    await waitForSaveKeys([
      getWorkoutExerciseFieldKey(workoutExerciseId, "rest_seconds"),
    ]);
  }

  const flushPendingExerciseNotes = useCallback(async () => {
    const noteKeys: string[] = [];

    for (const [workoutExerciseId, timeoutId] of noteSaveTimersRef.current) {
      window.clearTimeout(timeoutId);
      noteSaveTimersRef.current.delete(workoutExerciseId);
      noteKeys.push(getWorkoutExerciseFieldKey(workoutExerciseId, "notes"));
      void saveWorkoutExerciseNotes(
        workoutExerciseId,
        latestExerciseNotesRef.current.get(workoutExerciseId) ?? "",
      );
    }

    syncDebouncedNoteTimerCount();

    if (noteKeys.length === 0) {
      return true;
    }

    return waitForSaveKeys(noteKeys);
  }, [
    saveWorkoutExerciseNotes,
    syncDebouncedNoteTimerCount,
    waitForSaveKeys,
  ]);

  function handleChangeWorkoutExerciseNotes(
    workoutExerciseId: string,
    notes: string,
  ) {
    latestExerciseNotesRef.current.set(workoutExerciseId, notes);
    exerciseNoteVersionsRef.current.set(
      workoutExerciseId,
      (exerciseNoteVersionsRef.current.get(workoutExerciseId) ?? 0) + 1,
    );

    setWorkoutExercisesAndRef((currentExercises) =>
      currentExercises.map((workoutExercise) =>
        workoutExercise.id === workoutExerciseId
          ? { ...workoutExercise, notes }
          : workoutExercise,
      ),
    );

    const existingTimeoutId = noteSaveTimersRef.current.get(workoutExerciseId);

    if (existingTimeoutId) {
      window.clearTimeout(existingTimeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      noteSaveTimersRef.current.delete(workoutExerciseId);
      syncDebouncedNoteTimerCount();
      void saveWorkoutExerciseNotes(workoutExerciseId, notes);
    }, EXERCISE_NOTES_SAVE_DEBOUNCE_MS);

    noteSaveTimersRef.current.set(workoutExerciseId, timeoutId);
    syncDebouncedNoteTimerCount();
  }

  async function handleRemoveWorkoutExercise(
    workoutExercise: WorkoutSessionExercise,
  ) {
    setSetEditError(null);
    setFinishError(null);

    const pendingNoteTimer = noteSaveTimersRef.current.get(workoutExercise.id);

    if (pendingNoteTimer) {
      window.clearTimeout(pendingNoteTimer);
      noteSaveTimersRef.current.delete(workoutExercise.id);
      syncDebouncedNoteTimerCount();
    }

    latestExerciseNotesRef.current.delete(workoutExercise.id);
    exerciseNoteVersionsRef.current.delete(workoutExercise.id);
    dropSave(getWorkoutExerciseFieldKey(workoutExercise.id, "notes"));
    for (const set of workoutExercise.sets) {
      dropSave(getSetUpdateKey(set.id));
      dropSave(getSetDeleteKey(set.id));
    }

    setWorkoutExercisesAndRef((currentExercises) =>
      currentExercises.filter((currentExercise) => {
        return currentExercise.id !== workoutExercise.id;
      }),
    );

    enqueueSave({
      key: getWorkoutExerciseRemoveKey(workoutExercise.id),
      describe: "remove exercise",
      run: (signal) =>
        fetchJson<WorkoutSessionExercise[]>(
          `/api/workout-session-exercises/${workoutExercise.id}`,
          {
            method: "DELETE",
            signal,
          },
        ),
      onSuccess: (response) => {
        const updatedWorkoutExercises = response as WorkoutSessionExercise[];

        setWorkoutExercisesAndRef(
          sortWorkoutExercises(updatedWorkoutExercises),
        );
      },
    });
  }

  async function saveWorkoutExerciseOrder(orderedIds: string[]) {
    const requestId = exerciseOrderRequestRef.current + 1;

    exerciseOrderRequestRef.current = requestId;
    setWorkoutExercisesAndRef((currentExercises) =>
      applyWorkoutExerciseOrder(currentExercises, orderedIds),
    );

    enqueueSave({
      key: getExerciseOrderKey(session.id),
      describe: "exercise order",
      run: (signal) =>
        fetchJson<WorkoutSessionExercise[]>(
          `/api/workout-sessions/${session.id}/exercise-order`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              workout_exercise_ids: latestWorkoutExercisesRef.current.map(
                (workoutExercise) => workoutExercise.id,
              ),
            }),
            signal,
          },
        ),
      onSuccess: (response) => {
        if (exerciseOrderRequestRef.current !== requestId) {
          return;
        }

        const savedOrderIds = sortWorkoutExercises(
          response as WorkoutSessionExercise[],
        ).map((workoutExercise) => workoutExercise.id);

        setWorkoutExercisesAndRef((currentExercises) =>
          applyWorkoutExerciseOrder(currentExercises, savedOrderIds),
        );
        toast.success("Exercise order saved");
      },
    });
  }

  function handleWorkoutExerciseDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);
    const activeIndex = exerciseOrderIds.indexOf(activeId);
    const overIndex = exerciseOrderIds.indexOf(overId);

    if (activeIndex === -1 || overIndex === -1) {
      return;
    }

    void saveWorkoutExerciseOrder(
      arrayMove(exerciseOrderIds, activeIndex, overIndex),
    );
  }

  function handleMinimize() {
    setLastScrollTop(getLiveWorkoutScrollTop(rootRef.current));
    onMinimize();
  }

  async function handleDiscardInvalidRowsAndFinish() {
    setIsDiscardingInvalidRows(true);
    setFinishError(null);

    try {
      const response = await fetch(
        `/api/workout-sessions/${session.id}/sets/discard-invalid`,
        { method: "POST" },
      );

      if (!response.ok) {
        throw new Error(await readErrorResponse(response));
      }

      setIsInvalidRowsSheetOpen(false);
      setInvalidWeightedSetCount(0);
      const updatedWorkoutExercises = await loadWorkoutExercises();
      setIsFinishing(true);
      await validateAndFinishWorkout(updatedWorkoutExercises ?? workoutExercises);
    } catch (error) {
      setFinishError(getErrorMessage(error));
    } finally {
      setIsDiscardingInvalidRows(false);
      setIsFinishing(false);
    }
  }

  const validateAndFinishWorkout = useCallback(async (
    exercisesForSummary = workoutExercises,
  ) => {
    const didFlushNotes = await flushPendingExerciseNotes();

    if (!didFlushNotes || isSaveQueueBusy) {
      showSyncBusyToast();
      return;
    }

    const validation = await fetchJson<FinishValidationResponse>(
      `/api/workout-sessions/${session.id}/finish/validate`,
      { method: "POST" },
    );

    if (validation.can_continue) {
      if (session.active_rest_started_at) {
        void skipRest();
      }

      onReadyToSave(
        buildDefaultSaveWorkoutDraft(session, offsetMs, exercisesForSummary),
      );
      return;
    }

    if (validation.reason === "not_active") {
      setFinishError("This workout was already completed or discarded.");
      clear();
      return;
    }

    if (validation.reason === "invalid_weighted_sets") {
      setInvalidWeightedSetCount(validation.invalid_set_count);
      setIsInvalidRowsSheetOpen(true);
      return;
    }

    setFinishError(
      workoutExercises.length === 0
        ? "You haven't added any exercises yet. Add an exercise and log a set to finish this workout."
        : "You haven't logged any sets yet. Record at least one set with reps to finish this workout.",
    );
  }, [
    clear,
    flushPendingExerciseNotes,
    offsetMs,
    onReadyToSave,
    isSaveQueueBusy,
    session,
    showSyncBusyToast,
    skipRest,
    workoutExercises,
  ]);

  const handleFinishWorkout = useCallback(async () => {
    if (isSyncBusy) {
      showSyncBusyToast();
      return;
    }

    setIsFinishing(true);
    setFinishError(null);

    try {
      await validateAndFinishWorkout();
    } catch (error) {
      setFinishError(getErrorMessage(error));
    } finally {
      setIsFinishing(false);
    }
  }, [isSyncBusy, showSyncBusyToast, validateAndFinishWorkout]);

  useEffect(() => {
    finishWorkoutRef.current = () => {
      void handleFinishWorkout();
    };
  }, [handleFinishWorkout]);

  useEffect(() => {
    if (
      elapsedSeconds >= MAX_WORKOUT_DURATION_SECONDS &&
      !hasAutoFinishedAtLimitRef.current &&
      !isFinishing
    ) {
      hasAutoFinishedAtLimitRef.current = true;
      finishWorkoutRef.current();
    }
  }, [elapsedSeconds, isFinishing]);

  const workoutSummary = useMemo(
    () => getWorkoutSummary(workoutExercises, session.default_weight_unit),
    [session.default_weight_unit, workoutExercises],
  );

  useEffect(() => {
    if (
      scrollToWorkoutExerciseId ||
      lastScrollTop === null ||
      isLoadingWorkoutExercises ||
      workoutExercisesError
    ) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      const scrollContainer = getLiveWorkoutScrollContainer(rootRef.current);

      if (scrollContainer) {
        scrollContainer.scrollTop = lastScrollTop;
      }

      setLastScrollTop(null);
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [
    isLoadingWorkoutExercises,
    lastScrollTop,
    scrollToWorkoutExerciseId,
    setLastScrollTop,
    workoutExercisesError,
  ]);

  return (
    <>
      <div ref={rootRef} className="space-y-4">
        <LiveWorkoutStickyHeader
          duration={formatElapsedWords(elapsedSeconds)}
          failedSaveCount={saveQueueState.failed.size}
          isFinishing={isFinishing}
          isSaving={saveQueueState.inFlight.size > 0}
          isSyncBusy={isSyncBusy}
          onMinimize={handleMinimize}
          onFinish={() => void handleFinishWorkout()}
          onRetryFailedSaves={retryFailedSaves}
          onSyncBusyTap={showSyncBusyToast}
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

        {finishError ? <FinishError message={finishError} /> : null}

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
            <DndContext
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={handleWorkoutExerciseDragEnd}
              sensors={exerciseOrderSensors}
            >
              <SortableContext
                items={exerciseOrderIds}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {workoutExercises.map((workoutExercise) => (
                    <SortableWorkoutExerciseCard
                      key={workoutExercise.id}
                      isAddingSet={isQueuePrefixActive(
                        getSetAddKeyPrefix(workoutExercise.id),
                      )}
                      isSetDeleting={(setId) =>
                        isQueueKeyActive(getSetDeleteKey(setId))
                      }
                      isSetSaving={(setId) =>
                        isQueueKeyActive(getSetUpdateKey(setId))
                      }
                      isHighlighted={
                        highlightedWorkoutExerciseId === workoutExercise.id
                      }
                      isUnitSaving={isQueueKeyActive(
                        getWorkoutExerciseFieldKey(
                          workoutExercise.id,
                          "weight-unit",
                        ),
                      )}
                      isRestSaving={isQueueKeyActive(
                        getWorkoutExerciseFieldKey(
                          workoutExercise.id,
                          "rest_seconds",
                        ),
                      )}
                      isRemoving={isQueueKeyActive(
                        getWorkoutExerciseRemoveKey(workoutExercise.id),
                      )}
                      onAddSet={() => void handleAddSet(workoutExercise.id)}
                      onDeleteSet={(setId) =>
                        void handleDeleteSet(workoutExercise.id, setId)
                      }
                      onRemoveExercise={() =>
                        void handleRemoveWorkoutExercise(workoutExercise)
                      }
                      onCardElementChange={registerWorkoutExerciseElement}
                      onUpdateExerciseUnit={(weightUnit) =>
                        handleUpdateWorkoutExerciseUnit(
                          workoutExercise.id,
                          weightUnit,
                        )
                      }
                      onUpdateNotes={(notes) =>
                        saveWorkoutExerciseNotes(workoutExercise.id, notes)
                      }
                      onUpdateRest={(restSeconds) =>
                        saveWorkoutExerciseRest(workoutExercise.id, restSeconds)
                      }
                      onNotesChange={(notes) =>
                        handleChangeWorkoutExerciseNotes(
                          workoutExercise.id,
                          notes,
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
              </SortableContext>
            </DndContext>
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

      {isInvalidRowsSheetOpen ? (
        <ConfirmSheet
          confirmLabel="Discard & Finish"
          confirmingLabel="Discarding"
          description="These rows have a weight but no reps. They cannot be saved."
          error={finishError}
          isConfirming={isDiscardingInvalidRows}
          onCancel={() => {
            if (!isDiscardingInvalidRows) {
              setIsInvalidRowsSheetOpen(false);
              setFinishError(null);
            }
          }}
          onConfirm={() => void handleDiscardInvalidRowsAndFinish()}
          onRetry={() => void handleDiscardInvalidRowsAndFinish()}
          title={`Discard ${invalidWeightedSetCount} unfinished ${invalidWeightedSetCount === 1 ? "row" : "rows"} to finish?`}
        />
      ) : null}
    </>
  );
}

function SaveWorkoutScreen({
  draft,
  isDiscarding,
  onBack,
  onDiscard,
  onSaved,
  session,
}: {
  draft: SaveWorkoutDraft;
  isDiscarding: boolean;
  onBack: () => void;
  onDiscard: () => void;
  onSaved: () => void;
  session: WorkoutSession;
}) {
  const toast = useToast();
  const [name, setName] = useState(draft.name);
  const [description, setDescription] = useState(draft.description);
  const [startedAtLocal, setStartedAtLocal] = useState(draft.startedAtLocal);
  const [durationHours, setDurationHours] = useState(
    draft.durationHours.toString(),
  );
  const [durationMinutes, setDurationMinutes] = useState(
    draft.durationMinutes.toString(),
  );
  const [durationSecondsRemainder, setDurationSecondsRemainder] = useState(
    draft.durationSecondsRemainder.toString(),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const durationSeconds = getDurationSecondsFromInputs(
    durationHours,
    durationMinutes,
    durationSecondsRemainder,
  );
  const durationLabel = formatRoundedDuration(
    durationSeconds ?? draft.summary.durationSeconds,
  );

  async function handleSaveWorkout() {
    const trimmedName = name.trim();
    const parsedStartedAt = readLocalDateTimeInput(startedAtLocal);

    setSaveError(null);

    if (trimmedName.length < 1 || trimmedName.length > 120) {
      setSaveError("Workout title must be 1-120 characters.");
      return;
    }

    if (!parsedStartedAt) {
      setSaveError("Start date and time must be valid.");
      return;
    }

    if (durationSeconds === null) {
      setSaveError("Duration must be between 0min and 4h 59min.");
      return;
    }

    setIsSaving(true);

    try {
      await fetchJson<WorkoutSession>(
        `/api/workout-sessions/${session.id}/finish`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: trimmedName,
            description: description.trim() || null,
            started_at: parsedStartedAt.toISOString(),
            duration_seconds: durationSeconds,
          }),
        },
      );

      onSaved();
    } catch (error) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <WorkoutMetadataHeader
        left={
          <button
            type="button"
            onClick={onBack}
            className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-zinc-100 transition active:scale-95 active:bg-white/[0.06]"
            aria-label="Back to live workout"
          >
            <ChevronDownIcon className="h-7 w-7 rotate-90" />
          </button>
        }
        right={
          <button
            type="button"
            onClick={() => void handleSaveWorkout()}
            disabled={isSaving}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-bold leading-none text-white shadow-lg shadow-emerald-950/40 transition active:scale-[0.99] disabled:cursor-wait disabled:bg-zinc-700 disabled:text-zinc-300"
          >
            {isSaving ? "Saving" : "Save"}
          </button>
        }
        title="Save Workout"
      />

      {saveError ? <FinishError message={saveError} /> : null}

      <WorkoutMetadataSection
        description={description}
        durationHours={durationHours}
        durationLabel={durationLabel}
        durationMinutes={durationMinutes}
        durationSecondsRemainder={durationSecondsRemainder}
        name={name}
        onDescriptionChange={setDescription}
        onDurationChange={(value) => {
          setDurationHours(value.hours);
          setDurationMinutes(value.minutes);
          setDurationSecondsRemainder(value.seconds);
        }}
        onNameChange={setName}
        onStartedAtLocalChange={setStartedAtLocal}
        setsLabel={draft.summary.recordedSetCount.toString()}
        startedAtLocal={startedAtLocal}
        volumeLabel={formatVolumeSummary(
          draft.summary.volumeValue,
          draft.summary.volumeUnit,
        )}
      />

      <button
        type="button"
        onClick={onDiscard}
        disabled={isDiscarding || isSaving}
        className="h-12 w-full rounded-2xl border border-red-400/20 bg-red-500/10 px-4 text-base font-bold text-red-200 transition hover:bg-red-500/15 active:scale-[0.99] disabled:cursor-not-allowed disabled:text-red-200/50"
      >
        {isDiscarding ? "Discarding" : "Discard Workout"}
      </button>
    </div>
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

function FailedSavesBanner({
  count,
  onRetry,
}: {
  count: number;
  onRetry: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRetry}
      className="w-full border-b border-amber-300/20 bg-amber-300/10 px-5 py-3 text-left text-sm font-semibold leading-6 text-amber-100 transition active:bg-amber-300/15"
    >
      Couldn&apos;t save {count} {count === 1 ? "change" : "changes"}. Tap to
      retry.
    </button>
  );
}

function FinishError({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm font-semibold leading-6 text-amber-100">
      {message}
    </div>
  );
}

function SavingPill() {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 text-xs font-bold text-emerald-100">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
      Saving
    </span>
  );
}

function LiveWorkoutStickyHeader({
  duration,
  failedSaveCount,
  isFinishing,
  isSaving,
  isSyncBusy,
  onFinish,
  onMinimize,
  onRetryFailedSaves,
  onSyncBusyTap,
  sets,
  volume,
}: {
  duration: string;
  failedSaveCount: number;
  isFinishing: boolean;
  isSaving: boolean;
  isSyncBusy: boolean;
  onFinish: () => void;
  onMinimize: () => void;
  onRetryFailedSaves: () => void;
  onSyncBusyTap: () => void;
  sets: number;
  volume: string;
}) {
  const isFinishUnavailable = isFinishing || isSyncBusy;

  return (
    <div className="sticky top-0 z-30 -mx-5 -mt-px bg-[#101010] pt-[var(--safe-area-top)]">
      <div className={`bg-[#181818] ${TOP_BAR_BORDER_CLASS}`}>
        <div
          className={`grid grid-cols-[40px_minmax(0,1fr)_auto_40px_auto] gap-2 px-5 ${TOP_BAR_ROW_CLASS}`}
        >
          <button
            type="button"
            onClick={onMinimize}
            className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-zinc-100 transition active:scale-95 active:bg-white/[0.06]"
            aria-label="Minimize live workout"
          >
            <ChevronDownIcon className="h-7 w-7" />
          </button>
          <h1
            className={`min-w-0 truncate text-xl font-semibold tracking-normal text-white ${TOP_BAR_TITLE_CLASS}`}
          >
            Log Workout
          </h1>
          {isSaving ? <SavingPill /> : <span />}
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-100 transition active:scale-95 active:bg-white/[0.06]"
            aria-label="Rest timer"
          >
            <TimerIcon className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (isFinishing) {
                return;
              }

              if (isSyncBusy) {
                onSyncBusyTap();
                return;
              }

              onFinish();
            }}
            aria-disabled={isFinishUnavailable}
            className={
              isFinishUnavailable
                ? "inline-flex h-10 cursor-not-allowed items-center justify-center rounded-xl bg-zinc-700 px-4 text-sm font-bold leading-none text-zinc-300 transition"
                : "inline-flex h-10 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-bold leading-none text-white shadow-lg shadow-emerald-950/40 transition active:scale-[0.99]"
            }
          >
            {isFinishing ? "Finishing" : "Finish"}
          </button>
        </div>
      </div>

      {failedSaveCount > 0 ? (
        <FailedSavesBanner count={failedSaveCount} onRetry={onRetryFailedSaves} />
      ) : null}

      <div className="grid min-h-[56px] grid-cols-[minmax(84px,0.75fr)_minmax(112px,1fr)_minmax(40px,max-content)] gap-x-4 border-b border-white/10 bg-[#101010] px-5 py-2">
        <LiveWorkoutStat label="Duration" value={duration} accent />
        <LiveWorkoutStat label="Volume" value={volume} />
        <LiveWorkoutStat align="right" label="Sets" value={sets.toString()} />
      </div>
    </div>
  );
}

function LiveWorkoutStat({
  accent = false,
  align = "left",
  label,
  value,
}: {
  accent?: boolean;
  align?: "left" | "right";
  label: string;
  value: string;
}) {
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : ""}`}>
      <p className="text-xs font-medium tracking-normal text-zinc-500">
        {label}
      </p>
      <p
        className={`mt-1 whitespace-nowrap text-[1.12rem] font-semibold leading-none tracking-normal ${
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

type WorkoutExerciseCardProps = {
  isAddingSet: boolean;
  isHighlighted: boolean;
  isSetDeleting: (setId: string) => boolean;
  isSetSaving: (setId: string) => boolean;
  isRemoving: boolean;
  isRestSaving: boolean;
  isUnitSaving: boolean;
  onAddSet: () => void;
  onCardElementChange: (
    workoutExerciseId: string,
    element: HTMLDivElement | null,
  ) => void;
  onDeleteSet: (setId: string) => void;
  onRemoveExercise: () => void;
  onNotesChange: (notes: string) => void;
  onUpdateExerciseUnit: (weightUnit: "lbs" | "kg") => Promise<void>;
  onUpdateNotes: (notes: string) => Promise<void>;
  onUpdateRest: (restSeconds: number | null) => Promise<void>;
  onUpdateSet: (setId: string, patch: WorkoutSetPatch) => Promise<void>;
  sessionDefaultWeightUnit: "lbs" | "kg";
  workoutExercise: WorkoutSessionExercise;
};

function SortableWorkoutExerciseCard(props: WorkoutExerciseCardProps) {
  const workoutExerciseId = props.workoutExercise.id;
  const { onCardElementChange } = props;
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: workoutExerciseId });
  const setCardNodeRef = useCallback(
    (element: HTMLDivElement | null) => {
      setNodeRef(element);
      onCardElementChange(workoutExerciseId, element);
    },
    [onCardElementChange, setNodeRef, workoutExerciseId],
  );
  const style: CSSProperties = {
    transform: DndCSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setCardNodeRef}
      style={style}
      className={
        isDragging
          ? "relative scale-[1.02] rounded-3xl shadow-2xl shadow-black/50"
          : props.isHighlighted
            ? "relative rounded-3xl ring-2 ring-emerald-300/80 transition-shadow duration-300"
            : "relative rounded-3xl transition-shadow duration-300"
      }
    >
      <WorkoutExerciseCard
        {...props}
        dragHandleProps={{
          attributes,
          isDragging,
          listeners,
          setActivatorNodeRef,
        }}
      />
    </div>
  );
}

function ExerciseDragHandle({
  attributes,
  exerciseName,
  isDragging,
  listeners,
  setActivatorNodeRef,
}: SortableHandleProps & {
  exerciseName: string;
}) {
  return (
    <button
      ref={setActivatorNodeRef}
      type="button"
      className={`flex min-w-0 flex-1 select-none touch-none items-center gap-2 rounded-xl text-left transition [-webkit-touch-callout:none] active:scale-[0.99] ${
        isDragging
          ? "cursor-grabbing bg-white/[0.08]"
          : "cursor-grab hover:bg-white/[0.04]"
      }`}
      {...attributes}
      {...listeners}
      aria-label="Reorder exercise"
    >
      <ExerciseThumb name={exerciseName} size="xs" />
      <h2 className="min-w-0 flex-1 select-none break-words text-base font-semibold leading-snug text-white">
        {exerciseName}
      </h2>
    </button>
  );
}

function WorkoutExerciseCard({
  dragHandleProps,
  isAddingSet,
  isSetDeleting,
  isSetSaving,
  isRemoving,
  isRestSaving,
  isUnitSaving,
  onAddSet,
  onDeleteSet,
  onRemoveExercise,
  onNotesChange,
  onUpdateExerciseUnit,
  onUpdateNotes,
  onUpdateRest,
  onUpdateSet,
  sessionDefaultWeightUnit,
  workoutExercise,
}: WorkoutExerciseCardProps & {
  dragHandleProps: SortableHandleProps;
}) {
  const exerciseType = workoutExercise.exercise_type ?? "weight_reps";
  const [isUnitSheetOpen, setIsUnitSheetOpen] = useState(false);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isRestSheetOpen, setIsRestSheetOpen] = useState(false);
  const activeWeightUnit =
    workoutExercise.input_weight_unit ?? sessionDefaultWeightUnit;
  const canChangeExerciseUnit = hasWeightInput(exerciseType);

  async function handleSelectExerciseUnit(weightUnit: "lbs" | "kg") {
    setIsUnitSheetOpen(false);

    if (canChangeExerciseUnit) {
      await onUpdateExerciseUnit(weightUnit);
    }
  }

  async function commitNotes() {
    await onUpdateNotes(workoutExercise.notes ?? "");
  }

  async function handleSelectRest(restSeconds: number | null) {
    setIsRestSheetOpen(false);
    await onUpdateRest(restSeconds);
  }

  return (
    <section className="-mx-5 border-y border-white/[0.07] bg-[#101010] pb-2 pt-3">
      <div className="flex items-start gap-2 px-5">
        <ExerciseDragHandle
          {...dragHandleProps}
          exerciseName={workoutExercise.exercise_name_snapshot}
        />
        <div className="flex shrink-0 items-center gap-1">
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-bold text-zinc-300">
            #{workoutExercise.order_index + 1}
          </span>
          <button
            type="button"
            onClick={() => setIsActionSheetOpen(true)}
            disabled={isRemoving}
            className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200 active:scale-95 disabled:cursor-wait disabled:opacity-50"
            aria-label="Workout exercise actions"
          >
            <MoreIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-2 px-5">
        <div className="border-y border-white/[0.06]">
          <div className="py-0.5">
            <AutosizeNotesTextarea
              flush
              value={workoutExercise.notes ?? ""}
              onBlur={() => void commitNotes()}
              onChange={(event) => onNotesChange(event.target.value)}
              placeholder="Notes"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsRestSheetOpen(true)}
            aria-busy={isRestSaving}
            className="flex min-h-9 w-full items-center gap-2 border-t border-white/[0.06] py-2 text-left transition active:scale-[0.99]"
          >
            <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-zinc-400">
              <TimerIcon className="h-4 w-4 shrink-0 text-emerald-300" />
              <span className="truncate">Rest Timer</span>
            </span>
            <span className="font-mono text-sm font-bold text-white">
              {formatRestDuration(workoutExercise.rest_seconds)}
            </span>
          </button>
        </div>
      </div>

      <div>
        <div className="grid grid-cols-[38px_minmax(54px,1fr)_62px_42px_50px_34px] items-center border-y border-white/[0.06] bg-[#101010] px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.09em] text-zinc-500">
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
              canSelectDrop={canSelectDropSet(workoutExercise.sets, set.id)}
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

      <div className="px-5 pt-2">
        <button
          type="button"
          onClick={onAddSet}
          disabled={isAddingSet || isRemoving}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white/[0.07] px-4 text-sm font-bold text-zinc-300 transition active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
        >
          <PlusIcon className="h-4 w-4" />
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

      {isRestSheetOpen ? (
        <RestTimerSheet
          currentRestSeconds={workoutExercise.rest_seconds}
          isSaving={isRestSaving}
          onClose={() => setIsRestSheetOpen(false)}
          onSelect={(restSeconds) => void handleSelectRest(restSeconds)}
          subtitle={workoutExercise.exercise_name_snapshot}
        />
      ) : null}
    </section>
  );
}

function AutosizeNotesTextarea({
  className = "bg-[#181818]",
  flush = false,
  onBlur,
  onChange,
  placeholder,
  value,
}: {
  className?: string;
  flush?: boolean;
  onBlur?: () => void;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  value: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onBlur={onBlur}
      onChange={onChange}
      rows={1}
      maxLength={2000}
      autoCapitalize="sentences"
      autoCorrect="on"
      className={
        flush
          ? "max-h-28 min-h-6 w-full resize-none overflow-hidden border-0 bg-transparent px-0 py-0.5 text-sm font-medium leading-5 text-white outline-none transition placeholder:text-zinc-600"
          : `max-h-40 min-h-9 w-full resize-none overflow-hidden rounded-xl border border-white/10 px-3 py-2 text-base font-medium leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/40 ${className}`
      }
      placeholder={placeholder}
    />
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
  canSelectDrop,
  exerciseType,
  inputWeightUnit,
  isDeleting,
  isSaving,
  onDelete,
  onUpdate,
  sessionDefaultWeightUnit,
  set,
}: {
  canSelectDrop: boolean;
  exerciseType: ExerciseType;
  inputWeightUnit: "lbs" | "kg" | null;
  isDeleting: boolean;
  isSaving: boolean;
  onDelete: () => void;
  onUpdate: (patch: WorkoutSetPatch) => Promise<void>;
  sessionDefaultWeightUnit: "lbs" | "kg";
  set: WorkoutSet;
}) {
  const showWeightInput = hasWeightInput(exerciseType);
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
      <div className="grid min-h-[52px] grid-cols-[38px_minmax(54px,1fr)_62px_42px_50px_34px] items-center border-b border-white/[0.05] px-2 py-1.5">
        <button
          type="button"
          onClick={() => setIsSetTypeSheetOpen(true)}
          className={`flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.045] text-base font-bold transition active:scale-95 ${getSetLabelClassName(set.set_type)}`}
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
              name="set-weight-value"
              inputMode="decimal"
              pattern="[0-9]*[.]?[0-9]*"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              data-lpignore="true"
              data-form-type="other"
              value={weightValue}
              onBlur={() => void commitSetValues()}
              onChange={(event) => setWeightValue(event.target.value)}
              placeholder={weightPlaceholder}
              className="h-9 w-full min-w-0 rounded-lg border border-transparent bg-transparent px-1 text-center text-lg font-semibold text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-300/40 focus:bg-white/[0.04]"
              aria-label={getWeightInputLabel(exerciseType)}
            />
          ) : (
            <span className="text-lg font-semibold text-zinc-700">
              {weightPlaceholder}
            </span>
          )}
        </div>

        <input
          name="set-reps-value"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          data-lpignore="true"
          data-form-type="other"
          value={repsValue}
          onBlur={() => void commitSetValues()}
          onChange={(event) => setRepsValue(event.target.value)}
          placeholder="0"
          className="h-9 w-full min-w-0 rounded-lg border border-transparent bg-transparent px-1 text-center text-lg font-semibold text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-300/40 focus:bg-white/[0.04]"
          aria-label="Reps"
        />

        <button
          type="button"
          name="set-rpe-picker"
          onClick={() => setIsRpeSheetOpen(true)}
          data-lpignore="true"
          data-form-type="other"
          className={
            set.rpe
              ? "mx-auto flex h-9 min-w-[48px] items-center justify-center rounded-lg bg-emerald-400/15 px-2 text-sm font-bold text-emerald-200 transition active:scale-95"
              : "mx-auto flex h-9 min-w-[48px] items-center justify-center rounded-lg bg-white/[0.09] px-2 text-xs font-bold text-zinc-300 transition active:scale-95"
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
              ? "mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-lg shadow-emerald-950/40 transition active:scale-95"
              : "mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.09] text-zinc-300 transition active:scale-95"
          }
          aria-label={set.checked ? "Mark set unchecked" : "Mark set checked"}
        >
          <CheckIcon className="h-4 w-4" />
        </button>
      </div>

      {hasMissingBodyweight ? (
        <p className="px-3 pb-2 text-xs font-semibold text-amber-300">
          Add bodyweight in Measures to calculate volume.
        </p>
      ) : null}

      {isSetTypeSheetOpen ? (
        <SetTypeSheet
          canSelectDrop={canSelectDrop}
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
  canSelectDrop,
  currentSetType,
  isDeleting,
  onClose,
  onDelete,
  onSelect,
}: {
  canSelectDrop: boolean;
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
            {options.map((option) => {
              const isSelected = currentSetType === option.value;
              const isDropDisabled =
                option.value === "drop" && !canSelectDrop && !isSelected;

              return (
                <button
                  type="button"
                  onClick={() => onSelect(option.value)}
                  key={option.value}
                  disabled={isDropDisabled}
                  aria-disabled={isDropDisabled}
                  className={
                    isDropDisabled
                      ? "grid min-h-14 w-full cursor-not-allowed grid-cols-[44px_1fr_28px] items-center rounded-2xl border border-white/[0.06] bg-[#171717] px-3 text-left opacity-70"
                      : isSelected
                        ? "grid min-h-14 w-full grid-cols-[44px_1fr_28px] items-center rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-3 text-left transition active:scale-[0.99]"
                        : "grid min-h-14 w-full grid-cols-[44px_1fr_28px] items-center rounded-2xl border border-white/10 bg-[#232323] px-3 text-left transition active:scale-[0.99]"
                  }
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl bg-black/20 text-base font-bold ${
                      isDropDisabled ? "text-zinc-600" : option.markerClassName
                    }`}
                  >
                    {option.marker}
                  </span>
                  <span>
                    <span
                      className={`block text-base font-semibold ${
                        isDropDisabled ? "text-zinc-500" : "text-white"
                      }`}
                    >
                      {option.label}
                    </span>
                    {isDropDisabled ? (
                      <span className="mt-0.5 block text-xs font-semibold text-zinc-600">
                        Needs a previous working or failure set
                      </span>
                    ) : null}
                  </span>
                  {isSelected ? (
                    <CheckIcon className="h-5 w-5 text-emerald-300" />
                  ) : null}
                </button>
              );
            })}
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
              aria-busy={isSaving}
              key={`${option.label}-${index}`}
              className={
                isSelected
                  ? "grid min-h-14 w-full grid-cols-[1fr_28px] items-center rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-4 text-left transition active:scale-[0.99]"
                  : "grid min-h-14 w-full grid-cols-[1fr_28px] items-center rounded-2xl border border-white/10 bg-[#232323] px-4 text-left transition active:scale-[0.99]"
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

function RestTimerSheet({
  currentRestSeconds,
  isSaving,
  onClose,
  onSelect,
  subtitle,
}: {
  currentRestSeconds: number | null;
  isSaving: boolean;
  onClose: () => void;
  onSelect: (restSeconds: number | null) => void;
  subtitle: string;
}) {
  const [selectedRestSeconds, setSelectedRestSeconds] = useState(
    currentRestSeconds ?? 0,
  );
  const options = useMemo(() => buildRestTimerOptions(), []);

  function applyRestTimer() {
    onSelect(selectedRestSeconds === 0 ? null : selectedRestSeconds);
  }

  return (
    <div className="safe-sheet fixed inset-0 z-50 flex items-end justify-center bg-black/70">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label="Close sheet"
      />
      <section className="safe-sheet-panel relative flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-[28px] border border-white/10 bg-[#141414] shadow-2xl shadow-black">
        <div className="flex justify-center px-5 py-3">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>
        <div className="relative flex min-h-[48px] items-center justify-between border-b border-white/10 px-5 pb-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="z-10 min-w-[72px] text-left text-sm font-medium text-zinc-400 disabled:cursor-wait disabled:opacity-60"
          >
            Cancel
          </button>
          <div className="pointer-events-none absolute left-1/2 max-w-[52%] -translate-x-1/2 text-center">
            <h2 className="truncate text-base font-semibold text-white">
              Rest Timer
            </h2>
            <p className="mt-0.5 truncate text-xs font-medium text-zinc-500">
              {subtitle}
            </p>
          </div>
          <div className="z-10 flex min-w-[72px] justify-end">
            <button
              type="button"
              onClick={applyRestTimer}
              disabled={isSaving}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition active:scale-95 disabled:cursor-wait disabled:opacity-60"
            >
              Done
            </button>
          </div>
        </div>
        <div className="px-5 py-5">
          <div className="mx-auto max-w-[220px]">
            <RestDurationWheelSelector
              onSelect={setSelectedRestSeconds}
              options={options}
              selectedValue={selectedRestSeconds}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function RestDurationWheelSelector({
  onSelect,
  options,
  selectedValue,
}: {
  onSelect: (value: number) => void;
  options: Array<{ label: string; value: number }>;
  selectedValue: number;
}) {
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === selectedValue),
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollEndTimerRef = useRef<number | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: selectedIndex * REST_TIMER_ROW_HEIGHT,
      behavior: "auto",
    });
  }, [selectedIndex]);

  useEffect(() => {
    return () => {
      if (scrollEndTimerRef.current) {
        window.clearTimeout(scrollEndTimerRef.current);
      }
    };
  }, []);

  function handleScroll() {
    const container = scrollRef.current;

    if (!container) {
      return;
    }

    if (scrollEndTimerRef.current) {
      window.clearTimeout(scrollEndTimerRef.current);
    }

    scrollEndTimerRef.current = window.setTimeout(() => {
      const index = Math.min(
        options.length - 1,
        Math.max(0, Math.round(container.scrollTop / REST_TIMER_ROW_HEIGHT)),
      );
      const option = options[index];

      if (option && option.value !== selectedValue) {
        onSelect(option.value);
      }
    }, 80);
  }

  return (
    <div className="min-w-0">
      <div
        className="relative overflow-hidden rounded-[16px] px-1"
        style={{ height: REST_TIMER_PICKER_HEIGHT }}
      >
        <div className="pointer-events-none absolute inset-x-1 top-1/2 z-0 h-9 -translate-y-1/2 rounded-[10px] bg-emerald-500/85 shadow-sm shadow-emerald-950/30" />
        <div
          aria-label="Rest duration"
          className="relative z-10 h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={handleScroll}
          ref={scrollRef}
          role="listbox"
          style={{
            paddingBottom: REST_TIMER_SELECTED_ROW_OFFSET,
            paddingTop: REST_TIMER_SELECTED_ROW_OFFSET,
          }}
        >
          {options.map((option, index) => (
            <button
              type="button"
              onClick={() => onSelect(option.value)}
              key={option.value}
              aria-selected={selectedValue === option.value}
              className={
                selectedValue === option.value
                  ? "flex w-full snap-center items-center justify-center rounded-[10px] px-2 text-base font-bold text-white"
                  : `flex w-full snap-center items-center justify-center rounded-[10px] px-2 text-base font-semibold text-zinc-400 transition active:bg-white/[0.05] ${getRestWheelFadeClassName(index, selectedIndex)}`
              }
              role="option"
              style={{ height: REST_TIMER_ROW_HEIGHT }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-[#181818]/80 to-transparent"
          style={{ height: REST_TIMER_ROW_HEIGHT }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#181818]/80 to-transparent"
          style={{ height: REST_TIMER_ROW_HEIGHT }}
        />
      </div>
    </div>
  );
}

function getLiveWorkoutScrollTop(element: HTMLElement | null) {
  return getLiveWorkoutScrollContainer(element)?.scrollTop ?? 0;
}

function getLiveWorkoutScrollContainer(element: HTMLElement | null) {
  return element?.closest("main") ?? null;
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
    <div className="safe-sheet fixed inset-0 z-50 flex items-end justify-center bg-black/70 [transform:translateZ(0)] [will-change:transform]">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label="Close sheet"
      />
      <section className="safe-sheet-panel relative flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-[28px] border border-white/10 bg-[#141414] shadow-2xl shadow-black [transform:translateZ(0)] [will-change:transform]">
        {children}
      </section>
    </div>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new HttpError(response.status, await readErrorResponse(response), url);
  }

  return (await response.json()) as T;
}

function sleep(delayMs: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Save operation was cancelled.", "AbortError"));
      return;
    }

    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);

    function handleAbort() {
      window.clearTimeout(timeoutId);
      reject(new DOMException("Save operation was cancelled.", "AbortError"));
    }

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
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

function buildDefaultSaveWorkoutDraft(
  session: WorkoutSession,
  offsetMs: number | null,
  workoutExercises: WorkoutSessionExercise[],
): SaveWorkoutDraft {
  const startedAtMs = Date.parse(session.started_at);
  const durationSeconds = Number.isNaN(startedAtMs)
    ? 0
    : clampWorkoutDurationSeconds(
        Math.floor((Date.now() + (offsetMs ?? 0) - startedAtMs) / 1000),
      );
  const durationParts = toVisibleDurationParts(durationSeconds);
  const workoutSummary = getWorkoutSummary(
    workoutExercises,
    session.default_weight_unit,
  );

  return {
    name: `Workout — ${formatWorkoutNameDate(session.started_at)}`,
    description: "",
    startedAtLocal: toLocalDateTimeInputValue(session.started_at),
    durationHours: durationParts.hours,
    durationMinutes: durationParts.minutes,
    durationSecondsRemainder: durationParts.secondsAdjustment,
    summary: {
      durationSeconds,
      recordedSetCount: workoutSummary.recordedSets,
      volumeValue: workoutSummary.volumeValue,
      volumeUnit: workoutSummary.volumeUnit,
    },
  };
}

function getDurationSecondsFromInputs(
  hours: string,
  minutes: string,
  secondsAdjustment: string,
) {
  const parsedHours = parseNonNegativeInteger(hours);
  const parsedMinutes = parseNonNegativeInteger(minutes);
  const parsedSecondsAdjustment = parseSignedInteger(secondsAdjustment);

  if (
    parsedHours === null ||
    parsedMinutes === null ||
    parsedSecondsAdjustment === null ||
    parsedHours > Math.floor(MAX_WORKOUT_DURATION_SECONDS / 3600) ||
    parsedMinutes > 59
  ) {
    return null;
  }

  return durationInputsToSeconds(
    parsedHours,
    parsedMinutes,
    parsedSecondsAdjustment,
  );
}

function parseNonNegativeInteger(value: string) {
  const trimmedValue = value.trim();

  if (!/^\d+$/.test(trimmedValue)) {
    return null;
  }

  const parsedValue = Number(trimmedValue);

  return Number.isSafeInteger(parsedValue) ? parsedValue : null;
}

function parseSignedInteger(value: string) {
  const trimmedValue = value.trim();

  if (!/^-?\d+$/.test(trimmedValue)) {
    return null;
  }

  const parsedValue = Number(trimmedValue);

  return Number.isSafeInteger(parsedValue) ? parsedValue : null;
}

function toLocalDateTimeInputValue(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getFullYear().toString().padStart(4, "0"),
    "-",
    (date.getMonth() + 1).toString().padStart(2, "0"),
    "-",
    date.getDate().toString().padStart(2, "0"),
    "T",
    date.getHours().toString().padStart(2, "0"),
    ":",
    date.getMinutes().toString().padStart(2, "0"),
  ].join("");
}

function readLocalDateTimeInput(value: string) {
  const parsedTime = new Date(value).getTime();

  return Number.isNaN(parsedTime) ? null : new Date(parsedTime);
}

function formatWorkoutNameDate(startedAt: string) {
  const date = new Date(startedAt);

  if (Number.isNaN(date.getTime())) {
    return "Today";
  }

  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const day = date.getDate();

  return `${weekday} ${month} ${day}`;
}

function sortWorkoutExercises(exercises: WorkoutSessionExercise[]) {
  return [...exercises].sort((first, second) => {
    return first.order_index - second.order_index;
  });
}

function applyWorkoutExerciseOrder(
  exercises: WorkoutSessionExercise[],
  orderedIds: string[],
) {
  if (exercises.length !== orderedIds.length) {
    return exercises;
  }

  const exercisesById = new Map(
    exercises.map((exercise) => [exercise.id, exercise]),
  );

  if (orderedIds.some((id) => !exercisesById.has(id))) {
    return exercises;
  }

  return orderedIds.map((id, orderIndex) => ({
    ...exercisesById.get(id)!,
    order_index: orderIndex,
  }));
}

function getSetPatchFields(patch: WorkoutSetPatch) {
  return Object.keys(patch) as SetDirtyField[];
}

function getWorkoutSetPatch(set: WorkoutSet): WorkoutSetPatch {
  return {
    checked: set.checked,
    reps: set.reps,
    rpe: set.rpe,
    set_type: set.set_type,
    weight_input_value: set.weight_input_value,
    ...(set.weight_input_unit ? { weight_input_unit: set.weight_input_unit } : {}),
  };
}

function mergeWorkoutSetPatch(set: WorkoutSet, patch: WorkoutSetPatch) {
  return {
    ...set,
    ...(patch.checked !== undefined ? { checked: patch.checked } : {}),
    ...(patch.reps !== undefined ? { reps: patch.reps } : {}),
    ...(patch.rpe !== undefined ? { rpe: patch.rpe } : {}),
    ...(patch.set_type !== undefined ? { set_type: patch.set_type } : {}),
    ...(patch.weight_input_value !== undefined
      ? { weight_input_value: patch.weight_input_value }
      : {}),
    ...(patch.weight_input_unit !== undefined
      ? { weight_input_unit: patch.weight_input_unit }
      : {}),
  };
}

function mergeServerWorkoutSets(
  localSets: WorkoutSet[],
  serverSets: WorkoutSet[],
  dirtySetFieldVersions: Map<string, Map<SetDirtyField, number>>,
) {
  const localSetsById = new Map(localSets.map((set) => [set.id, set]));

  return serverSets.map((serverSet) => {
    const localSet = localSetsById.get(serverSet.id);
    const dirtyFields = dirtySetFieldVersions.get(serverSet.id);

    if (!localSet || !dirtyFields || dirtyFields.size === 0) {
      return serverSet;
    }

    return {
      ...serverSet,
      ...(dirtyFields.has("checked") ? { checked: localSet.checked } : {}),
      ...(dirtyFields.has("reps") ? { reps: localSet.reps } : {}),
      ...(dirtyFields.has("rpe") ? { rpe: localSet.rpe } : {}),
      ...(dirtyFields.has("set_type") ? { set_type: localSet.set_type } : {}),
      ...(dirtyFields.has("weight_input_value")
        ? { weight_input_value: localSet.weight_input_value }
        : {}),
      ...(dirtyFields.has("weight_input_unit")
        ? { weight_input_unit: localSet.weight_input_unit }
        : {}),
    };
  });
}

function hasLocalWorkoutSet(
  workoutExercises: WorkoutSessionExercise[],
  setId: string,
) {
  return workoutExercises.some((workoutExercise) =>
    workoutExercise.sets.some((set) => set.id === setId),
  );
}

function getSetUpdateKey(setId: string) {
  return `set:${setId}`;
}

function getSetAddKeyPrefix(workoutExerciseId: string) {
  return `set-add:${workoutExerciseId}:`;
}

function getSetDeleteKey(setId: string) {
  return `set-delete:${setId}`;
}

function getWorkoutExerciseFieldKey(workoutExerciseId: string, field: string) {
  return `workout-exercise:${workoutExerciseId}:${field}`;
}

function getWorkoutExerciseRemoveKey(workoutExerciseId: string) {
  return `workout-exercise-remove:${workoutExerciseId}`;
}

function getExerciseOrderKey(sessionId: string) {
  return `exercise-order:${sessionId}`;
}

function sortWorkoutSets(sets: WorkoutSet[]) {
  return [...sets].sort((first, second) => {
    return first.row_index - second.row_index;
  });
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
    recordedSets: sets.filter((set) => set.reps !== null && set.reps >= 1)
      .length,
    volumeValue,
    volumeUnit: defaultWeightUnit,
  };
}

function canSelectDropSet(sets: WorkoutSet[], setId: string) {
  const orderedSets = sortWorkoutSets(sets);
  const currentSetIndex = orderedSets.findIndex((set) => set.id === setId);

  if (currentSetIndex <= 0) {
    return false;
  }

  return orderedSets
    .slice(0, currentSetIndex)
    .some((set) => set.set_type === "normal" || set.set_type === "failure");
}

function formatVolumeSummary(value: number, unit: "lbs" | "kg") {
  if (value <= 0) {
    return `0 ${unit}`;
  }

  return `${formatDecimal(value.toFixed(2))} ${unit}`;
}

function buildRestTimerOptions() {
  const options: Array<{ label: string; value: number }> = [
    { label: "OFF", value: 0 },
  ];

  for (let seconds = 5; seconds <= 120; seconds += 5) {
    options.push({ label: formatRestDuration(seconds), value: seconds });
  }

  for (let seconds = 135; seconds <= 300; seconds += 15) {
    options.push({ label: formatRestDuration(seconds), value: seconds });
  }

  return options;
}

function getRestWheelFadeClassName(index: number, selectedIndex: number) {
  const distance = Math.abs(index - selectedIndex);

  if (distance === 1) {
    return "opacity-80";
  }

  if (distance === 2) {
    return "opacity-55";
  }

  if (distance >= 3) {
    return "opacity-30";
  }

  return "";
}

function formatRestDuration(seconds: number | null) {
  if (!seconds) {
    return "OFF";
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = seconds % 60;

  return remainderSeconds === 0
    ? `${minutes}:00`
    : `${minutes}:${remainderSeconds.toString().padStart(2, "0")}`;
}

function formatDecimal(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return value;
  }

  return Number.isInteger(parsed) ? parsed.toString() : parsed.toFixed(2);
}

function convertWorkoutSetInputValue(
  value: string | null,
  fromUnit: "lbs" | "kg",
  toUnit: "lbs" | "kg",
) {
  if (value === null || fromUnit === toUnit) {
    return value;
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return value;
  }

  const convertedValue =
    fromUnit === "kg" ? parsedValue * LBS_PER_KG : parsedValue / LBS_PER_KG;

  return convertedValue.toFixed(2);
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
  return usesBodyweight(exerciseType);
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
