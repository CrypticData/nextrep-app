"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AppShell } from "@/app/app-shell";
import { ConfirmSheet } from "@/app/confirm-sheet";
import {
  WorkoutMetadataHeader,
  WorkoutMetadataSection,
} from "@/app/workout-metadata-ui";
import {
  MAX_WORKOUT_DURATION_SECONDS,
  durationInputsToSeconds,
  formatRoundedDuration,
  toVisibleDurationParts,
} from "@/lib/workout-duration";

type WeightUnit = "lbs" | "kg";
type SetType = "normal" | "warmup" | "failure" | "drop";
type ExerciseType =
  | "weight_reps"
  | "bodyweight_reps"
  | "weighted_bodyweight"
  | "assisted_bodyweight";

type Reference = {
  id: string;
  name: string;
};

type Exercise = {
  id: string;
  name: string;
  description: string | null;
  exercise_type: ExerciseType;
  weight_unit_preference: WeightUnit | null;
  equipment_type: Reference;
  primary_muscle_group: Reference;
  secondary_muscle_groups: Reference[];
  created_at: string;
  updated_at: string;
};

type CompletedWorkoutDetail = {
  id: string;
  name: string;
  description: string | null;
  status: "completed";
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  default_weight_unit: WeightUnit;
  recorded_set_count: number;
  volume: {
    value: number;
    unit: WeightUnit;
  };
  exercises: CompletedWorkoutExercise[];
};

type CompletedWorkoutExercise = {
  id: string;
  exercise_id: string | null;
  order_index: number;
  exercise_name_snapshot: string;
  equipment_name_snapshot: string | null;
  primary_muscle_group_name_snapshot: string | null;
  input_weight_unit: WeightUnit | null;
  notes: string | null;
  exercise_type: ExerciseType | null;
  recorded_set_count: number;
  sets: CompletedWorkoutSet[];
};

type CompletedWorkoutSet = {
  id: string;
  row_index: number;
  set_number: number | null;
  set_type: SetType;
  weight: number | null;
  weight_unit: WeightUnit | null;
  reps: number;
  rpe: number | null;
  checked: boolean;
  checked_at: string | null;
};

type DraftWorkout = {
  id: string;
  defaultWeightUnit: WeightUnit;
  name: string;
  description: string;
  startedAtLocal: string;
  durationHours: string;
  durationMinutes: string;
  durationSecondsRemainder: string;
  volumeValue: number;
  volumeUnit: WeightUnit;
  exercises: DraftWorkoutExercise[];
};

type DraftWorkoutExercise = {
  clientId: string;
  id: string | null;
  exerciseId: string | null;
  orderIndex: number;
  exerciseNameSnapshot: string;
  equipmentNameSnapshot: string | null;
  primaryMuscleGroupNameSnapshot: string | null;
  inputWeightUnit: WeightUnit | null;
  notes: string;
  exerciseType: ExerciseType;
  sets: DraftWorkoutSet[];
};

type DraftWorkoutSet = {
  clientId: string;
  id: string | null;
  rowIndex: number;
  setNumber: number | null;
  setType: SetType;
  weightValue: string;
  weightUnit: WeightUnit | null;
  repsValue: string;
  rpeValue: string;
  checked: boolean;
};

type LoadState = "loading" | "ready" | "error";

type DeleteSetTarget = {
  exerciseClientId: string;
  setClientId: string;
  label: string;
};

let nextDraftId = 0;

export function EditWorkoutApp({ workoutId }: { workoutId: string }) {
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [draft, setDraft] = useState<DraftWorkout | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [reloadRequest, setReloadRequest] = useState(0);
  const [exerciseLibrary, setExerciseLibrary] = useState<Exercise[]>([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [addingExerciseId, setAddingExerciseId] = useState<string | null>(null);
  const [removeExerciseId, setRemoveExerciseId] = useState<string | null>(null);
  const [deleteSetTarget, setDeleteSetTarget] =
    useState<DeleteSetTarget | null>(null);

  const detailHref = `/profile/workouts/${workoutId}`;

  const loadWorkout = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    setSaveError(null);

    try {
      const workout = await fetchJson<CompletedWorkoutDetail>(
        `/api/workout-sessions/${workoutId}`,
      );

      setDraft(toDraftWorkout(workout));
      setLoadState("ready");
    } catch (error) {
      setLoadError(getErrorMessage(error));
      setLoadState("error");
    }
  }, [workoutId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadWorkout();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadWorkout, reloadRequest]);

  const loadExerciseLibrary = useCallback(async () => {
    setIsLoadingLibrary(true);
    setLibraryError(null);

    try {
      const exercises = await fetchJson<Exercise[]>("/api/exercises");

      setExerciseLibrary(sortExercises(exercises));
    } catch (error) {
      setLibraryError(getErrorMessage(error));
    } finally {
      setIsLoadingLibrary(false);
    }
  }, []);

  const filteredExerciseLibrary = useMemo(() => {
    const normalizedSearch = exerciseSearch.trim().toLowerCase();

    if (normalizedSearch.length === 0) {
      return exerciseLibrary;
    }

    return exerciseLibrary.filter((exercise) => {
      return (
        exercise.name.toLowerCase().includes(normalizedSearch) ||
        exercise.primary_muscle_group.name
          .toLowerCase()
          .includes(normalizedSearch) ||
        exercise.equipment_type.name.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [exerciseLibrary, exerciseSearch]);

  const summary = useMemo(() => {
    return draft ? getDraftSummary(draft) : null;
  }, [draft]);

  function openExercisePicker() {
    setIsPickerOpen(true);

    if (exerciseLibrary.length === 0 && !isLoadingLibrary) {
      void loadExerciseLibrary();
    }
  }

  function handleAddExercise(exercise: Exercise) {
    if (!draft) {
      return;
    }

    setAddingExerciseId(exercise.id);
    setSaveError(null);
    setDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      const draftExercise = createDraftExercise(
        exercise,
        currentDraft.defaultWeightUnit,
        currentDraft.exercises.length,
      );

      return {
        ...currentDraft,
        exercises: renumberExercises([
          ...currentDraft.exercises,
          draftExercise,
        ]),
      };
    });
    setExerciseSearch("");
    setIsPickerOpen(false);
    setAddingExerciseId(null);
  }

  function handleUpdateExercise(
    exerciseClientId: string,
    updater: (exercise: DraftWorkoutExercise) => DraftWorkoutExercise,
  ) {
    setSaveError(null);
    setDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      return {
        ...currentDraft,
        exercises: currentDraft.exercises.map((exercise) =>
          exercise.clientId === exerciseClientId ? updater(exercise) : exercise,
        ),
      };
    });
  }

  function handleAddSet(exerciseClientId: string) {
    handleUpdateExercise(exerciseClientId, (exercise) => {
      const nextSet = createBlankDraftSet(
        exercise.inputWeightUnit ?? draft?.defaultWeightUnit ?? "lbs",
      );

      return renumberExerciseSets({
        ...exercise,
        sets: [...exercise.sets, nextSet],
      });
    });
  }

  function handleDeleteSet() {
    if (!deleteSetTarget) {
      return;
    }

    handleUpdateExercise(deleteSetTarget.exerciseClientId, (exercise) =>
      renumberExerciseSets({
        ...exercise,
        sets: exercise.sets.filter(
          (set) => set.clientId !== deleteSetTarget.setClientId,
        ),
      }),
    );
    setDeleteSetTarget(null);
  }

  function handleRemoveExercise() {
    if (!removeExerciseId) {
      return;
    }

    setSaveError(null);
    setDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      return {
        ...currentDraft,
        exercises: renumberExercises(
          currentDraft.exercises.filter(
            (exercise) => exercise.clientId !== removeExerciseId,
          ),
        ),
      };
    });
    setRemoveExerciseId(null);
  }

  async function handleSave() {
    if (!draft) {
      return;
    }

    const validation = validateDraft(draft);

    setSaveError(null);

    if (!validation.ok) {
      setSaveError(validation.message);
      return;
    }

    setIsSaving(true);

    try {
      await fetchJson<CompletedWorkoutDetail>(
        `/api/workout-sessions/${workoutId}/edit`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(toSavePayload(draft, validation)),
        },
      );

      router.push(detailHref);
      router.refresh();
    } catch (error) {
      setSaveError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppShell
      hideHeader
      mainClassName="px-5 pb-24 pt-0"
      title="Edit Workout"
    >
      {loadState === "loading" ? <EditWorkoutSkeleton /> : null}

      {loadState === "error" ? (
        <InlineError
          message={loadError ?? "Workout could not load."}
          onRetry={() => {
            setReloadRequest((request) => request + 1);
          }}
          title="Saved workout could not load"
        />
      ) : null}

      {loadState === "ready" && draft ? (
        <div className="space-y-4">
          <WorkoutMetadataHeader
            left={
              <button
                type="button"
                onClick={() => router.push(detailHref)}
                disabled={isSaving}
                className="-ml-2 rounded-xl px-2 py-2 text-sm font-semibold text-zinc-300 transition active:scale-95 disabled:cursor-wait disabled:opacity-50"
              >
                Cancel
              </button>
            }
            right={
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="h-10 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-white shadow-lg shadow-emerald-950/40 transition active:scale-[0.99] disabled:cursor-wait disabled:bg-zinc-700 disabled:text-zinc-300"
              >
                {isSaving ? "Saving" : "Save"}
              </button>
            }
            title="Edit Workout"
          />

          {saveError ? <SaveError message={saveError} /> : null}

          <WorkoutMetadataSection
            description={draft.description}
            durationHours={draft.durationHours}
            durationLabel={formatRoundedDuration(summary?.durationSeconds ?? 0)}
            durationMinutes={draft.durationMinutes}
            durationSecondsRemainder={draft.durationSecondsRemainder}
            name={draft.name}
            onDescriptionChange={(description) =>
              setDraft((currentDraft) =>
                currentDraft
                  ? { ...currentDraft, description }
                  : currentDraft,
              )
            }
            onDurationChange={(duration) =>
              setDraft((currentDraft) =>
                currentDraft
                  ? {
                      ...currentDraft,
                      durationHours: duration.hours,
                      durationMinutes: duration.minutes,
                      durationSecondsRemainder: duration.seconds,
                    }
                  : currentDraft,
              )
            }
            onNameChange={(name) =>
              setDraft((currentDraft) =>
                currentDraft ? { ...currentDraft, name } : currentDraft,
              )
            }
            onStartedAtLocalChange={(startedAtLocal) =>
              setDraft((currentDraft) =>
                currentDraft
                  ? { ...currentDraft, startedAtLocal }
                  : currentDraft,
              )
            }
            setsLabel={(summary?.recordedSetCount ?? 0).toString()}
            startedAtLocal={draft.startedAtLocal}
            volumeLabel={formatVolumeSummary(draft.volumeValue, draft.volumeUnit)}
          />

          <section className="border-t border-white/[0.07] pt-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-500">
                Exercises
              </h2>
              <span className="text-xs font-semibold text-zinc-600">
                {draft.exercises.length}
              </span>
            </div>

            {draft.exercises.length === 0 ? (
              <EmptyExerciseState onAddExercise={openExercisePicker} />
            ) : (
              <div className="space-y-4">
                {draft.exercises.map((exercise) => (
                  <EditableExerciseCard
                    defaultWeightUnit={draft.defaultWeightUnit}
                    exercise={exercise}
                    key={exercise.clientId}
                    onAddSet={() => handleAddSet(exercise.clientId)}
                    onDeleteSet={(set) =>
                      setDeleteSetTarget({
                        exerciseClientId: exercise.clientId,
                        setClientId: set.clientId,
                        label: formatSetLabel(set),
                      })
                    }
                    onRemoveExercise={() =>
                      setRemoveExerciseId(exercise.clientId)
                    }
                    onUpdate={(updater) =>
                      handleUpdateExercise(exercise.clientId, updater)
                    }
                  />
                ))}
              </div>
            )}
          </section>

          <button
            type="button"
            onClick={openExercisePicker}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 text-base font-bold text-white shadow-lg shadow-emerald-950/50 transition active:scale-[0.99]"
          >
            <PlusIcon className="h-5 w-5" />
            Add Exercise
          </button>
        </div>
      ) : null}

      {isPickerOpen ? (
        <ExercisePickerSheet
          addingExerciseId={addingExerciseId}
          exercises={filteredExerciseLibrary}
          isLoading={isLoadingLibrary}
          loadError={libraryError}
          onAddExercise={handleAddExercise}
          onClose={() => {
            setIsPickerOpen(false);
            setLibraryError(null);
            setExerciseSearch("");
          }}
          onRetry={() => void loadExerciseLibrary()}
          onSearchChange={setExerciseSearch}
          search={exerciseSearch}
          totalExerciseCount={exerciseLibrary.length}
        />
      ) : null}

      {removeExerciseId ? (
        <ConfirmSheet
          confirmLabel="Remove Exercise"
          description="This exercise and its sets will be removed from the saved workout when you save."
          onCancel={() => setRemoveExerciseId(null)}
          onConfirm={handleRemoveExercise}
          title="Remove this exercise?"
        />
      ) : null}

      {deleteSetTarget ? (
        <ConfirmSheet
          confirmLabel="Delete Set"
          description={`Set ${deleteSetTarget.label} will be removed from the saved workout when you save.`}
          onCancel={() => setDeleteSetTarget(null)}
          onConfirm={handleDeleteSet}
          title="Delete this set?"
        />
      ) : null}
    </AppShell>
  );
}

function EditableExerciseCard({
  defaultWeightUnit,
  exercise,
  onAddSet,
  onDeleteSet,
  onRemoveExercise,
  onUpdate,
}: {
  defaultWeightUnit: WeightUnit;
  exercise: DraftWorkoutExercise;
  onAddSet: () => void;
  onDeleteSet: (set: DraftWorkoutSet) => void;
  onRemoveExercise: () => void;
  onUpdate: (
    updater: (exercise: DraftWorkoutExercise) => DraftWorkoutExercise,
  ) => void;
}) {
  const recordedSetCount = exercise.sets.filter(
    (set) => parseNullableInteger(set.repsValue) !== null && Number(set.repsValue) >= 1,
  ).length;

  return (
    <section className="-mx-1 rounded-[24px] border border-white/[0.08] bg-[#141414] py-4">
      <div className="flex items-start justify-between gap-3 px-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-white">
            {exercise.exerciseNameSnapshot}
          </h2>
          <p className="mt-1 truncate text-sm text-zinc-500">
            {compactLabels([
              exercise.primaryMuscleGroupNameSnapshot,
              exercise.equipmentNameSnapshot,
            ])}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={onRemoveExercise}
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition active:scale-95 active:bg-white/[0.06]"
            aria-label="Remove exercise"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
          <span className="text-xs font-semibold text-zinc-500">
            {recordedSetCount}/{exercise.sets.length} recorded
          </span>
        </div>
      </div>

      <div className="mt-4 px-4">
        <textarea
          value={exercise.notes}
          onChange={(event) =>
            onUpdate((currentExercise) => ({
              ...currentExercise,
              notes: event.target.value,
            }))
          }
          rows={2}
          className="w-full resize-none rounded-2xl border border-white/10 bg-[#101010] px-4 py-3 text-sm font-medium leading-5 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/40"
          placeholder="Exercise notes"
        />
      </div>

      <div className="mt-4">
        <div className="grid grid-cols-[42px_minmax(68px,1fr)_46px_56px_38px] items-center border-y border-white/[0.06] bg-[#101010] px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.09em] text-zinc-500">
          <span>Set</span>
          <span className="text-center">
            {getWeightColumnLabel(
              exercise.exerciseType,
              exercise.inputWeightUnit ?? defaultWeightUnit,
            )}
          </span>
          <span className="text-center">Reps</span>
          <span className="text-center">RPE</span>
          <span className="flex justify-center">
            <CheckIcon className="h-4 w-4" />
          </span>
        </div>

        {exercise.sets.length > 0 ? (
          exercise.sets.map((set) => (
            <EditableSetRow
              defaultWeightUnit={defaultWeightUnit}
              exercise={exercise}
              key={set.clientId}
              onDelete={() => onDeleteSet(set)}
              onUpdate={(patch) =>
                onUpdate((currentExercise) =>
                  renumberExerciseSets({
                    ...currentExercise,
                    sets: currentExercise.sets.map((currentSet) =>
                      currentSet.clientId === set.clientId
                        ? { ...currentSet, ...patch }
                        : currentSet,
                    ),
                  }),
                )
              }
              set={set}
            />
          ))
        ) : (
          <p className="px-3 py-4 text-sm text-zinc-500">No sets yet.</p>
        )}
      </div>

      <div className="px-4 pt-4">
        <button
          type="button"
          onClick={onAddSet}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white/[0.07] px-4 text-base font-bold text-zinc-300 transition active:scale-[0.99]"
        >
          <PlusIcon className="h-5 w-5" />
          Add Set
        </button>
      </div>
    </section>
  );
}

function EditableSetRow({
  defaultWeightUnit,
  exercise,
  onDelete,
  onUpdate,
  set,
}: {
  defaultWeightUnit: WeightUnit;
  exercise: DraftWorkoutExercise;
  onDelete: () => void;
  onUpdate: (patch: Partial<DraftWorkoutSet>) => void;
  set: DraftWorkoutSet;
}) {
  const [isSetTypeSheetOpen, setIsSetTypeSheetOpen] = useState(false);
  const [isRpeSheetOpen, setIsRpeSheetOpen] = useState(false);
  const showWeightInput = exercise.exerciseType !== "bodyweight_reps";
  const activeWeightUnit =
    set.weightUnit ?? exercise.inputWeightUnit ?? defaultWeightUnit;

  return (
    <div className="bg-[#101010]">
      <div className="grid min-h-[64px] grid-cols-[42px_minmax(68px,1fr)_46px_56px_38px] items-center border-b border-white/[0.05] px-2 py-2.5">
        <button
          type="button"
          onClick={() => setIsSetTypeSheetOpen(true)}
          className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.045] text-lg font-bold transition active:scale-95 ${getSetLabelClassName(set.setType)}`}
          aria-label="Select set type"
        >
          {formatSetLabel(set)}
        </button>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_42px] items-center gap-1">
          {showWeightInput ? (
            <>
              <input
                inputMode="decimal"
                value={set.weightValue}
                onChange={(event) => onUpdate({ weightValue: event.target.value })}
                placeholder="0"
                className="h-11 w-full min-w-0 rounded-xl border border-transparent bg-transparent px-1 text-center text-xl font-semibold text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-300/40 focus:bg-white/[0.04]"
                aria-label={getWeightInputLabel(exercise.exerciseType)}
              />
              <button
                type="button"
                onClick={() =>
                  onUpdate({
                    weightUnit: activeWeightUnit === "lbs" ? "kg" : "lbs",
                  })
                }
                className="h-9 rounded-xl bg-white/[0.08] text-xs font-bold uppercase text-emerald-200 transition active:scale-95"
                aria-label="Toggle set weight unit"
              >
                {activeWeightUnit}
              </button>
            </>
          ) : (
            <span className="col-span-2 text-center text-xl font-semibold text-zinc-700">
              BW
            </span>
          )}
        </div>

        <input
          inputMode="numeric"
          value={set.repsValue}
          onChange={(event) => onUpdate({ repsValue: event.target.value })}
          placeholder="0"
          className="h-11 w-full min-w-0 rounded-xl border border-transparent bg-transparent px-1 text-center text-xl font-semibold text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-300/40 focus:bg-white/[0.04]"
          aria-label="Reps"
        />

        <button
          type="button"
          onClick={() => setIsRpeSheetOpen(true)}
          className={
            normalizeNullableText(set.rpeValue)
              ? "mx-auto flex h-10 min-w-[52px] items-center justify-center rounded-xl bg-emerald-400/15 px-2 text-sm font-bold text-emerald-200 transition active:scale-95"
              : "mx-auto flex h-10 min-w-[52px] items-center justify-center rounded-xl bg-white/[0.09] px-2 text-xs font-bold text-zinc-300 transition active:scale-95"
          }
          aria-label="Select RPE"
        >
          {normalizeNullableText(set.rpeValue) ?? "RPE"}
        </button>

        <button
          type="button"
          onClick={() => onUpdate({ checked: !set.checked })}
          className={
            set.checked
              ? "mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-lg shadow-emerald-950/40 transition active:scale-95"
              : "mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.09] text-zinc-300 transition active:scale-95"
          }
          aria-label={set.checked ? "Mark set unchecked" : "Mark set checked"}
        >
          <CheckIcon className="h-5 w-5" />
        </button>
      </div>

      {isSetTypeSheetOpen ? (
        <SetTypeSheet
          currentSetType={set.setType}
          onClose={() => setIsSetTypeSheetOpen(false)}
          onDelete={() => {
            setIsSetTypeSheetOpen(false);
            onDelete();
          }}
          onSelect={(setType) => {
            setIsSetTypeSheetOpen(false);
            onUpdate({ setType });
          }}
        />
      ) : null}

      {isRpeSheetOpen ? (
        <RpeSheet
          currentRpe={normalizeNullableText(set.rpeValue)}
          onClose={() => setIsRpeSheetOpen(false)}
          onSelect={(rpe) => {
            setIsRpeSheetOpen(false);
            onUpdate({ rpeValue: rpe ?? "" });
          }}
          setSummary={`Set ${formatSetLabel(set)}`}
        />
      ) : null}
    </div>
  );
}

function SetTypeSheet({
  currentSetType,
  onClose,
  onDelete,
  onSelect,
}: {
  currentSetType: SetType;
  onClose: () => void;
  onDelete: () => void;
  onSelect: (setType: SetType) => void;
}) {
  const options: Array<{
    label: string;
    marker: string;
    markerClassName: string;
    value: SetType;
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
        <SheetField label="Set type">
          <div className="space-y-3">
            {options.map((option) => (
              <button
                type="button"
                onClick={() => onSelect(option.value)}
                key={option.value}
                className={
                  currentSetType === option.value
                    ? "grid min-h-14 w-full grid-cols-[44px_1fr_28px] items-center rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-3 text-left transition active:scale-[0.99]"
                    : "grid min-h-14 w-full grid-cols-[44px_1fr_28px] items-center rounded-2xl border border-white/10 bg-[#232323] px-3 text-left transition active:scale-[0.99]"
                }
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl bg-black/20 text-base font-bold ${option.markerClassName}`}
                >
                  {option.marker}
                </span>
                <span className="text-base font-semibold text-white">
                  {option.label}
                </span>
                {currentSetType === option.value ? (
                  <CheckIcon className="h-5 w-5 text-emerald-300" />
                ) : null}
              </button>
            ))}
            <button
              type="button"
              onClick={onDelete}
              className="grid min-h-14 w-full grid-cols-[44px_1fr] items-center rounded-2xl border border-red-400/20 bg-red-500/10 px-3 text-left transition active:scale-[0.99]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-400/10">
                <TrashIcon className="h-5 w-5 text-red-300" />
              </span>
              <span className="text-base font-semibold text-red-100">
                Delete Set
              </span>
            </button>
          </div>
        </SheetField>
      </div>
    </BottomSheet>
  );
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
        <SheetField label="Selected RPE">
          <div className="flex h-16 items-center justify-center rounded-2xl border border-white/10 bg-[#232323] text-3xl font-semibold text-white">
            {selectedRpe ?? "0"}
          </div>
        </SheetField>

        <SheetField label="Select RPE">
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
        </SheetField>

        <button
          type="button"
          onClick={() => setSelectedRpe(null)}
          className="h-12 w-full rounded-2xl border border-white/10 bg-[#232323] text-sm font-bold text-zinc-300 transition active:scale-[0.99]"
        >
          Clear
        </button>
      </div>
    </BottomSheet>
  );
}

function ExercisePickerSheet({
  addingExerciseId,
  exercises,
  isLoading,
  loadError,
  onAddExercise,
  onClose,
  onRetry,
  onSearchChange,
  search,
  totalExerciseCount,
}: {
  addingExerciseId: string | null;
  exercises: Exercise[];
  isLoading: boolean;
  loadError: string | null;
  onAddExercise: (exercise: Exercise) => void;
  onClose: () => void;
  onRetry: () => void;
  onSearchChange: (value: string) => void;
  search: string;
  totalExerciseCount: number;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-0">
      <section className="flex max-h-[82dvh] w-full max-w-md flex-col rounded-t-3xl border border-white/10 bg-[#101010] shadow-2xl shadow-black">
        <div className="shrink-0 border-b border-white/10 px-5 pb-4 pt-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Add Exercise
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                {totalExerciseCount} in library
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-zinc-300 transition active:scale-95"
              aria-label="Close exercise picker"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-[#1b1b1b] px-3 py-2.5">
            <SearchIcon className="h-4 w-4 shrink-0 text-zinc-500" />
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search exercise"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-zinc-600"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
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

          {!isLoading && loadError ? (
            <InlineError
              message={loadError}
              onRetry={onRetry}
              title="Exercise library could not load"
            />
          ) : null}

          {!isLoading && !loadError && totalExerciseCount === 0 ? (
            <div className="py-14 text-center">
              <p className="text-base font-semibold text-white">
                No exercises yet
              </p>
              <p className="mx-auto mt-2 max-w-64 text-sm leading-6 text-zinc-500">
                Create exercises in the Profile tab, then add them here.
              </p>
            </div>
          ) : null}

          {!isLoading &&
          !loadError &&
          totalExerciseCount > 0 &&
          exercises.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-base font-semibold text-white">No matches</p>
              <p className="mt-2 text-sm text-zinc-500">
                Try a different search.
              </p>
            </div>
          ) : null}

          {!isLoading && !loadError && exercises.length > 0 ? (
            <div className="space-y-2 pb-4">
              {exercises.map((exercise) => (
                <ExercisePickerRow
                  exercise={exercise}
                  isAdding={addingExerciseId === exercise.id}
                  key={exercise.id}
                  onAdd={() => onAddExercise(exercise)}
                />
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ExercisePickerRow({
  exercise,
  isAdding,
  onAdd,
}: {
  exercise: Exercise;
  isAdding: boolean;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={isAdding}
      className="flex min-h-[74px] w-full items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#181818] px-3.5 py-3 text-left transition hover:border-white/10 hover:bg-[#1e1e1e] active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/10 text-sm font-bold text-emerald-300">
        {exercise.primary_muscle_group.name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-white">
          {exercise.name}
        </p>
        <p className="mt-1 truncate text-sm text-zinc-500">
          {exercise.primary_muscle_group.name} / {exercise.equipment_type.name}
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-zinc-300">
        {isAdding ? "Adding" : getExerciseTypeLabel(exercise.exercise_type)}
      </span>
    </button>
  );
}

function EmptyExerciseState({
  onAddExercise,
}: {
  onAddExercise: () => void;
}) {
  return (
    <section className="flex min-h-[28dvh] flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.05] text-zinc-400">
        <DumbbellIcon className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-white">
        No exercises
      </h2>
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

function SheetField({
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label="Close sheet"
      />
      <section className="relative flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-[28px] border border-white/10 bg-[#141414] shadow-2xl shadow-black">
        {children}
      </section>
    </div>
  );
}

function EditWorkoutSkeleton() {
  return (
    <div className="space-y-4 pt-4">
      <div className="h-16 animate-pulse rounded-2xl bg-white/[0.04]" />
      <div className="h-56 animate-pulse rounded-3xl bg-white/[0.035]" />
      <div className="h-48 animate-pulse rounded-3xl bg-white/[0.04]" />
    </div>
  );
}

function InlineError({
  message,
  onRetry,
  title,
}: {
  message: string;
  onRetry: () => void;
  title: string;
}) {
  return (
    <section className="mt-5 rounded-3xl border border-red-400/20 bg-red-500/10 p-5">
      <h2 className="text-base font-semibold text-red-100">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-red-100/70">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition active:scale-95"
      >
        Retry
      </button>
    </section>
  );
}

function SaveError({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm font-semibold leading-6 text-amber-100">
      {message}
    </div>
  );
}

function toDraftWorkout(workout: CompletedWorkoutDetail): DraftWorkout {
  const durationParts = toVisibleDurationParts(workout.duration_seconds);

  return {
    id: workout.id,
    defaultWeightUnit: workout.default_weight_unit,
    name: workout.name,
    description: workout.description ?? "",
    startedAtLocal: toLocalDateTimeInputValue(workout.started_at),
    durationHours: durationParts.hours.toString(),
    durationMinutes: durationParts.minutes.toString(),
    durationSecondsRemainder: durationParts.secondsAdjustment.toString(),
    volumeValue: workout.volume.value,
    volumeUnit: workout.volume.unit,
    exercises: renumberExercises(
      workout.exercises.map((exercise) =>
        renumberExerciseSets({
          clientId: exercise.id,
          id: exercise.id,
          exerciseId: exercise.exercise_id,
          orderIndex: exercise.order_index,
          exerciseNameSnapshot: exercise.exercise_name_snapshot,
          equipmentNameSnapshot: exercise.equipment_name_snapshot,
          primaryMuscleGroupNameSnapshot:
            exercise.primary_muscle_group_name_snapshot,
          inputWeightUnit: exercise.input_weight_unit,
          notes: exercise.notes ?? "",
          exerciseType: exercise.exercise_type ?? "weight_reps",
          sets: exercise.sets.map((set) => ({
            clientId: set.id,
            id: set.id,
            rowIndex: set.row_index,
            setNumber: set.set_number,
            setType: set.set_type,
            weightValue: set.weight === null ? "" : formatNumberInput(set.weight),
            weightUnit: set.weight_unit,
            repsValue: set.reps.toString(),
            rpeValue: set.rpe === null ? "" : formatNumberInput(set.rpe),
            checked: set.checked,
          })),
        }),
      ),
    ),
  };
}

function createDraftExercise(
  exercise: Exercise,
  defaultWeightUnit: WeightUnit,
  orderIndex: number,
): DraftWorkoutExercise {
  const inputWeightUnit =
    exercise.exercise_type === "weight_reps"
      ? exercise.weight_unit_preference ?? defaultWeightUnit
      : null;

  return renumberExerciseSets({
    clientId: createClientId("exercise"),
    id: null,
    exerciseId: exercise.id,
    orderIndex,
    exerciseNameSnapshot: exercise.name,
    equipmentNameSnapshot: exercise.equipment_type.name,
    primaryMuscleGroupNameSnapshot: exercise.primary_muscle_group.name,
    inputWeightUnit,
    notes: "",
    exerciseType: exercise.exercise_type,
    sets: [createBlankDraftSet(inputWeightUnit ?? defaultWeightUnit)],
  });
}

function createBlankDraftSet(defaultWeightUnit: WeightUnit): DraftWorkoutSet {
  return {
    clientId: createClientId("set"),
    id: null,
    rowIndex: 1,
    setNumber: 1,
    setType: "normal",
    weightValue: "",
    weightUnit: defaultWeightUnit,
    repsValue: "",
    rpeValue: "",
    checked: false,
  };
}

function renumberExercises(exercises: DraftWorkoutExercise[]) {
  return exercises.map((exercise, index) => ({
    ...renumberExerciseSets(exercise),
    orderIndex: index,
  }));
}

function renumberExerciseSets(
  exercise: DraftWorkoutExercise,
): DraftWorkoutExercise {
  let nextSetNumber = 1;
  let hasNumberedSet = false;

  return {
    ...exercise,
    sets: exercise.sets.map((set, index) => {
      if (set.setType === "warmup") {
        return { ...set, rowIndex: index + 1, setNumber: null };
      }

      if (set.setType === "drop") {
        if (!hasNumberedSet) {
          hasNumberedSet = true;
          const setNumber = nextSetNumber;
          nextSetNumber += 1;

          return {
            ...set,
            rowIndex: index + 1,
            setNumber,
            setType: "normal",
          };
        }

        return { ...set, rowIndex: index + 1, setNumber: null };
      }

      hasNumberedSet = true;
      const setNumber = nextSetNumber;
      nextSetNumber += 1;

      return { ...set, rowIndex: index + 1, setNumber };
    }),
  };
}

function validateDraft(draft: DraftWorkout):
  | {
      ok: true;
      startedAt: Date;
      durationSeconds: number;
    }
  | { ok: false; message: string } {
  const trimmedName = draft.name.trim();
  const startedAt = readLocalDateTimeInput(draft.startedAtLocal);
  const durationSeconds = getDurationSecondsFromInputs(
    draft.durationHours,
    draft.durationMinutes,
    draft.durationSecondsRemainder,
  );

  if (trimmedName.length < 1 || trimmedName.length > 120) {
    return { ok: false, message: "Workout title must be 1-120 characters." };
  }

  if (!startedAt) {
    return { ok: false, message: "Start date and time must be valid." };
  }

  if (durationSeconds === null) {
    return { ok: false, message: "Duration must be between 0min and 4h 59min." };
  }

  const invalidWeightedRows = draft.exercises.reduce(
    (count, exercise) =>
      count +
      exercise.sets.filter((set) => {
        if (exercise.exerciseType === "bodyweight_reps") {
          return false;
        }

        const weight = Number(normalizeNullableText(set.weightValue) ?? "0");
        const reps = parseNullableInteger(set.repsValue);

        return Number.isFinite(weight) && weight > 0 && (!reps || reps < 1);
      }).length,
    0,
  );

  if (invalidWeightedRows > 0) {
    return {
      ok: false,
      message: `${invalidWeightedRows} weighted ${invalidWeightedRows === 1 ? "row has" : "rows have"} weight but no reps.`,
    };
  }

  if (getDraftSummary(draft).recordedSetCount === 0) {
    return {
      ok: false,
      message: "Record at least one set with reps to save this workout.",
    };
  }

  return { ok: true, startedAt, durationSeconds };
}

function toSavePayload(
  draft: DraftWorkout,
  validation: { startedAt: Date; durationSeconds: number },
) {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    started_at: validation.startedAt.toISOString(),
    duration_seconds: validation.durationSeconds,
    exercises: draft.exercises.map((exercise) => ({
      id: exercise.id,
      exercise_id: exercise.exerciseId,
      notes: exercise.notes.trim() || null,
      input_weight_unit: exercise.inputWeightUnit,
      sets: exercise.sets.map((set) => {
        const showWeightInput = exercise.exerciseType !== "bodyweight_reps";

        return {
          id: set.id,
          set_type: set.setType,
          weight: showWeightInput ? normalizeNullableText(set.weightValue) : null,
          weight_unit: showWeightInput
            ? set.weightUnit ?? exercise.inputWeightUnit ?? draft.defaultWeightUnit
            : null,
          reps: parseNullableInteger(set.repsValue),
          rpe: normalizeNullableText(set.rpeValue),
          checked: set.checked,
        };
      }),
    })),
  };
}

function getDraftSummary(draft: DraftWorkout) {
  const durationSeconds =
    getDurationSecondsFromInputs(
      draft.durationHours,
      draft.durationMinutes,
      draft.durationSecondsRemainder,
    ) ?? 0;
  const recordedSetCount = draft.exercises.reduce(
    (count, exercise) =>
      count +
      exercise.sets.filter((set) => {
        const reps = parseNullableInteger(set.repsValue);

        return reps !== null && reps >= 1;
      }).length,
    0,
  );

  return {
    durationSeconds,
    recordedSetCount,
  };
}

function formatVolumeSummary(value: number, unit: WeightUnit) {
  if (value <= 0) {
    return `0 ${unit}`;
  }

  return `${formatDecimal(value.toFixed(2))} ${unit}`;
}

function formatDecimal(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return value;
  }

  return Number.isInteger(parsed) ? parsed.toString() : parsed.toFixed(2);
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

function parseNullableInteger(value: string) {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return null;
  }

  const parsed = Number(trimmedValue);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
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

function sortExercises(exercises: Exercise[]) {
  return [...exercises].sort((first, second) => {
    return first.name.localeCompare(second.name);
  });
}

function compactLabels(labels: Array<string | null>) {
  const compacted = labels.filter((label): label is string => Boolean(label));

  return compacted.length > 0 ? compacted.join(" / ") : "Exercise";
}

function normalizeNullableText(value: string) {
  const trimmedValue = value.trim();

  return trimmedValue.length === 0 ? null : trimmedValue;
}

function createClientId(prefix: string) {
  nextDraftId += 1;

  return `${prefix}-${Date.now()}-${nextDraftId}`;
}

function formatNumberInput(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

function formatSetLabel(set: DraftWorkoutSet) {
  if (set.setType === "warmup") {
    return "W";
  }

  if (set.setType === "failure") {
    return "F";
  }

  if (set.setType === "drop") {
    return "D";
  }

  return set.setNumber?.toString() ?? set.rowIndex.toString();
}

function getSetLabelClassName(setType: SetType) {
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

function getWeightColumnLabel(exerciseType: ExerciseType, weightUnit: WeightUnit) {
  if (exerciseType === "bodyweight_reps") {
    return "BW";
  }

  if (exerciseType === "weighted_bodyweight") {
    return `Add ${weightUnit.toUpperCase()}`;
  }

  if (exerciseType === "assisted_bodyweight") {
    return `Assist ${weightUnit.toUpperCase()}`;
  }

  return weightUnit.toUpperCase();
}

function getWeightInputLabel(exerciseType: ExerciseType) {
  if (exerciseType === "weighted_bodyweight") {
    return "Added";
  }

  if (exerciseType === "assisted_bodyweight") {
    return "Assist";
  }

  return "Weight";
}

function getExerciseTypeLabel(exerciseType: ExerciseType) {
  switch (exerciseType) {
    case "weight_reps":
      return "Weight";
    case "bodyweight_reps":
      return "Bodyweight";
    case "weighted_bodyweight":
      return "Weighted";
    case "assisted_bodyweight":
      return "Assisted";
  }
}

type IconProps = {
  className?: string;
};

function PlusIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 5v14M5 12h14"
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
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function SearchIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden>
      <path
        d="m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function CheckIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden>
      <path
        d="m5 12 4.2 4.2L19 6.5"
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
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden>
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

function DumbbellIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M7 7v10M17 7v10M4 10v4M20 10v4M7 12h10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}
