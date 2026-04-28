# Phase 11 - Edit Completed Workout

> **Author:** Codex (implementation plan), to be reviewed alongside the code.
> **Status:** Draft plan.
> **Scope:** Add completed workout edit mode for metadata, exercises, notes, and sets. Drag reorder remains out of scope.
> **Goal:** A saved workout can be opened from detail, edited without starting a live workout timer, and saved atomically back to the completed workout.

---

## 1. Context

Phase 10 added saved workout history and a completed workout detail screen backed by relational workout rows.

Phase 11 makes those completed rows editable while preserving MVP rules:

```txt
Saved detail -> Edit -> local draft -> PATCH full graph -> completed detail
```

The edit screen should feel like the live workout logger, but it is not an active workout. It has no timer, no minimize/floating-card flow, and no Save Workout confirmation screen.

## 2. Product Behavior

### 2.1 Entry point

Saved workout detail exposes an Edit action that opens:

```txt
/profile/workouts/[id]/edit
```

Cancel returns to the saved workout detail page without saving changes.

Successful Save returns to the saved workout detail page and refreshes the completed workout data.

### 2.2 Editable fields

The edit screen supports:

- workout title
- workout description
- start date/time
- duration
- exercise notes
- adding exercises
- removing exercises
- adding sets
- deleting sets
- set type
- set weight and unit
- set reps
- set RPE
- set checked state

### 2.3 Out of scope behavior

Do not implement:

- drag exercise reordering
- hard delete saved workout
- copy workout
- save as routine
- Previous column / exercise history
- social/feed behavior

Exercise order is preserved from the submitted graph. Explicit drag handles and reorder controls arrive in Phase 12.

## 3. API Plan

Add:

```txt
PATCH /api/workout-sessions/[id]/edit
```

The request body is a full graph:

```ts
type EditCompletedWorkoutRequest = {
  name: string;
  description: string | null;
  started_at: string;
  duration_seconds: number;
  exercises: {
    id?: string;
    exercise_id?: string;
    notes?: string | null;
    input_weight_unit?: "lbs" | "kg" | null;
    sets: {
      id?: string;
      set_type: "normal" | "warmup" | "failure" | "drop";
      weight: string | number | null;
      weight_unit: "lbs" | "kg" | null;
      reps: number | null;
      rpe: string | number | null;
      checked: boolean;
    }[];
  }[];
};
```

Rules:

- Return `400` for invalid UUIDs or invalid request bodies.
- Return `404` for missing sessions and for sessions that are not completed.
- Require at least one recorded set where `reps >= 1`.
- Reject weighted rows that have a positive weight but no recorded reps.
- Preserve snapshot fields for existing workout exercises.
- Snapshot source exercise name, equipment, and primary muscle for newly added exercises.
- Delete exercises and sets omitted from the submitted graph.
- Discard empty unrecorded rows on save, matching the finish flow.
- Recalculate `order_index`, `row_index`, `set_number`, `parent_set_id`, normalized weights, bodyweight-derived values, and volume in one transaction.
- Update `ended_at` from `started_at + duration_seconds`.

## 4. UI Plan

Add:

```txt
src/app/profile/workouts/[id]/edit/page.tsx
src/app/profile/workouts/[id]/edit/edit-workout-app.tsx
```

The edit app loads the completed workout detail data, maps it into a local draft, and sends the full graph only when Save is tapped.

Use mobile-first controls consistent with the live workout logger:

- sticky Save/Cancel header
- metadata fields at top
- exercise cards
- set rows with type, load, reps, RPE, and checked controls
- add exercise picker
- confirmation sheets for removing exercises and deleting sets

## 5. Validation Plan

Static validation:

- Read relevant local Next 16 docs before adding the dynamic edit route.
- `npm run lint`
- `npm run build`
- `git diff --check`

API smoke checks:

- invalid UUID returns `400`
- active workout id returns `404`
- completed workout edit keeps status `completed`
- metadata changes persist and recompute `ended_at`
- unchecked set with `reps >= 1` is saved
- checked empty set does not count as recorded
- save with zero recorded sets is rejected
- weighted row with weight but no reps is rejected
- adding an exercise snapshots name/equipment/muscle
- removing an exercise cascades its sets
- set type changes recalculate `set_number` separately from `row_index`

UI smoke checks:

- open detail, tap Edit, load edit screen
- edit metadata and save
- edit existing set and save
- add exercise plus recorded set and save
- remove exercise and save
- cancel leaves detail unchanged
- narrow mobile viewport has no overlapping controls
