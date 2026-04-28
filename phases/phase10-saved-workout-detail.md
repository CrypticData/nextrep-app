# Phase 10 — Saved Workout Detail

> **Author:** Codex (planning), to be reviewed before implementation.
> **Status:** Draft plan.
> **Scope:** Add completed workout history access and a saved workout detail screen. No schema changes expected.
> **Goal:** A completed workout can be found from Profile and opened to inspect saved metadata, exercises, and recorded sets.

---

## 1. Context

Phase 8 and Phase 9 made active workouts finishable:

```txt
Finish -> validate -> Save Workout screen -> POST /finish -> completed session
```

Phase 10 turns those completed relational rows into a readable saved workout experience.

The main spec defines Phase 10 as:

```txt
completed workout detail screen
show exercises in saved order
show recorded sets
show metadata
```

The Profile screen currently has a Workout History placeholder. Phase 10 should replace that placeholder with a minimal completed-workout list so there is a natural entry point into the detail page.

## 2. Product Behavior

### 2.1 Workout history entry point

In Profile, the Workouts section should load completed workouts and render personal history cards.

Each card shows:

- workout title
- completed date/time
- duration
- volume
- recorded set count
- a short exercise preview

Tapping a card opens the saved workout detail screen.

States:

- loading skeleton while history fetches
- empty state when no completed workouts exist
- inline error state if history cannot load

No social UI, avatars, likes, comments, sharing, or feed identity.

### 2.2 Saved workout detail

The detail screen shows:

- workout title
- description if present
- started date/time
- completed date/time
- duration
- total volume
- recorded set count
- exercises in saved `order_index`
- recorded sets within each exercise in saved `row_index`

The saved detail must primarily display workout exercise snapshot fields:

```txt
exercise_name_snapshot
equipment_name_snapshot
primary_muscle_group_name_snapshot
```

This preserves history readability after the source exercise is edited or hard-deleted later.

### 2.3 Recorded set rule

Saved detail shows sets where:

```txt
reps >= 1
```

The checkmark is not a save filter and must not decide whether a set appears in saved history.

Rows with null/zero reps should not appear in the detail response, because finish cleanup and validation are already based on the recorded-set rule.

### 2.4 Out of scope behavior

Do not implement:

- edit completed workout
- hard delete completed workout
- save as routine
- copy workout
- analytics charts
- records badges
- calendar
- Previous column
- social/feed behavior

If a kebab/menu affordance is added visually, it should only expose disabled or omitted actions until later phases. Prefer omitting it in Phase 10.

## 3. API Plan

### 3.1 Completed workout list

Add:

```txt
GET /api/workout-sessions/completed
```

Response shape:

```ts
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
```

Rules:

- Query only `status = "completed"`.
- Sort by `ended_at desc`, then `created_at desc`.
- Include only recorded sets in counts and volume.
- Limit the exercise preview to a small number, such as 3 exercises.
- Volume should use the session's `default_weight_unit` and existing unit conversion rules.

### 3.2 Completed workout detail

Add:

```txt
GET /api/workout-sessions/[id]
```

Response shape:

```ts
type CompletedWorkoutDetail = {
  id: string;
  name: string;
  description: string | null;
  status: "completed";
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  default_weight_unit: "lbs" | "kg";
  recorded_set_count: number;
  volume: {
    value: number;
    unit: "lbs" | "kg";
  };
  exercises: CompletedWorkoutExercise[];
};
```

Exercise shape:

```ts
type CompletedWorkoutExercise = {
  id: string;
  order_index: number;
  exercise_name_snapshot: string;
  equipment_name_snapshot: string | null;
  primary_muscle_group_name_snapshot: string | null;
  input_weight_unit: "lbs" | "kg" | null;
  exercise_type: "weight_reps" | "reps_only";
  recorded_set_count: number;
  sets: CompletedWorkoutSet[];
};
```

Set shape:

```ts
type CompletedWorkoutSet = {
  id: string;
  row_index: number;
  set_number: number | null;
  set_type: "warmup" | "normal" | "failure" | "drop";
  weight: number | null;
  weight_unit: "lbs" | "kg" | null;
  reps: number;
  rpe: number | null;
  checked: boolean;
  checked_at: string | null;
};
```

Rules:

- Return `404` if the session does not exist or is not completed.
- Exercises are ordered by `order_index asc`.
- Sets are ordered by `row_index asc`.
- Sets are filtered to `reps >= 1`.
- Preserve `row_index` and `set_number` as separate fields.
- For `reps_only` exercises, weight fields remain null.

## 4. Service Plan

Add saved-workout read helpers, likely in a new file:

```txt
src/lib/completed-workout-api.ts
```

Responsibilities:

- load completed workout list
- load completed workout detail
- map Prisma camelCase fields to API snake_case
- compute duration from `startedAt` and `endedAt`
- compute recorded set counts
- compute volume in the session default unit

Implementation notes:

- Prefer relational Prisma queries with nested `include` or `select`.
- Do not add JSON columns or denormalized saved-workout blobs.
- Keep summary math shared between list and detail helpers to avoid drift.
- Avoid broad `any`; use generated Prisma payload types or explicit response types.

## 5. UI Plan

### 5.1 Profile history section

Update `src/app/profile-menu-app.tsx` so the Workouts section loads real completed workouts.

Recommended approach:

- keep it as a client component
- fetch `GET /api/workout-sessions/completed` on mount
- map API items to the existing `WorkoutHistoryCardViewModel`
- make each card a button or link to `/profile/workouts/[id]`
- update the profile workout count from loaded completed workouts

The existing card structure is a good starting point, but use tighter radii where touched and avoid adding social metadata.

### 5.2 Detail route

Add an App Router page:

```txt
src/app/profile/workouts/[id]/page.tsx
```

Use a client component for the interactive/mobile detail UI:

```txt
src/app/profile/workouts/[id]/saved-workout-detail-app.tsx
```

Before implementation, read the relevant local Next 16 docs for dynamic route params and navigation:

```txt
node_modules/next/dist/docs/
```

Detail screen layout:

- sticky top bar with back button and title
- compact metadata band
- optional description block
- summary metrics for duration, volume, sets
- exercise sections with set rows

Set row display:

- show set label from `set_number` and `set_type`
- show weight/reps for weighted exercises
- show reps for reps-only exercises
- show RPE only when present
- keep warmup/drop/failure labels visible

### 5.3 Formatting helpers

Add or reuse local helpers for:

- date/time labels
- duration labels
- volume labels
- set type labels
- decimal trimming for weight and volume

Prefer keeping helpers close to the saved workout UI unless they are reused by API/service code.

## 6. Verification

Static:

- [ ] Read relevant local Next 16 docs before adding the dynamic page.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] `git diff --check` clean.
- [ ] No Prisma migration generated.

API:

- [ ] `GET /api/workout-sessions/completed` returns completed workouts newest first.
- [ ] Completed list excludes active and discarded/deleted workouts.
- [ ] List counts and volume use only sets with `reps >= 1`.
- [ ] `GET /api/workout-sessions/[id]` returns completed workout detail.
- [ ] Detail returns exercises in `order_index`.
- [ ] Detail returns recorded sets in `row_index`.
- [ ] Detail preserves `row_index` and `set_number` separately.
- [ ] Detail uses snapshot names.
- [ ] Missing, invalid, or active workout id returns the correct error.

UI:

- [ ] Profile Workouts loads completed workouts.
- [ ] Empty state appears when no completed workouts exist.
- [ ] Tapping a history card opens detail.
- [ ] Back from detail returns to Profile.
- [ ] Detail shows title, description, dates, duration, volume, and recorded set count.
- [ ] Weighted, reps-only, warmup, failure, and drop rows render legibly on mobile.
- [ ] No social actions or public/profile-feed assumptions appear.

DB smoke:

- [ ] Create or reuse a completed workout with multiple exercises.
- [ ] Confirm API order matches `workout_session_exercises.order_index`.
- [ ] Confirm API set order matches `workout_sets.row_index`.
- [ ] Confirm a checked empty row is not shown, while an unchecked row with `reps >= 1` is shown.

## 7. Out Of Scope

- Editing completed workout metadata or sets.
- Hard deleting completed workouts.
- Exercise reordering.
- Autosync retry state.
- Routines or templates.
- Analytics, records, and calendar views.

## 8. Handoff Notes

After implementation:

- Append a `## YYYY-MM-DD (Codex)` entry to `HANDOFF.md`.
- Update `PHASE_STATUS.md`.
- Commit Phase 10 separately from Phase 9.
