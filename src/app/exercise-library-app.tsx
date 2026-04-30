"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useActiveWorkout } from "./active-workout-context";
import { AppShell } from "./app-shell";
import { ConfirmSheet } from "./confirm-sheet";
import { ExerciseThumb } from "./exercise-thumb";
import { useToast } from "./toast";
import type { ExerciseType } from "@/generated/prisma/enums";
import { getExerciseTypeLabel } from "@/lib/exercise-type";
import { formatSetLabel, getSetLabelClassName } from "@/lib/set-display";

type Reference = {
  id: string;
  name: string;
};

type Exercise = {
  id: string;
  name: string;
  description: string | null;
  exercise_type: ExerciseType;
  equipment_type: Reference;
  primary_muscle_group: Reference;
  secondary_muscle_groups: Reference[];
  created_at: string;
  updated_at: string;
};

type ExercisePayload = {
  name: string;
  description: string | null;
  exercise_type: ExerciseType;
  equipment_type_id: string;
  primary_muscle_group_id: string;
  secondary_muscle_group_ids: string[];
};

type SetType = "normal" | "warmup" | "failure" | "drop";

type ExerciseHistory = {
  exercise_id: string;
  exercise_type: ExerciseType;
  display_weight_unit: "lbs" | "kg";
  workouts: ExerciseHistoryWorkout[];
};

type ExerciseHistoryWorkout = {
  id: string;
  name: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  workout_url: string;
  set_count: number;
  sets: ExerciseHistorySet[];
};

type ExerciseHistorySet = {
  id: string;
  workout_session_exercise_id: string;
  row_index: number;
  set_number: number | null;
  set_type: SetType;
  weight: number | null;
  weight_unit: "lbs" | "kg" | null;
  bodyweight: number | null;
  bodyweight_unit: "lbs" | "kg" | null;
  reps: number;
  rpe: number | null;
  checked: boolean;
  checked_at: string | null;
};

type WorkoutSessionExercise = {
  id: string;
};

type RecentExercisesResponse = {
  exercise_ids: string[];
};

type ModalMode =
  | { kind: "create" }
  | {
      kind: "edit";
      exercise: Exercise;
    };

type ExerciseLibraryMode = "manage" | "add-to-workout";

export function ExerciseLibraryApp({
  initialSelectedExerciseId = null,
  mode = "manage",
}: {
  initialSelectedExerciseId?: string | null;
  mode?: ExerciseLibraryMode;
}) {
  const router = useRouter();
  const toast = useToast();
  const {
    refresh: refreshActiveWorkout,
    requestOpenLive,
    session,
  } = useActiveWorkout();
  const isAddToWorkoutMode = mode === "add-to-workout";
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [recentExerciseIds, setRecentExerciseIds] = useState<string[]>([]);
  const [equipmentTypes, setEquipmentTypes] = useState<Reference[]>([]);
  const [muscleGroups, setMuscleGroups] = useState<Reference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [equipmentFilterId, setEquipmentFilterId] = useState("");
  const [muscleFilterId, setMuscleFilterId] = useState("");
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(
    isAddToWorkoutMode ? null : initialSelectedExerciseId,
  );
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [deletingExerciseId, setDeletingExerciseId] = useState<string | null>(
    null,
  );
  const [deleteExerciseTarget, setDeleteExerciseTarget] =
    useState<Exercise | null>(null);
  const [isExerciseActionsOpen, setIsExerciseActionsOpen] = useState(false);
  const [openExerciseFilterSheet, setOpenExerciseFilterSheet] = useState<
    "equipment" | "muscle" | null
  >(null);
  const [addingExerciseId, setAddingExerciseId] = useState<string | null>(null);

  const loadLibrary = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const [exerciseData, recentData, equipmentData, muscleData] =
        await Promise.all([
          fetchJson<Exercise[]>("/api/exercises"),
          fetchJson<RecentExercisesResponse>("/api/exercises/recent"),
          fetchJson<Reference[]>("/api/equipment-types"),
          fetchJson<Reference[]>("/api/muscle-groups"),
        ]);

      setExercises(sortExercises(exerciseData));
      setRecentExerciseIds(recentData.exercise_ids);
      setEquipmentTypes(equipmentData);
      setMuscleGroups(muscleData);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadLibrary();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadLibrary]);

  const selectedExercise = useMemo(() => {
    if (isAddToWorkoutMode || !selectedExerciseId) {
      return null;
    }

    return (
      exercises.find((exercise) => exercise.id === selectedExerciseId) ?? null
    );
  }, [exercises, isAddToWorkoutMode, selectedExerciseId]);

  const filteredExercises = useMemo(
    () =>
      exercises.filter((exercise) =>
        matchesExerciseFilters({
          equipmentFilterId,
          exercise,
          muscleFilterId,
          search,
        }),
      ),
    [equipmentFilterId, exercises, muscleFilterId, search],
  );

  const recentExercises = useMemo(() => {
    const exerciseById = new Map(
      exercises.map((exercise) => [exercise.id, exercise]),
    );

    return recentExerciseIds.flatMap((exerciseId) => {
      const exercise = exerciseById.get(exerciseId);

      if (
        !exercise ||
        !matchesExerciseFilters({
          equipmentFilterId,
          exercise,
          muscleFilterId,
          search,
        })
      ) {
        return [];
      }

      return [exercise];
    });
  }, [equipmentFilterId, exercises, muscleFilterId, recentExerciseIds, search]);

  async function addExerciseToActiveWorkout(exercise: Exercise) {
    if (!session) {
      setActionError("Start a workout before adding exercises.");
      return;
    }

    setAddingExerciseId(exercise.id);
    setActionError(null);

    try {
      const createdWorkoutExercise = await fetchJson<WorkoutSessionExercise>(
        `/api/workout-sessions/${session.id}/exercises`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ exercise_id: exercise.id }),
        },
      );

      await refreshActiveWorkout({ suppressError: true });
      requestOpenLive({
        scrollToWorkoutExerciseId: createdWorkoutExercise.id,
      });
      toast.success(`${exercise.name} added`);
      router.push("/");
    } catch (error) {
      const message = getErrorMessage(error);
      setActionError(message);
      toast.error(message);
    } finally {
      setAddingExerciseId(null);
    }
  }

  async function handleSaveExercise(payload: ExercisePayload) {
    const editingExercise =
      modalMode?.kind === "edit" ? modalMode.exercise : null;
    const exercise = await fetchJson<Exercise>(
      editingExercise
        ? `/api/exercises/${editingExercise.id}`
        : "/api/exercises",
      {
        method: editingExercise ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    setExercises((currentExercises) => {
      const nextExercises = editingExercise
        ? currentExercises.map((currentExercise) =>
            currentExercise.id === exercise.id ? exercise : currentExercise,
          )
        : [...currentExercises, exercise];

      return sortExercises(nextExercises);
    });
    setSelectedExerciseId(isAddToWorkoutMode ? null : exercise.id);
    if (!isAddToWorkoutMode) {
      router.replace(getExerciseDetailHref(exercise.id), { scroll: false });
    }
    setModalMode(null);
    setActionError(null);
    toast.success(editingExercise ? "Exercise saved" : "Exercise created");

    if (isAddToWorkoutMode && !editingExercise) {
      await addExerciseToActiveWorkout(exercise);
    }
  }

  function handleSelectExercise(exercise: Exercise) {
    if (isAddToWorkoutMode) {
      void addExerciseToActiveWorkout(exercise);
      return;
    }

    setIsExerciseActionsOpen(false);
    setSelectedExerciseId(exercise.id);
    router.replace(getExerciseDetailHref(exercise.id), { scroll: false });
  }

  function closeExerciseDetail() {
    setIsExerciseActionsOpen(false);
    setSelectedExerciseId(null);
    router.replace("/profile/exercises", { scroll: false });
  }

  function cancelAddToWorkout() {
    requestOpenLive();
    router.push("/");
  }

  async function handleDeleteExercise(exercise: Exercise) {
    setDeletingExerciseId(exercise.id);
    setActionError(null);

    try {
      const response = await fetch(`/api/exercises/${exercise.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await readErrorResponse(response));
      }

      setExercises((currentExercises) =>
        currentExercises.filter(
          (currentExercise) => currentExercise.id !== exercise.id,
        ),
      );
      setSelectedExerciseId(null);
      router.replace("/profile/exercises", { scroll: false });
      setDeleteExerciseTarget(null);
      toast.success("Exercise deleted");
    } catch (error) {
      const message = getErrorMessage(error);
      setActionError(message);
      toast.error(message);
    } finally {
      setDeletingExerciseId(null);
    }
  }

  return (
    <>
      <AppShell
        backAction={
          selectedExercise
            ? closeExerciseDetail
            : isAddToWorkoutMode
              ? cancelAddToWorkout
              : undefined
        }
        backHref={isAddToWorkoutMode || selectedExercise ? undefined : "/profile"}
        backLabel={
          selectedExercise
            ? "Back to exercises"
            : isAddToWorkoutMode
              ? "Cancel adding exercise"
              : "Back to profile"
        }
        backText={isAddToWorkoutMode && !selectedExercise ? "Cancel" : undefined}
        mainClassName="safe-main-x pb-6 pt-0"
        subpage
        title={
          selectedExercise
            ? selectedExercise.name
            : isAddToWorkoutMode
              ? "Add Exercise"
              : "Exercises"
        }
        action={
          selectedExercise ? (
            <button
              type="button"
              onClick={() => setIsExerciseActionsOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-zinc-200 transition active:scale-95"
              aria-label="Exercise actions"
            >
              <MoreIcon className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setModalMode({ kind: "create" })}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-950/50 transition active:scale-95 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
              disabled={
                equipmentTypes.length === 0 || muscleGroups.length === 0
              }
              aria-label="Create exercise"
            >
              <PlusIcon className="h-5 w-5" />
            </button>
          )
        }
      >
        {selectedExercise ? (
          <ExerciseDetail
            actionError={actionError}
            exercise={selectedExercise}
          />
        ) : selectedExerciseId && isLoading ? (
          <ExerciseDetailSkeleton />
        ) : (
          <ExerciseList
            equipmentFilterId={equipmentFilterId}
            equipmentTypes={equipmentTypes}
            exercises={filteredExercises}
            isLoading={isLoading}
            loadError={loadError}
            muscleFilterId={muscleFilterId}
            muscleGroups={muscleGroups}
            mode={mode}
            actionError={actionError}
            addingExerciseId={addingExerciseId}
            onCreate={() => setModalMode({ kind: "create" })}
            onRetry={() => void loadLibrary()}
            onSearchChange={setSearch}
            onClearFilters={() => {
              setEquipmentFilterId("");
              setMuscleFilterId("");
            }}
            onOpenFilterSheet={setOpenExerciseFilterSheet}
            onSelectExercise={handleSelectExercise}
            recentExercises={recentExercises}
            search={search}
            totalExerciseCount={exercises.length}
          />
        )}
      </AppShell>

      {openExerciseFilterSheet === "equipment" ? (
        <ExerciseFilterSheet
          allLabel="All Equipment"
          currentValue={equipmentFilterId}
          fieldLabel="Equipment"
          onClose={() => setOpenExerciseFilterSheet(null)}
          onSelect={(value) => {
            setEquipmentFilterId(value);
            setOpenExerciseFilterSheet(null);
          }}
          options={equipmentTypes}
          title="Filter Equipment"
        />
      ) : null}

      {openExerciseFilterSheet === "muscle" ? (
        <ExerciseFilterSheet
          allLabel="All Muscles"
          currentValue={muscleFilterId}
          fieldLabel="Muscle"
          onClose={() => setOpenExerciseFilterSheet(null)}
          onSelect={(value) => {
            setMuscleFilterId(value);
            setOpenExerciseFilterSheet(null);
          }}
          options={muscleGroups}
          title="Filter Muscle"
        />
      ) : null}

      {modalMode ? (
        <ExerciseModal
          equipmentTypes={equipmentTypes}
          mode={modalMode}
          muscleGroups={muscleGroups}
          onClose={() => setModalMode(null)}
          onSave={handleSaveExercise}
        />
      ) : null}

      {isExerciseActionsOpen && selectedExercise ? (
        <ExerciseActionsSheet
          deletingExerciseId={deletingExerciseId}
          exercise={selectedExercise}
          onCancel={() => setIsExerciseActionsOpen(false)}
          onDelete={() => {
            setIsExerciseActionsOpen(false);
            setDeleteExerciseTarget(selectedExercise);
          }}
          onEdit={() => {
            setIsExerciseActionsOpen(false);
            setModalMode({ kind: "edit", exercise: selectedExercise });
          }}
        />
      ) : null}

      {deleteExerciseTarget ? (
        <ConfirmSheet
          confirmLabel="Delete Exercise"
          confirmingLabel="Deleting"
          description="This cannot be undone."
          error={actionError}
          isConfirming={deletingExerciseId === deleteExerciseTarget.id}
          onCancel={() => {
            if (deletingExerciseId !== deleteExerciseTarget.id) {
              setDeleteExerciseTarget(null);
              setActionError(null);
            }
          }}
          onConfirm={() => void handleDeleteExercise(deleteExerciseTarget)}
          onRetry={() => void handleDeleteExercise(deleteExerciseTarget)}
          title={`Delete ${deleteExerciseTarget.name}?`}
        />
      ) : null}
    </>
  );
}

function ExerciseDetailSkeleton() {
  return (
    <div className="space-y-5 pt-4">
      <div className="rounded-3xl border border-white/10 bg-[#181818] p-4">
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 animate-pulse rounded-2xl bg-white/[0.05]" />
          <div className="flex-1 space-y-3 pt-1">
            <div className="h-6 w-2/3 animate-pulse rounded-full bg-white/[0.05]" />
            <div className="h-4 w-1/3 animate-pulse rounded-full bg-white/[0.04]" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3">
          {[0, 1, 2, 3].map((item) => (
            <div
              className="h-12 animate-pulse rounded-2xl bg-white/[0.04]"
              key={item}
            />
          ))}
        </div>
      </div>
      <div className="h-32 animate-pulse rounded-2xl bg-white/[0.04]" />
    </div>
  );
}

function ExerciseList({
  actionError,
  addingExerciseId,
  equipmentFilterId,
  equipmentTypes,
  exercises,
  isLoading,
  loadError,
  muscleFilterId,
  muscleGroups,
  mode,
  onCreate,
  onRetry,
  onSearchChange,
  onClearFilters,
  onOpenFilterSheet,
  onSelectExercise,
  recentExercises,
  search,
  totalExerciseCount,
}: {
  actionError: string | null;
  addingExerciseId: string | null;
  equipmentFilterId: string;
  equipmentTypes: Reference[];
  exercises: Exercise[];
  isLoading: boolean;
  loadError: string | null;
  muscleFilterId: string;
  muscleGroups: Reference[];
  mode: ExerciseLibraryMode;
  onCreate: () => void;
  onRetry: () => void;
  onSearchChange: (value: string) => void;
  onClearFilters: () => void;
  onOpenFilterSheet: (sheet: "equipment" | "muscle") => void;
  onSelectExercise: (exercise: Exercise) => void;
  recentExercises: Exercise[];
  search: string;
  totalExerciseCount: number;
}) {
  if (loadError) {
    return (
      <div className="flex min-h-[52dvh] flex-col items-center justify-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-300">
          <XIcon className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-white">
          Could not load exercises
        </h2>
        <p className="mt-2 max-w-64 text-sm leading-6 text-zinc-400">
          {loadError}
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

  return (
    <div className="space-y-3">
      <ExerciseListControls
        equipmentFilterId={equipmentFilterId}
        equipmentTypes={equipmentTypes}
        muscleFilterId={muscleFilterId}
        muscleGroups={muscleGroups}
        onClearFilters={onClearFilters}
        onOpenFilterSheet={onOpenFilterSheet}
        onSearchChange={onSearchChange}
        search={search}
      />
      {actionError ? <ActionError message={actionError} /> : null}
      <ExerciseResults
        addingExerciseId={addingExerciseId}
        exercises={exercises}
        isLoading={isLoading}
        isSelectionMode={mode === "add-to-workout"}
        onCreate={onCreate}
        onSelectExercise={onSelectExercise}
        recentExercises={recentExercises}
        totalExerciseCount={totalExerciseCount}
      />
    </div>
  );
}

function ActionError({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
      {message}
    </div>
  );
}

function ExerciseListControls({
  equipmentFilterId,
  equipmentTypes,
  muscleFilterId,
  muscleGroups,
  onClearFilters,
  onOpenFilterSheet,
  onSearchChange,
  search,
}: {
  equipmentFilterId: string;
  equipmentTypes: Reference[];
  muscleFilterId: string;
  muscleGroups: Reference[];
  onClearFilters: () => void;
  onOpenFilterSheet: (sheet: "equipment" | "muscle") => void;
  onSearchChange: (value: string) => void;
  search: string;
}) {
  const selectedEquipmentName =
    equipmentTypes.find((option) => option.id === equipmentFilterId)?.name ??
    null;
  const selectedMuscleName =
    muscleGroups.find((option) => option.id === muscleFilterId)?.name ?? null;
  const hasActiveFilter =
    equipmentFilterId.length > 0 || muscleFilterId.length > 0;

  return (
    <>
      <div className="sticky top-0 z-20 -mx-5 space-y-4 bg-[#101010]/95 px-5 pb-4 pt-3 backdrop-blur">
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#1b1b1b] px-3 py-2.5">
          <SearchIcon className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            placeholder="Search exercise"
            className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-zinc-600"
          />
          {search.length > 0 ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
              aria-label="Clear search"
            >
              <XIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div
          className={
            hasActiveFilter
              ? "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] gap-2"
              : "grid grid-cols-2 gap-2"
          }
        >
          <FilterControl
            isActive={equipmentFilterId.length > 0}
            label={selectedEquipmentName ?? "All Equipment"}
            onOpen={() => onOpenFilterSheet("equipment")}
          />
          <FilterControl
            isActive={muscleFilterId.length > 0}
            label={selectedMuscleName ?? "All Muscles"}
            onOpen={() => onOpenFilterSheet("muscle")}
          />
          {hasActiveFilter ? (
            <button
              type="button"
              onClick={onClearFilters}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[#222] text-zinc-400 transition active:scale-[0.98]"
              aria-label="Clear equipment and muscle filters"
            >
              <XIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}

function ExerciseResults({
  addingExerciseId,
  exercises,
  isLoading,
  isSelectionMode,
  onCreate,
  onSelectExercise,
  recentExercises,
  totalExerciseCount,
}: {
  addingExerciseId: string | null;
  exercises: Exercise[];
  isLoading: boolean;
  isSelectionMode: boolean;
  onCreate: () => void;
  onSelectExercise: (exercise: Exercise) => void;
  recentExercises: Exercise[];
  totalExerciseCount: number;
}) {
  return (
    <div className="space-y-3 pb-24">
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

      {!isLoading && totalExerciseCount === 0 ? (
        <EmptyState
          cta="Create"
          message="Your exercise library is empty."
          onCreate={onCreate}
          title="No exercises yet"
        />
      ) : null}

      {!isLoading && totalExerciseCount > 0 && exercises.length === 0 ? (
        <EmptyState
          message="No exercises match the current search and filters."
          title="No matches"
        />
      ) : null}

      {!isLoading && exercises.length > 0 ? (
        <div className="space-y-6">
          {recentExercises.length > 0 ? (
            <ExerciseResultSection
              addingExerciseId={addingExerciseId}
              exercises={recentExercises}
              isSelectionMode={isSelectionMode}
              onSelectExercise={onSelectExercise}
              title="Recent Exercises"
            />
          ) : null}
          <ExerciseResultSection
            addingExerciseId={addingExerciseId}
            exercises={exercises}
            isSelectionMode={isSelectionMode}
            onSelectExercise={onSelectExercise}
            title="All Exercises"
          />
        </div>
      ) : null}
    </div>
  );
}

function ExerciseResultSection({
  addingExerciseId,
  exercises,
  isSelectionMode,
  onSelectExercise,
  title,
}: {
  addingExerciseId: string | null;
  exercises: Exercise[];
  isSelectionMode: boolean;
  onSelectExercise: (exercise: Exercise) => void;
  title: string;
}) {
  return (
    <section>
      <h2 className="mb-2.5 px-1 text-[11px] font-bold uppercase tracking-[0.09em] text-zinc-500">
        {title}
      </h2>
      <div className="space-y-2">
        {exercises.map((exercise) => (
          <ExerciseRow
            exercise={exercise}
            isAdding={addingExerciseId === exercise.id}
            isDisabled={addingExerciseId !== null}
            isSelectionMode={isSelectionMode}
            key={exercise.id}
            onClick={() => onSelectExercise(exercise)}
          />
        ))}
      </div>
    </section>
  );
}

function FilterControl({
  isActive,
  label,
  onOpen,
}: {
  isActive: boolean;
  label: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={
        isActive
          ? "flex h-11 min-w-0 items-center justify-center rounded-full border border-emerald-400/35 bg-emerald-400/10 px-3 text-center text-sm font-semibold text-emerald-100 transition active:scale-[0.98]"
          : "flex h-11 min-w-0 items-center justify-center rounded-full border border-white/10 bg-[#222] px-3 text-center text-sm font-semibold text-zinc-200 transition active:scale-[0.98]"
      }
    >
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

function ExerciseFilterSheet({
  allLabel,
  currentValue,
  fieldLabel,
  onClose,
  onSelect,
  options,
  title,
}: {
  allLabel: string;
  currentValue: string;
  fieldLabel: string;
  onClose: () => void;
  onSelect: (value: string) => void;
  options: Reference[];
  title: string;
}) {
  const sheetOptions = [{ id: "", name: allLabel }, ...options];

  return (
    <div className="safe-sheet fixed inset-0 z-50 flex items-end justify-center bg-black/70">
      <button
        type="button"
        aria-label="Close filter menu"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <section className="safe-sheet-panel relative flex h-[50dvh] w-full max-w-md flex-col rounded-t-[28px] border border-white/10 bg-[#141414] shadow-2xl shadow-black">
        <div className="flex justify-center px-5 py-3">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>
        <div className="border-b border-white/10 px-5 pb-4">
          <h2 className="truncate text-center text-base font-semibold text-white">
            {title}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div>
            <p className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
              {fieldLabel}
            </p>
            <div className="space-y-3">
              {sheetOptions.map((option) => {
                const isSelected = option.id === currentValue;

                return (
                  <button
                    type="button"
                    onClick={() => onSelect(option.id)}
                    key={option.id || "all"}
                    className={
                      isSelected
                        ? "grid min-h-14 w-full grid-cols-[1fr_28px] items-center rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-4 text-left transition active:scale-[0.99]"
                        : "grid min-h-14 w-full grid-cols-[1fr_28px] items-center rounded-2xl border border-white/10 bg-[#232323] px-4 text-left transition active:scale-[0.99]"
                    }
                  >
                    <span className="min-w-0 truncate text-base font-semibold text-white">
                      {option.name}
                    </span>
                    {isSelected ? (
                      <CheckIcon className="h-5 w-5 text-emerald-300" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ExerciseRow({
  exercise,
  isAdding,
  isDisabled,
  isSelectionMode,
  onClick,
}: {
  exercise: Exercise;
  isAdding: boolean;
  isDisabled: boolean;
  isSelectionMode: boolean;
  onClick: () => void;
}) {
  const secondaryText =
    exercise.secondary_muscle_groups.length > 0
      ? ` + ${exercise.secondary_muscle_groups.length}`
      : "";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className="flex min-h-[74px] w-full items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#181818] px-3.5 py-3 text-left transition hover:border-white/10 hover:bg-[#1e1e1e] active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
    >
      <ExerciseThumb name={exercise.primary_muscle_group.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-white">
          {exercise.name}
        </p>
        <p className="mt-1 truncate text-sm text-zinc-500">
          {exercise.primary_muscle_group.name}
          {secondaryText} · {exercise.equipment_type.name}
        </p>
      </div>
      {isSelectionMode ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-zinc-300">
          {isAdding ? (
            <span className="text-xs font-bold">...</span>
          ) : (
            <PlusIcon className="h-4 w-4" />
          )}
        </span>
      ) : (
        <ChevronIcon className="h-4 w-4 shrink-0 text-zinc-600" />
      )}
    </button>
  );
}

function EmptyState({
  cta,
  message,
  onCreate,
  title,
}: {
  cta?: string;
  message: string;
  onCreate?: () => void;
  title: string;
}) {
  return (
    <div className="flex min-h-[42dvh] flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
        <DumbbellIcon className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 max-w-64 text-sm leading-6 text-zinc-500">
        {message}
      </p>
      {cta && onCreate ? (
        <button
          type="button"
          onClick={onCreate}
          className="mt-5 flex items-center gap-1.5 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition active:scale-95"
        >
          <PlusIcon className="h-4 w-4" />
          {cta}
        </button>
      ) : null}
    </div>
  );
}

function ExerciseDetail({
  actionError,
  exercise,
}: {
  actionError: string | null;
  exercise: Exercise;
}) {
  const [history, setHistory] = useState<ExerciseHistory | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [historyReloadRequest, setHistoryReloadRequest] = useState(0);
  const secondaryText =
    exercise.secondary_muscle_groups.length > 0
      ? exercise.secondary_muscle_groups.map((muscle) => muscle.name).join(", ")
      : "None";

  useEffect(() => {
    const abortController = new AbortController();

    async function loadHistory() {
      setIsHistoryLoading(true);
      setHistoryError(null);

      try {
        const response = await fetch(`/api/exercises/${exercise.id}/history`, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(await readErrorResponse(response));
        }

        const data = (await response.json()) as ExerciseHistory;

        if (!abortController.signal.aborted) {
          setHistory(data);
          setIsHistoryLoading(false);
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          setHistoryError(getErrorMessage(error));
          setIsHistoryLoading(false);
        }
      }
    }

    void loadHistory();

    return () => abortController.abort();
  }, [exercise.id, historyReloadRequest]);

  return (
    <div className="pt-4">
      {actionError ? (
        <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {actionError}
        </div>
      ) : null}

      <div className="rounded-3xl border border-white/10 bg-[#181818] p-4">
        <div className="flex items-start gap-4">
          <ExerciseThumb name={exercise.primary_muscle_group.name} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-xl font-semibold text-white">{exercise.name}</p>
            <p className="mt-1 text-sm text-zinc-500">
              {exercise.equipment_type.name}
            </p>
          </div>
        </div>

        {exercise.description ? (
          <p className="mt-5 rounded-2xl bg-white/[0.04] p-3 text-sm leading-6 text-zinc-300">
            {exercise.description}
          </p>
        ) : null}

        <div className="mt-5 grid grid-cols-1 gap-3">
          <DetailRow
            label="Primary"
            value={exercise.primary_muscle_group.name}
          />
          <DetailRow label="Secondary" value={secondaryText} />
          <DetailRow label="Equipment" value={exercise.equipment_type.name} />
          <DetailRow
            label="Type"
            value={getExerciseTypeLabel(exercise.exercise_type)}
          />
        </div>
      </div>

      <div className="mt-5 border-b border-white/10">
        <button
          type="button"
          className="border-b-2 border-emerald-400 px-1 pb-3 text-sm font-semibold text-emerald-300"
        >
          History
        </button>
      </div>

      <ExerciseHistoryPanel
        exercise={exercise}
        exerciseType={exercise.exercise_type}
        history={history}
        isLoading={isHistoryLoading}
        loadError={historyError}
        onRetry={() => {
          setHistory(null);
          setHistoryReloadRequest((request) => request + 1);
        }}
      />
    </div>
  );
}

function ExerciseHistoryPanel({
  exercise,
  exerciseType,
  history,
  isLoading,
  loadError,
  onRetry,
}: {
  exercise: Exercise;
  exerciseType: ExerciseType;
  history: ExerciseHistory | null;
  isLoading: boolean;
  loadError: string | null;
  onRetry: () => void;
}) {
  if (isLoading) {
    return (
      <div className="mt-4 space-y-3">
        {[0, 1].map((item) => (
          <div
            className="h-32 animate-pulse rounded-2xl bg-white/[0.04]"
            key={item}
          />
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/[0.06] px-5 py-4">
        <p className="text-sm font-semibold text-red-100">
          History could not load.
        </p>
        <p className="mt-1 text-sm text-red-100/70">{loadError}</p>
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

  if (!history || history.workouts.length === 0) {
    return (
      <div className="mt-4 rounded-3xl border border-white/[0.06] bg-white/[0.03] px-5 py-8 text-center">
        <p className="text-sm font-medium text-zinc-400">
          No workout history yet.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3 pb-24">
      {history.workouts.map((workout) => (
        <ExerciseHistoryWorkoutCard
          exercise={exercise}
          exerciseType={exerciseType}
          key={workout.id}
          workout={workout}
        />
      ))}
    </div>
  );
}

function ExerciseHistoryWorkoutCard({
  exercise,
  exerciseType,
  workout,
}: {
  exercise: Exercise;
  exerciseType: ExerciseType;
  workout: ExerciseHistoryWorkout;
}) {
  const returnHref = getExerciseDetailHref(exercise.id);
  const workoutHref = `${workout.workout_url}?returnTo=${encodeURIComponent(
    returnHref,
  )}`;

  return (
    <article className="rounded-2xl border border-white/[0.08] bg-[#181818] p-4">
      <Link
        href={workoutHref}
        className="flex items-start justify-between gap-3 transition active:scale-[0.99]"
      >
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-white">
            {workout.name}
          </h3>
          <p className="mt-1 text-xs font-medium text-zinc-500">
            {formatHistoryDate(workout.ended_at)} ·{" "}
            {formatDuration(workout.duration_seconds)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-zinc-500">
          <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-semibold text-zinc-300">
            {formatSetCount(workout.set_count)}
          </span>
          <ChevronIcon className="h-4 w-4" />
        </div>
      </Link>

      <div className="mt-4">
        <div className="mb-2.5 flex items-center gap-3">
          <ExerciseThumb name={exercise.primary_muscle_group.name} size="sm" />
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-[15px] font-bold text-white">
              {exercise.name}
            </h4>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {exercise.equipment_type.name}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-[14px] border border-white/[0.08] bg-[#1a1a1a]">
          <div className="flex items-center border-b border-white/[0.06] px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.07em] text-zinc-600">
            <div className="w-8 shrink-0">Set</div>
            <div className="min-w-0 flex-1">Weight &amp; Reps</div>
          </div>
          {workout.sets.map((set) => (
            <ExerciseHistorySetRow
              exerciseType={exerciseType}
              isLast={set.id === workout.sets[workout.sets.length - 1]?.id}
              key={set.id}
              set={set}
            />
          ))}
        </div>
      </div>
    </article>
  );
}

function ExerciseHistorySetRow({
  exerciseType,
  isLast,
  set,
}: {
  exerciseType: ExerciseType;
  isLast: boolean;
  set: ExerciseHistorySet;
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
          {formatHistorySetSummary(set, exerciseType)}
        </p>
      </div>
    </div>
  );
}

function ExerciseActionsSheet({
  deletingExerciseId,
  exercise,
  onCancel,
  onDelete,
  onEdit,
}: {
  deletingExerciseId: string | null;
  exercise: Exercise;
  onCancel: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="safe-sheet fixed inset-0 z-50 flex items-end justify-center bg-black/60">
      <button
        type="button"
        aria-label="Close exercise actions"
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
            <span>Edit exercise</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deletingExerciseId === exercise.id}
            className="flex h-14 w-full items-center gap-3 rounded-2xl bg-red-500/10 px-4 text-left text-base font-bold text-red-300 ring-1 ring-red-500/20 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:text-red-300/50"
          >
            <TrashIcon className="h-5 w-5" />
            <span>
              {deletingExerciseId === exercise.id
                ? "Deleting exercise"
                : "Delete exercise"}
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.035] px-3 py-3">
      <span className="text-sm font-medium text-zinc-500">{label}</span>
      <span className="min-w-0 flex-1 text-right text-sm font-semibold text-zinc-100">
        {value}
      </span>
    </div>
  );
}

function ExerciseModal({
  equipmentTypes,
  mode,
  muscleGroups,
  onClose,
  onSave,
}: {
  equipmentTypes: Reference[];
  mode: ModalMode;
  muscleGroups: Reference[];
  onClose: () => void;
  onSave: (payload: ExercisePayload) => Promise<void>;
}) {
  const toast = useToast();
  const editingExercise = mode.kind === "edit" ? mode.exercise : null;
  const [name, setName] = useState(editingExercise?.name ?? "");
  const [description, setDescription] = useState(
    editingExercise?.description ?? "",
  );
  const [exerciseType, setExerciseType] = useState<ExerciseType>(
    editingExercise?.exercise_type ?? "weight_reps",
  );
  const [equipmentTypeId, setEquipmentTypeId] = useState(
    editingExercise?.equipment_type.id ?? equipmentTypes[0]?.id ?? "",
  );
  const [primaryMuscleGroupId, setPrimaryMuscleGroupId] = useState(
    editingExercise?.primary_muscle_group.id ?? muscleGroups[0]?.id ?? "",
  );
  const [secondaryMuscleGroupIds, setSecondaryMuscleGroupIds] = useState(
    editingExercise?.secondary_muscle_groups.map((muscle) => muscle.id) ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (name.trim().length === 0) {
      setError("Name is required.");
      return;
    }

    if (!equipmentTypeId || !primaryMuscleGroupId) {
      setError("Equipment and primary muscle are required.");
      return;
    }

    setIsSubmitting(true);

    try {
      await onSave({
        name: name.trim(),
        description:
          description.trim().length > 0 ? description.trim() : null,
        exercise_type: exerciseType,
        equipment_type_id: equipmentTypeId,
        primary_muscle_group_id: primaryMuscleGroupId,
        secondary_muscle_group_ids: secondaryMuscleGroupIds,
      });
    } catch (submitError) {
      const message = getErrorMessage(submitError);
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function toggleSecondaryMuscleGroup(id: string) {
    setSecondaryMuscleGroupIds((currentIds) =>
      currentIds.includes(id)
        ? currentIds.filter((currentId) => currentId !== id)
        : [...currentIds, id],
    );
  }

  return (
    <div className="safe-sheet fixed inset-0 z-50 flex items-end justify-center bg-black/70">
      <button
        type="button"
        aria-label="Close exercise form"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <form
        onSubmit={handleSubmit}
        className="safe-sheet-panel relative flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-[28px] border border-white/10 bg-[#141414] shadow-2xl shadow-black"
      >
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
          <h2 className="min-w-0 flex-1 text-center text-base font-semibold text-white">
            {editingExercise ? "Edit Exercise" : "Create Exercise"}
          </h2>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition active:scale-95 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            {isSubmitting ? "Saving" : editingExercise ? "Save" : "Create"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {error ? (
            <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <FormField label="Name">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoCapitalize="words"
              autoCorrect="off"
              placeholder="e.g. Bench Press"
              className="h-12 w-full rounded-2xl border border-white/10 bg-[#232323] px-4 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/70"
            />
          </FormField>

          <FormField label="Description">
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              autoCapitalize="sentences"
              autoCorrect="on"
              placeholder="Instructions, cues, setup notes"
              rows={3}
              className="w-full resize-none rounded-2xl border border-white/10 bg-[#232323] px-4 py-3 text-base leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/70"
            />
          </FormField>

          <FormField label="Exercise Type">
            {editingExercise ? (
              <ReadOnlyExerciseType exerciseType={exerciseType} />
            ) : (
              <ExerciseTypeSelect
                selectedType={exerciseType}
                onSelect={setExerciseType}
              />
            )}
          </FormField>

          <FormField label="Equipment">
            <SingleSelectChips
              options={equipmentTypes}
              selectedId={equipmentTypeId}
              onSelect={setEquipmentTypeId}
            />
          </FormField>

          <FormField label="Primary Muscle">
            <SingleSelectChips
              options={muscleGroups}
              selectedId={primaryMuscleGroupId}
              onSelect={setPrimaryMuscleGroupId}
            />
          </FormField>

          <FormField label="Secondary Muscles">
            <MultiSelectChips
              options={muscleGroups}
              selectedIds={secondaryMuscleGroupIds}
              onToggle={toggleSecondaryMuscleGroup}
            />
          </FormField>
        </div>
      </form>
    </div>
  );
}

function FormField({
  children,
  label,
}: {
  children: React.ReactNode;
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

function ExerciseTypeSelect({
  onSelect,
  selectedType,
}: {
  onSelect: (type: ExerciseType) => void;
  selectedType: ExerciseType;
}) {
  return (
    <div className="grid gap-2">
      {exerciseTypeOptions.map((option) => {
        const selected = option.value === selectedType;

        return (
          <button
            type="button"
            key={option.value}
            onClick={() => onSelect(option.value)}
            className={
              selected
                ? "rounded-2xl border border-emerald-400/50 bg-emerald-500/15 px-4 py-3 text-left text-white"
                : "rounded-2xl border border-white/10 bg-[#232323] px-4 py-3 text-left text-zinc-300 transition hover:border-white/15 hover:bg-[#2b2b2b]"
            }
          >
            <span className="block text-sm font-semibold">
              {option.label}
            </span>
            <span className="mt-1 block text-xs leading-5 text-zinc-500">
              {option.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ReadOnlyExerciseType({
  exerciseType,
}: {
  exerciseType: ExerciseType;
}) {
  const option = getExerciseTypeOption(exerciseType);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#232323] px-4 py-3">
      <p className="text-sm font-semibold text-white">{option.label}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">
        Exercise type cannot be changed after creation.
      </p>
    </div>
  );
}

function SingleSelectChips({
  onSelect,
  options,
  selectedId,
}: {
  onSelect: (id: string) => void;
  options: Reference[];
  selectedId: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.id === selectedId;

        return (
          <button
            type="button"
            key={option.id}
            onClick={() => onSelect(option.id)}
            className={
              selected
                ? "rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white"
                : "rounded-full bg-[#232323] px-4 py-2 text-sm font-semibold text-zinc-400 transition hover:bg-[#2b2b2b] hover:text-zinc-200"
            }
          >
            {option.name}
          </button>
        );
      })}
    </div>
  );
}

function MultiSelectChips({
  onToggle,
  options,
  selectedIds,
}: {
  onToggle: (id: string) => void;
  options: Reference[];
  selectedIds: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = selectedIds.includes(option.id);

        return (
          <button
            type="button"
            key={option.id}
            onClick={() => onToggle(option.id)}
            className={
              selected
                ? "flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white"
                : "rounded-full bg-[#232323] px-4 py-2 text-sm font-semibold text-zinc-400 transition hover:bg-[#2b2b2b] hover:text-zinc-200"
            }
          >
            {selected ? <CheckIcon className="h-3.5 w-3.5" /> : null}
            {option.name}
          </button>
        );
      })}
    </div>
  );
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

const exerciseTypeOptions: {
  value: ExerciseType;
  label: string;
  description: string;
}[] = [
  {
    value: "weight_reps",
    label: "Weight & Reps",
    description: "Bench press, curls, rows. Uses load plus reps.",
  },
  {
    value: "bodyweight_reps",
    label: "Bodyweight Reps",
    description: "Pullups, situps, burpees. Uses reps only.",
  },
  {
    value: "weighted_bodyweight",
    label: "Weighted Bodyweight",
    description: "Weighted pullups or dips. Uses added load plus reps.",
  },
  {
    value: "assisted_bodyweight",
    label: "Assisted Bodyweight",
    description: "Assisted pullups or dips. Uses assistance plus reps.",
  },
];

function getExerciseTypeOption(exerciseType: ExerciseType) {
  return (
    exerciseTypeOptions.find((option) => option.value === exerciseType)
      ?? exerciseTypeOptions[0]
  );
}

function formatHistoryLoad(
  set: ExerciseHistorySet,
  exerciseType: ExerciseType,
) {
  if (set.weight !== null && set.weight_unit) {
    const prefix = exerciseType === "assisted_bodyweight" ? "Assist " : "";
    return `${prefix}${formatDecimal(set.weight)} ${set.weight_unit}`;
  }

  if (exerciseType === "bodyweight_reps") {
    return "Bodyweight";
  }

  if (
    exerciseType === "weighted_bodyweight" ||
    exerciseType === "assisted_bodyweight"
  ) {
    return "No external load";
  }

  return "No weight";
}

function formatHistorySetSummary(
  set: ExerciseHistorySet,
  exerciseType: ExerciseType,
) {
  const baseSummary = `${formatHistoryLoad(set, exerciseType)} × ${set.reps}`;

  if (set.rpe === null) {
    return baseSummary;
  }

  return `${baseSummary} @ ${formatDecimal(set.rpe)} RPE`;
}

function getExerciseDetailHref(exerciseId: string) {
  return `/profile/exercises?exercise=${encodeURIComponent(exerciseId)}`;
}

function formatHistoryDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
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

function formatDecimal(value: number) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

function formatSetCount(count: number) {
  return `${count} ${count === 1 ? "set" : "sets"}`;
}

function sortExercises(exercises: Exercise[]) {
  return [...exercises].sort(compareExercisesByName);
}

function compareExercisesByName(first: Exercise, second: Exercise) {
  const firstName = first.name.trimStart();
  const secondName = second.name.trimStart();
  const firstStartsWithNumber = startsWithNumber(firstName);
  const secondStartsWithNumber = startsWithNumber(secondName);

  if (firstStartsWithNumber !== secondStartsWithNumber) {
    return firstStartsWithNumber ? -1 : 1;
  }

  return firstName.localeCompare(secondName, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function startsWithNumber(value: string) {
  return /^[0-9]/.test(value);
}

function matchesExerciseFilters({
  equipmentFilterId,
  exercise,
  muscleFilterId,
  search,
}: {
  equipmentFilterId: string;
  exercise: Exercise;
  muscleFilterId: string;
  search: string;
}) {
  const normalizedSearch = search.trim().toLowerCase();
  const matchesSearch =
    normalizedSearch.length === 0 ||
    exercise.name.toLowerCase().includes(normalizedSearch);
  const matchesEquipment =
    equipmentFilterId.length === 0 ||
    exercise.equipment_type.id === equipmentFilterId;
  const matchesMuscle =
    muscleFilterId.length === 0 ||
    exercise.primary_muscle_group.id === muscleFilterId ||
    exercise.secondary_muscle_groups.some(
      (muscleGroup) => muscleGroup.id === muscleFilterId,
    );

  return matchesSearch && matchesEquipment && matchesMuscle;
}

type IconProps = {
  className?: string;
};

function SearchIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="m21 21-4.3-4.3m1.3-5.2a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

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
        strokeWidth="2.2"
      />
    </svg>
  );
}

function ChevronIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="m9 6 6 6-6 6"
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

function CheckIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="m5 12 4 4 10-10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}

function MoreIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="19" cy="12" r="2" fill="currentColor" />
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

function EditIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
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
