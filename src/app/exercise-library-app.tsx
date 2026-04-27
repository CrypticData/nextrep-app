"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { AppShell } from "./app-shell";

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

type ExerciseType =
  | "weight_reps"
  | "bodyweight_reps"
  | "weighted_bodyweight"
  | "assisted_bodyweight";

type ModalMode =
  | { kind: "create" }
  | {
      kind: "edit";
      exercise: Exercise;
    };

export function ExerciseLibraryApp() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [equipmentTypes, setEquipmentTypes] = useState<Reference[]>([]);
  const [muscleGroups, setMuscleGroups] = useState<Reference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [equipmentFilterId, setEquipmentFilterId] = useState("");
  const [muscleFilterId, setMuscleFilterId] = useState("");
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(
    null,
  );
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [deletingExerciseId, setDeletingExerciseId] = useState<string | null>(
    null,
  );

  const loadLibrary = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const [exerciseData, equipmentData, muscleData] = await Promise.all([
        fetchJson<Exercise[]>("/api/exercises"),
        fetchJson<Reference[]>("/api/equipment-types"),
        fetchJson<Reference[]>("/api/muscle-groups"),
      ]);

      setExercises(sortExercises(exerciseData));
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
    if (!selectedExerciseId) {
      return null;
    }

    return (
      exercises.find((exercise) => exercise.id === selectedExerciseId) ?? null
    );
  }, [exercises, selectedExerciseId]);

  const filteredExercises = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return exercises.filter((exercise) => {
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
    });
  }, [equipmentFilterId, exercises, muscleFilterId, search]);

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
    setSelectedExerciseId(exercise.id);
    setModalMode(null);
    setActionError(null);
  }

  async function handleDeleteExercise(exercise: Exercise) {
    const confirmed = window.confirm(
      `Delete ${exercise.name}? This cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

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
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setDeletingExerciseId(null);
    }
  }

  return (
    <>
      <AppShell
        backHref="/profile"
        backLabel="Back to profile"
        mainClassName="px-5 pb-6 pt-0"
        subpage
        title="Exercises"
        action={
          <button
            type="button"
            onClick={() => setModalMode({ kind: "create" })}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-950/50 transition active:scale-95 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            disabled={equipmentTypes.length === 0 || muscleGroups.length === 0}
            aria-label="Create exercise"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
        }
      >
        {selectedExercise ? (
          <ExerciseDetail
            actionError={actionError}
            deletingExerciseId={deletingExerciseId}
            exercise={selectedExercise}
            onBack={() => setSelectedExerciseId(null)}
            onDelete={handleDeleteExercise}
            onEdit={() =>
              setModalMode({ kind: "edit", exercise: selectedExercise })
            }
          />
        ) : (
          <ExerciseList
            equipmentFilterId={equipmentFilterId}
            equipmentTypes={equipmentTypes}
            exercises={filteredExercises}
            isLoading={isLoading}
            loadError={loadError}
            muscleFilterId={muscleFilterId}
            muscleGroups={muscleGroups}
            onCreate={() => setModalMode({ kind: "create" })}
            onRetry={() => void loadLibrary()}
            onSearchChange={setSearch}
            onSelectExercise={(exercise) => setSelectedExerciseId(exercise.id)}
            onSetEquipmentFilter={setEquipmentFilterId}
            onSetMuscleFilter={setMuscleFilterId}
            search={search}
            totalExerciseCount={exercises.length}
          />
        )}
      </AppShell>

      {modalMode ? (
        <ExerciseModal
          equipmentTypes={equipmentTypes}
          mode={modalMode}
          muscleGroups={muscleGroups}
          onClose={() => setModalMode(null)}
          onSave={handleSaveExercise}
        />
      ) : null}
    </>
  );
}

function ExerciseList({
  equipmentFilterId,
  equipmentTypes,
  exercises,
  isLoading,
  loadError,
  muscleFilterId,
  muscleGroups,
  onCreate,
  onRetry,
  onSearchChange,
  onSelectExercise,
  onSetEquipmentFilter,
  onSetMuscleFilter,
  search,
  totalExerciseCount,
}: {
  equipmentFilterId: string;
  equipmentTypes: Reference[];
  exercises: Exercise[];
  isLoading: boolean;
  loadError: string | null;
  muscleFilterId: string;
  muscleGroups: Reference[];
  onCreate: () => void;
  onRetry: () => void;
  onSearchChange: (value: string) => void;
  onSelectExercise: (exercise: Exercise) => void;
  onSetEquipmentFilter: (value: string) => void;
  onSetMuscleFilter: (value: string) => void;
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
        exercisesShownCount={exercises.length}
        muscleFilterId={muscleFilterId}
        muscleGroups={muscleGroups}
        onSearchChange={onSearchChange}
        onSetEquipmentFilter={onSetEquipmentFilter}
        onSetMuscleFilter={onSetMuscleFilter}
        search={search}
        totalExerciseCount={totalExerciseCount}
      />
      <ExerciseResults
        exercises={exercises}
        isLoading={isLoading}
        onCreate={onCreate}
        onSelectExercise={onSelectExercise}
        totalExerciseCount={totalExerciseCount}
      />
    </div>
  );
}

function ExerciseListControls({
  equipmentFilterId,
  equipmentTypes,
  exercisesShownCount,
  muscleFilterId,
  muscleGroups,
  onSearchChange,
  onSetEquipmentFilter,
  onSetMuscleFilter,
  search,
  totalExerciseCount,
}: {
  equipmentFilterId: string;
  equipmentTypes: Reference[];
  exercisesShownCount: number;
  muscleFilterId: string;
  muscleGroups: Reference[];
  onSearchChange: (value: string) => void;
  onSetEquipmentFilter: (value: string) => void;
  onSetMuscleFilter: (value: string) => void;
  search: string;
  totalExerciseCount: number;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-5 space-y-4 bg-[#101010]/95 px-5 pb-4 pt-3 backdrop-blur">
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#1b1b1b] px-3 py-2.5">
        <SearchIcon className="h-4 w-4 shrink-0 text-zinc-500" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search exercise"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-zinc-600"
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

      <div className="grid grid-cols-2 gap-2">
        <FilterSelect
          label="Equipment"
          onChange={onSetEquipmentFilter}
          options={equipmentTypes}
          value={equipmentFilterId}
        />
        <FilterSelect
          label="Muscle"
          onChange={onSetMuscleFilter}
          options={muscleGroups}
          value={muscleFilterId}
        />
      </div>

      <p className="pt-1 text-sm font-medium text-zinc-500">
        {totalExerciseCount === 0
          ? "All Exercises"
          : `${exercisesShownCount} shown`}
      </p>
    </div>
  );
}

function ExerciseResults({
  exercises,
  isLoading,
  onCreate,
  onSelectExercise,
  totalExerciseCount,
}: {
  exercises: Exercise[];
  isLoading: boolean;
  onCreate: () => void;
  onSelectExercise: (exercise: Exercise) => void;
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
        <div className="space-y-2">
          {exercises.map((exercise) => (
            <ExerciseRow
              exercise={exercise}
              key={exercise.id}
              onClick={() => onSelectExercise(exercise)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Reference[];
  value: string;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-full border border-white/10 bg-[#222] px-3 text-sm font-semibold text-white outline-none transition focus:border-emerald-400/70"
      >
        <option value="">All {label}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function ExerciseRow({
  exercise,
  onClick,
}: {
  exercise: Exercise;
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
      className="flex min-h-[74px] w-full items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#181818] px-3.5 py-3 text-left transition hover:border-white/10 hover:bg-[#1e1e1e] active:scale-[0.99]"
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
      <ChevronIcon className="h-4 w-4 shrink-0 text-zinc-600" />
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
  deletingExerciseId,
  exercise,
  onBack,
  onDelete,
  onEdit,
}: {
  actionError: string | null;
  deletingExerciseId: string | null;
  exercise: Exercise;
  onBack: () => void;
  onDelete: (exercise: Exercise) => void;
  onEdit: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const secondaryText =
    exercise.secondary_muscle_groups.length > 0
      ? exercise.secondary_muscle_groups.map((muscle) => muscle.name).join(", ")
      : "None";

  return (
    <div>
      <div className="mb-5 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/5 hover:text-white"
          aria-label="Back to exercises"
        >
          <BackIcon className="h-4 w-4" />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-center text-lg font-semibold text-white">
          {exercise.name}
        </h2>
        <button
          type="button"
          onClick={onEdit}
          className="flex h-9 items-center gap-1.5 rounded-full bg-white/[0.08] px-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.12]"
        >
          <EditIcon className="h-4 w-4" />
          Edit
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMenu((current) => !current)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/5 hover:text-white"
            aria-label="Exercise actions"
          >
            <MoreIcon className="h-5 w-5" />
          </button>
          {showMenu ? (
            <>
              <button
                type="button"
                aria-label="Close actions"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-11 z-20 min-w-44 overflow-hidden rounded-2xl border border-white/10 bg-[#242424] shadow-2xl shadow-black/60">
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    onDelete(exercise);
                  }}
                  disabled={deletingExerciseId === exercise.id}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:text-red-300/50"
                >
                  <TrashIcon className="h-4 w-4" />
                  {deletingExerciseId === exercise.id ? "Deleting" : "Delete"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

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

      <div className="mt-4 rounded-3xl border border-white/[0.06] bg-white/[0.03] px-5 py-8 text-center">
        <p className="text-sm font-medium text-zinc-400">
          No workout history yet.
        </p>
      </div>
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
      setError(getErrorMessage(submitError));
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-0">
      <button
        type="button"
        aria-label="Close exercise form"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <form
        onSubmit={handleSubmit}
        className="relative flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-[28px] border border-white/10 bg-[#141414] shadow-2xl shadow-black"
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
              placeholder="e.g. Bench Press"
              className="h-12 w-full rounded-2xl border border-white/10 bg-[#232323] px-4 text-[15px] text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/70"
            />
          </FormField>

          <FormField label="Description">
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Instructions, cues, setup notes"
              rows={3}
              className="w-full resize-none rounded-2xl border border-white/10 bg-[#232323] px-4 py-3 text-[15px] leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/70"
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

function ExerciseThumb({
  name,
  size = "md",
}: {
  name: string;
  size?: "md" | "lg";
}) {
  const palette = getThumbPalette(name);
  const sizeClass = size === "lg" ? "h-16 w-16 text-lg" : "h-12 w-12 text-base";

  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full font-bold`}
      style={{
        backgroundColor: palette.background,
        color: palette.foreground,
      }}
    >
      {name.slice(0, 1).toUpperCase()}
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

function getExerciseTypeLabel(exerciseType: ExerciseType) {
  return getExerciseTypeOption(exerciseType).label;
}

function getExerciseTypeOption(exerciseType: ExerciseType) {
  return (
    exerciseTypeOptions.find((option) => option.value === exerciseType)
      ?? exerciseTypeOptions[0]
  );
}

function sortExercises(exercises: Exercise[]) {
  return [...exercises].sort((first, second) =>
    first.name.localeCompare(second.name, undefined, { sensitivity: "base" }),
  );
}

function getThumbPalette(name: string) {
  const palettes = [
    { background: "rgba(16, 185, 129, 0.16)", foreground: "#6ee7b7" },
    { background: "rgba(59, 130, 246, 0.16)", foreground: "#93c5fd" },
    { background: "rgba(244, 114, 182, 0.16)", foreground: "#f9a8d4" },
    { background: "rgba(234, 179, 8, 0.16)", foreground: "#fde68a" },
    { background: "rgba(168, 85, 247, 0.16)", foreground: "#d8b4fe" },
  ];
  const index = Array.from(name).reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  );

  return palettes[index % palettes.length];
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

function BackIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="m15 19-7-7 7-7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
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
