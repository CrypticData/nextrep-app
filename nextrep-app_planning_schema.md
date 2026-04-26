# Workout Tracker Engineering Implementation Specification

## Document Purpose

This document is the implementation specification for a single-user, self-hosted workout tracking web app.

A software engineer should be able to read this document and understand:

- what the app is
- what is in scope for the first release
- what is deliberately out of scope
- the recommended tech stack
- an alternative tech stack and tradeoffs
- the core data model
- the live workout behavior
- the database schema
- the API shape
- the frontend architecture
- the build order
- important edge cases and validation rules

---

# 1. Product Overview

## 1.1 App Summary

The app is a self-hosted workout tracker intended to run in Docker on a personal server.

The app is primarily accessed from a phone browser and is optimized for live workout logging at the gym.

This is a **single-user app**.

There are no planned social features:

- no sharing
- no public profiles
- no followers
- no comments
- no likes
- no public workout visibility
- no social feed

The main value of the app is reliable, fast, mobile-friendly workout logging.

---

## 1.2 Core MVP Feature

The core MVP feature is the live workout flow.

Primary flow:

1. User taps **Start Empty Workout**.
2. A live workout screen opens.
3. A timer starts from the workout `started_at` time.
4. User adds exercises.
5. Each added exercise automatically gets one blank set row.
6. User adds more set rows as needed.
7. User enters weight, reps, optional RPE, and optional set type.
8. User may check set rows as a visual progress indicator.
9. User taps **Finish**.
10. App validates the workout.
11. If invalid weighted rows exist, app warns and asks user to discard those rows.
12. App opens the **Save Workout** screen.
13. User enters workout title, description, start date/time, and duration.
14. User saves the workout.
15. The workout becomes completed.
16. User can later open the completed workout in **Edit Workout** mode.
17. Edit Workout mode behaves like live workout editing, but without a running timer.
18. Saving from Edit Workout commits directly and does not show the Save Workout screen again.

---

## 1.3 MVP Scope

MVP includes:

- exercise creation
- exercise editing
- exercise hard deletion
- equipment reference data
- muscle group reference data
- global default weight unit setting
- start empty workout
- active workout timer
- active workout autosync
- minimize active workout
- floating active-workout card on main screens
- add exercises to workout
- add set rows
- delete set rows
- set type support
- weight/reps/RPE input
- per-set or per-exercise logging unit selection
- finish validation
- Save Workout screen
- completed workout detail view
- completed workout edit mode
- hard delete saved workout

---

## 1.4 Post-MVP Scope

Post-MVP features:

- routines / workout splits
- rest timer
- Previous column historical lookup
- analytics
- exercise variants

Features not planned:

- social media
- sharing
- followers
- comments
- likes
- public visibility

---

# 2. Recommended Tech Stack

## 2.1 Recommended Stack

```txt
Frontend: React + TypeScript + Vite + Tailwind CSS
Backend: FastAPI + Python + SQLAlchemy or SQLModel + Alembic
Database: PostgreSQL
Deployment: Docker Compose
```

---

## 2.2 Why This Stack Fits

### React

React is a strong fit because the app is interaction-heavy.

The live workout screen includes:

- nested workout state
- editable set rows
- timers
- checkmarks
- weight unit selection
- RPE selection
- set type menus
- exercise reordering
- active workout minimization
- floating active workout card
- edit mode reuse

React has a large ecosystem for mobile-friendly web UI, drag handles, bottom sheets, forms, and state management.

### TypeScript

TypeScript should be used from the start.

The app has many nested structures:

- exercise
- workout session
- workout exercise
- workout set
- set type
- finish validation response
- save workout payload
- edit workout payload

TypeScript helps prevent bugs such as:

- treating empty input as `0`
- treating nullable reps as valid
- accidentally saving checked sets only
- confusing `row_index` with `set_number`
- confusing entered weight unit with default calculation unit

### Vite

Vite is a simple, fast frontend build tool.

It is appropriate because this app does not require server-side rendering.

Vite builds static frontend assets that can be served from a simple container.

### Tailwind CSS

Tailwind is useful for rapidly building the mobile-first UI.

The app needs:

- dark-mode-first screens
- large tap targets
- compact table-like set rows
- bottom sheets
- floating cards
- safe-area spacing
- consistent visual rhythm

Tailwind helps keep this consistent without a large custom CSS system.

### FastAPI

FastAPI is a good backend choice because:

- REST APIs are simple to define.
- Pydantic gives request/response validation.
- API docs are generated automatically.
- Python is productive for backend business rules.
- It works well with PostgreSQL and Docker.

FastAPI will handle:

- reference data endpoints
- exercise CRUD
- workout session lifecycle
- live workout autosync endpoints
- finish validation
- save workout logic
- edit workout logic
- hard deletion

### PostgreSQL

PostgreSQL is the right database because workout data is relational.

The app should not save completed workouts only as JSON blobs.

Relational data makes these future features much easier:

- Previous column
- analytics
- progress charts
- volume by exercise
- volume by muscle group
- routines
- variants

### Docker Compose

Docker Compose is ideal for a self-hosted single-user app.

Initial services:

```txt
frontend
backend
postgres
```

Reverse proxy planning is out of scope for this document.

---

## 2.3 Alternative Tech Stack

Alternative stack:

```txt
Frontend/backend: SvelteKit + TypeScript
Styling: Tailwind CSS
Database: PostgreSQL
ORM: Drizzle or Prisma
Deployment: Docker Compose
```

### Why This Alternative Works

SvelteKit can serve both the frontend and backend routes in one TypeScript application.

Instead of separate React and FastAPI apps, the app can be written in one full-stack TypeScript project.

### Pros

- One language across frontend and backend.
- Less boilerplate than React in many UI flows.
- Very productive for small-to-medium self-hosted apps.
- Built-in routing and server routes.
- Tailwind integration is excellent.
- PostgreSQL still provides a strong relational data layer.
- Docker Compose deployment remains simple.

### Cons

- Smaller ecosystem than React.
- Fewer engineers are deeply familiar with SvelteKit compared with React.
- Some mobile drag/drop and complex interaction libraries are more mature in React.
- FastAPI may be cleaner for a larger standalone backend API.
- If the project grows, separating backend and frontend may be easier with React + FastAPI.

### Recommendation

Use React + FastAPI if the priority is a common, widely understood stack with mature frontend libraries.

Use SvelteKit if the priority is a leaner full-stack TypeScript app with fewer moving parts.

For this project, the recommended stack remains:

```txt
React + TypeScript + Vite + Tailwind
FastAPI + PostgreSQL
Docker Compose
```

---

# 3. Core Domain Concepts

## 3.1 Single-User App

The app is designed for one user.

The database does not need multi-user social modeling.

Authentication may still exist to protect access to the app, but product behavior does not depend on multiple users.

Implementation options:

```txt
Option A: no users table, app assumes a single owner
Option B: one users table for login/auth, but no social or multi-user features
```

Recommended implementation:

Use a minimal `users` table only if login/auth is needed. Otherwise, omit user ownership fields from core schema for simplicity.

If auth may be added later, keeping `user_id` columns is acceptable, but engineers should understand the app is still single-user.

---

## 3.2 Exercise

An exercise is a reusable library record created by the user.

Examples:

```txt
Flat Bench Press
Squat
Lat Pulldown
Dumbbell Curl
```

Exercises are not baked into the app as default records in v1.

The user creates their own exercises.

Exercise fields:

```txt
name
description
equipment
primary muscle group
secondary muscle groups
```

---

## 3.3 Equipment Type

Equipment types are reference values.

Initial equipment types:

```txt
Barbell
Dumbbell
Machine
```

Equipment is stored in a table so future equipment can be added without a schema change.

Examples of future equipment:

```txt
Cable
Bodyweight
Kettlebell
Resistance Band
Smith Machine
```

---

## 3.4 Muscle Group

Muscle groups are fixed reference values.

Users should not create arbitrary muscle groups.

Initial muscle groups:

```txt
Abdominals
Abductors
Adductors
Biceps
Calves
Chest
Forearms
Full Body
Glutes
Hamstrings
Lats
Lower Back
Neck
Quadriceps
Shoulders
Traps
Triceps
Upper Back
```

Primary and secondary muscle groups use the same list.

Rules:

```txt
Primary muscle group: required, one only
Secondary muscle groups: optional, multiple allowed
Secondary may include the same muscle as primary
```

---

## 3.5 Workout Session

A workout session is an actual workout instance.

Statuses:

```txt
active
completed
```

An active workout is currently being logged.

A completed workout has been saved.

Active workouts are hard-deleted if discarded.

Saved workouts are hard-deleted if deleted.

---

## 3.6 Workout Exercise

A workout exercise is an exercise added to one workout session.

It is not the reusable exercise itself.

Example:

```txt
Reusable exercise: Flat Bench Press
Workout exercise: Flat Bench Press inside Apr 26 workout
```

Workout exercises store snapshots so saved workout history remains readable even if the reusable exercise is later edited or deleted.

Snapshot fields:

```txt
exercise_name_snapshot
equipment_name_snapshot
primary_muscle_group_name_snapshot
```

---

## 3.7 Workout Set

A workout set is one row under a workout exercise.

Set row fields:

```txt
set label
previous column, post-MVP
weight
unit
reps
RPE
checkmark
```

The checkmark is visual and affects the live top set count.

Saved workout inclusion is based on reps, not checkmark state.

---

# 4. Database Schema

## 4.1 UUID Setup

Use UUID primary keys.

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

Then use:

```sql
gen_random_uuid()
```

---

## 4.2 Users, Optional

For a single-user app, this table is optional.

Use it if the app needs login/auth.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

If implemented, user-owned tables can include `user_id`.

If not implemented, omit `user_id` from the schema examples below.

---

## 4.3 App Settings

Stores global single-user settings.

```sql
CREATE TABLE app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  default_weight_unit TEXT NOT NULL DEFAULT 'lbs',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (id = 1),
  CHECK (default_weight_unit IN ('lbs', 'kg'))
);
```

Rules:

- There should only be one settings row.
- `default_weight_unit` controls the default unit throughout the app.
- Live workout logging can override the unit per set or exercise context.

---

## 4.4 Equipment Types

```sql
CREATE TABLE equipment_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Seed:

```sql
INSERT INTO equipment_types (name) VALUES
  ('Barbell'),
  ('Dumbbell'),
  ('Machine')
ON CONFLICT (name) DO NOTHING;
```

---

## 4.5 Muscle Groups

```sql
CREATE TABLE muscle_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Seed:

```sql
INSERT INTO muscle_groups (name) VALUES
  ('Abdominals'),
  ('Abductors'),
  ('Adductors'),
  ('Biceps'),
  ('Calves'),
  ('Chest'),
  ('Forearms'),
  ('Full Body'),
  ('Glutes'),
  ('Hamstrings'),
  ('Lats'),
  ('Lower Back'),
  ('Neck'),
  ('Quadriceps'),
  ('Shoulders'),
  ('Traps'),
  ('Triceps'),
  ('Upper Back')
ON CONFLICT (name) DO NOTHING;
```

---

## 4.6 Exercises

```sql
CREATE TABLE exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  equipment_type_id UUID NOT NULL REFERENCES equipment_types(id),
  primary_muscle_group_id UUID NOT NULL REFERENCES muscle_groups(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

If using auth, add:

```sql
user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
```

Rules:

- Exercise deletion is hard delete.
- Saved workout history remains readable through workout exercise snapshots.

---

## 4.7 Exercise Secondary Muscle Groups

```sql
CREATE TABLE exercise_secondary_muscle_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  muscle_group_id UUID NOT NULL REFERENCES muscle_groups(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (exercise_id, muscle_group_id)
);
```

Rules:

- Secondary muscle groups are optional.
- Secondary muscle groups are multi-select.
- Secondary can include the same muscle as primary.

---

## 4.8 Workout Sessions

```sql
CREATE TABLE workout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  description TEXT,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (status IN ('active', 'completed'))
);
```

If using auth, add:

```sql
user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
```

Rules:

- Starting a workout creates `status = active`.
- Saving a workout changes status to `completed`.
- Discarding an active workout hard-deletes it.
- Deleting a completed workout hard-deletes it.
- Only one active workout should exist.

For single-user enforcement, create a partial unique index:

```sql
CREATE UNIQUE INDEX one_active_workout
ON workout_sessions ((status))
WHERE status = 'active';
```

If using users:

```sql
CREATE UNIQUE INDEX one_active_workout_per_user
ON workout_sessions (user_id)
WHERE status = 'active';
```

---

## 4.9 Workout Session Exercises

```sql
CREATE TABLE workout_session_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_session_id UUID NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_id UUID REFERENCES exercises(id) ON DELETE SET NULL,
  order_index INTEGER NOT NULL,

  exercise_name_snapshot TEXT NOT NULL,
  equipment_name_snapshot TEXT,
  primary_muscle_group_name_snapshot TEXT,

  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (workout_session_id, order_index)
);
```

Rules:

- `order_index` represents exercise order in the performed workout.
- Exercises can be reordered in live workout and edit workout mode.
- Exercise reordering is persisted and reflected in saved workout detail.
- If the reusable exercise is deleted, `exercise_id` becomes null, but snapshots remain.

---

## 4.10 Workout Sets

```sql
CREATE TABLE workout_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_session_exercise_id UUID NOT NULL REFERENCES workout_session_exercises(id) ON DELETE CASCADE,

  row_index INTEGER NOT NULL,
  set_number INTEGER,
  set_type TEXT NOT NULL DEFAULT 'normal',
  parent_set_id UUID REFERENCES workout_sets(id) ON DELETE SET NULL,

  weight NUMERIC(8, 2),
  weight_unit TEXT NOT NULL DEFAULT 'lbs',
  weight_in_default_unit NUMERIC(10, 2),
  reps INTEGER,
  rpe NUMERIC(3, 1),

  checked BOOLEAN NOT NULL DEFAULT false,
  checked_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (workout_session_exercise_id, row_index),
  CHECK (set_type IN ('normal', 'warmup', 'failure', 'drop')),
  CHECK (weight_unit IN ('lbs', 'kg')),
  CHECK (rpe IS NULL OR (rpe >= 1 AND rpe <= 10))
);
```

Application validation should enforce RPE increments of 0.5.

---

# 5. Workout Set Rules

## 5.1 Row Index vs Set Number

Use two separate ordering concepts:

```txt
row_index = physical row order in the UI
set_number = numbered working-set sequence
```

Rows cannot be manually reordered.

Rows are ordered by creation order, except deletion causes reindexing.

If row 2 is deleted, row 3 becomes row 2.

---

## 5.2 Set Types

Initial set types:

```txt
normal
warmup
failure
drop
```

Display labels:

```txt
normal  -> 1, 2, 3, etc.
warmup  -> W
failure -> F
drop    -> D
```

Final numbering behavior:

```txt
Warm Up: displays W and does not consume a set number
Normal: displays its set number and consumes a set number
Failure: displays F and consumes a set number
Drop: displays D and attaches to previous numbered/failure set; it does not consume a new set number
```

Example:

```txt
Row 1: W      -> no set_number
Row 2: W      -> no set_number
Row 3: F      -> set_number 1
Row 4: D      -> parent_set_id = Row 3, no set_number
Row 5: Normal -> set_number 2
Row 6: Normal -> set_number 3
```

Add Set defaults to:

```txt
set_type = normal
```

---

## 5.3 Recorded Set Rule

A set is recorded if:

```txt
reps >= 1
```

Checkmark is not required for recording.

Examples:

```txt
20 lbs x 9, checked = true  -> recorded
20 lbs x 9, checked = false -> recorded
0 lbs x 1, checked = false  -> recorded
20 lbs x 0                  -> invalid/not recorded
20 lbs x empty              -> invalid/not recorded
empty weight + empty reps   -> ignored/not recorded
```

---

## 5.4 Invalid Weighted Row Rule

An invalid weighted row is:

```txt
weight > 0 AND reps is null/empty/0
```

If invalid weighted rows exist when the user taps Finish:

1. Show warning before Save Workout screen.
2. Tell user those rows cannot be recorded.
3. Ask user to discard them before continuing.
4. If user confirms, delete those rows and reindex.
5. Continue to Save Workout screen.

Completely empty rows do not need to trigger the warning.

---

## 5.5 Checkmark Rule

The checkmark is a visual progress indicator.

It affects:

```txt
live top set count
row styling
user confidence during logging
future rest timer trigger
```

It does not determine whether a set is saved.

---

## 5.6 Top Set Count Rule

During live workout:

```txt
Top Sets count = number of checked rows
```

Saved workout recorded set count:

```txt
Recorded sets = all sets with reps >= 1
```

These can differ.

This is intentional.

---

## 5.7 Weight Unit Rule

The app has a global default weight unit:

```txt
lbs
kg
```

Live workout set rows default to that unit.

The user can override the unit while logging if needed.

Example:

```txt
Global default: lbs
Machine stack: kg
User logs that exercise in kg
Workout summary converts that weight to lbs for volume
```

Store:

```txt
weight = entered value
weight_unit = entered unit
weight_in_default_unit = converted value used for summaries
```

Conversion:

```txt
1 kg = 2.2046226218 lbs
1 lb = 0.45359237 kg
```

---

## 5.8 RPE Rule

RPE is optional per set.

Rules:

```txt
nullable
not required to save workout
not required for set recording
does not affect volume
does not affect finish validation
editable in live workout
editable in completed workout edit mode
```

Allowed values:

```txt
1 through 10
0.5 increments allowed
blank = null
```

Valid examples:

```txt
6
7
8.5
9
9.5
10
```

Invalid examples:

```txt
0
10.5
11
-1
```

---

# 6. Live Workout Behavior

## 6.1 Start Empty Workout

When the user taps **Start Empty Workout**:

1. Backend checks if an active workout already exists.
2. If active workout exists, return that workout.
3. If not, create a new active workout.
4. Frontend opens the live workout screen.
5. Timer starts from `started_at`.

Only one active workout can exist.

---

## 6.2 Timer

Do not store timer ticks.

Store:

```txt
started_at
ended_at
```

During active workout:

```txt
elapsed = now - started_at
```

On Save Workout screen, user may edit:

```txt
start date/time
duration
```

Then backend calculates:

```txt
ended_at = started_at + duration
```

---

## 6.3 Add Exercise

When the user adds an exercise:

1. Backend creates a workout exercise row.
2. Backend snapshots exercise display fields.
3. Backend assigns next `order_index`.
4. Backend automatically creates the first blank set row.

Default first set:

```txt
row_index = 1
set_type = normal
set_number = 1
weight = 0
weight_unit = global default
reps = null
rpe = null
checked = false
```

---

## 6.4 Add Set

Add Set is scoped per exercise.

Clicking Add Set creates a new row:

```txt
set_type = normal
weight = 0
reps = null
checked = false
```

The system recalculates row indexes and set numbers.

---

## 6.5 Delete Set

When a set row is deleted:

1. Delete the row.
2. Reindex remaining `row_index` values.
3. Recalculate `set_number` values based on set type rules.
4. Reattach or clear invalid drop-set `parent_set_id` values as needed.

---

## 6.6 Exercise Reordering

Exercises can be reordered using a drag handle.

This is a visual and historical indicator of the order the exercises were performed.

Only the drag handle should initiate drag.

Do not make the entire exercise card draggable because mobile drag can conflict with scroll.

Persist exercise order after drag ends.

---

## 6.7 Autosync

Active workout changes should sync to the server.

This is required so minimizing and reopening the live workout restores the latest state.

Recommended sync behavior:

Save immediately:

```txt
add exercise
remove exercise
add set
delete set
change set type
check/uncheck set
change exercise order
```

Debounced save, roughly 300-600ms:

```txt
weight input
reps input
RPE input
notes input
```

If sync fails:

- keep local UI change visible
- show a small unsaved/retrying state
- retry automatically
- prevent Finish while failed unsaved changes remain

This is not offline support. It is basic reliability for temporary network/server issues.

---

## 6.8 Minimize and Floating Card

Clicking the downward arrow in live workout minimizes the live workout screen.

The workout remains active.

A floating active-workout card appears at the bottom of main menu screens.

The card should not appear in nested submenus, detail screens, or edit screens.

Tapping the floating card reopens the live workout in the latest synced state.

The floating card may show:

```txt
Workout timer
current or last edited exercise name
small status indicator
```

Timer still derives from `started_at`.

---

# 7. Finish and Save Workout Flow

## 7.1 Finish Button Flow

When user taps Finish:

1. Validate that at least one set has `reps >= 1`.
2. If no valid sets exist, show error.
3. Check for invalid weighted rows.
4. If invalid weighted rows exist, show discard warning.
5. If user confirms discard, delete invalid rows and reindex.
6. Remove completely empty rows.
7. Open Save Workout screen.

---

## 7.2 Save Workout Screen

Save Workout screen includes:

```txt
Workout title
Duration summary
Volume summary
Recorded set count
When / start date-time
Description
Discard Workout
Save button
```

No social visibility is needed.

No media upload is needed for MVP.

User can edit:

```txt
title
description
start date/time
duration
```

On save:

```txt
status = completed
started_at = selected start date/time
ended_at = started_at + selected duration
```

---

## 7.3 Save Workout Validation

Backend must enforce:

```txt
at least one set has reps >= 1
no invalid weighted rows remain
```

Do not rely only on frontend validation.

---

# 8. Completed Workout Edit Mode

A completed workout can be opened in Edit Workout mode.

Edit mode is similar to live workout mode, except:

```txt
no running timer
workout is already completed
Save commits directly
Save does not show Save Workout screen again
```

User can edit:

```txt
workout title
workout description
start date/time
duration
exercises
exercise order
exercise notes
sets
set types
weight
unit
reps
RPE
checkmark state
```

Validation rules are the same as live workout.

A completed workout cannot be saved if editing makes all sets invalid.

---

# 9. API Design

## 9.1 General Principles

Use REST JSON endpoints.

Return updated server state after mutations when useful.

For the single-user app, ownership checks may be minimal, but endpoints should still be structured cleanly.

---

## 9.2 Reference Data

```txt
GET /equipment-types
GET /muscle-groups
GET /settings
PATCH /settings
```

---

## 9.3 Exercise Endpoints

```txt
POST   /exercises
GET    /exercises
GET    /exercises/:id
PATCH  /exercises/:id
DELETE /exercises/:id
```

Create request:

```json
{
  "name": "Flat Bench Press",
  "description": "Barbell bench press on a flat bench.",
  "equipment_type_id": "uuid",
  "primary_muscle_group_id": "uuid",
  "secondary_muscle_group_ids": ["uuid", "uuid"]
}
```

Exercise delete is hard delete.

Saved workout history remains readable through snapshots.

---

## 9.4 Workout Session Endpoints

```txt
POST   /workout-sessions
GET    /workout-sessions/active
GET    /workout-sessions/:id
PATCH  /workout-sessions/:id
DELETE /workout-sessions/:id
POST   /workout-sessions/:id/discard
```

`POST /workout-sessions` starts an empty workout.

If an active workout already exists, return it instead of creating another.

`POST /workout-sessions/:id/discard` hard-deletes the active workout.

`DELETE /workout-sessions/:id` hard-deletes a completed workout.

---

## 9.5 Workout Exercise Endpoints

```txt
POST   /workout-sessions/:id/exercises
PATCH  /workout-session-exercises/:id
DELETE /workout-session-exercises/:id
PATCH  /workout-sessions/:id/exercise-order
```

Adding an exercise should also auto-create the first blank set.

Bulk exercise reorder request:

```json
{
  "workout_exercise_ids": ["uuid1", "uuid2", "uuid3"]
}
```

---

## 9.6 Workout Set Endpoints

```txt
POST   /workout-session-exercises/:id/sets
PATCH  /sets/:id
DELETE /sets/:id
```

Set update request:

```json
{
  "weight": 20,
  "weight_unit": "lbs",
  "reps": 9,
  "rpe": 8.5,
  "checked": true,
  "set_type": "normal"
}
```

Changing set type should trigger recalculation of set numbers.

Deleting a set should trigger row reindexing and set number recalculation.

---

## 9.7 Finish Endpoints

Validate finish:

```txt
POST /workout-sessions/:id/finish/validate
```

Invalid weighted response:

```json
{
  "can_continue": false,
  "reason": "invalid_weighted_sets",
  "invalid_sets": [
    {
      "set_id": "uuid",
      "exercise_name": "Bench Press",
      "row_index": 2,
      "weight": 20,
      "reps": 0
    }
  ]
}
```

Discard invalid rows:

```txt
POST /workout-sessions/:id/sets/discard-invalid
```

Finish/save workout:

```txt
POST /workout-sessions/:id/finish
```

Request:

```json
{
  "name": "Late night workout",
  "description": "Felt good.",
  "started_at": "2026-04-26T01:52:00Z",
  "duration_seconds": 1920
}
```

Backend calculates `ended_at`.

---

## 9.8 Edit Completed Workout Endpoint

Recommended:

```txt
PATCH /workout-sessions/:id/edit
```

This can accept the full edited workout graph.

Alternative implementation:

Reuse the same individual endpoints used during live workout and have a final Save button update metadata.

Either approach is acceptable as long as Edit Workout save does not show the Save Workout screen again.

---

# 10. Frontend Architecture

## 10.1 Suggested Folder Structure

```txt
frontend/
  src/
    api/
      client.ts
      exercises.ts
      workouts.ts
      reference.ts
      settings.ts
    components/
      Button.tsx
      Modal.tsx
      BottomSheet.tsx
      NumberInput.tsx
      TextInput.tsx
    features/
      exercises/
        ExerciseList.tsx
        ExerciseForm.tsx
        exerciseTypes.ts
      workouts/
        LiveWorkoutScreen.tsx
        WorkoutExerciseCard.tsx
        WorkoutSetRow.tsx
        SetTypeSheet.tsx
        SaveWorkoutScreen.tsx
        EditWorkoutScreen.tsx
        WorkoutDetailScreen.tsx
        ActiveWorkoutFloatingCard.tsx
        workoutTypes.ts
        workoutUtils.ts
      settings/
        SettingsScreen.tsx
    main.tsx
```

---

## 10.2 Important Frontend Components

Core components:

```txt
LiveWorkoutScreen
WorkoutExerciseCard
WorkoutSetRow
SetTypeSheet
SaveWorkoutScreen
EditWorkoutScreen
WorkoutDetailScreen
ActiveWorkoutFloatingCard
ExerciseForm
ExerciseList
```

LiveWorkoutScreen and EditWorkoutScreen should share as much UI as possible.

Edit Workout should not be a separate fully duplicated implementation.

---

# 10.3 Uploaded HTML Prototype UI Documentation

The uploaded HTML file is a single-file React prototype for a workout tracking app UI.

It should be treated as a visual and interaction reference, not as production architecture.

The prototype is useful for understanding:

- mobile-first layout direction
- dark theme styling
- workout logging screen layout
- exercise list UI
- save/edit workout concepts
- settings examples
- set row UI patterns
- bottom navigation structure

It should not be used directly as production code without refactoring.

---

## Prototype Technology

The HTML prototype uses:

```txt
React 18 from CDN
ReactDOM from CDN
Babel standalone in the browser
inline CSS
inline React components
hardcoded mock data
```

Production should not use this structure.

Production should use:

```txt
React + TypeScript + Vite
component files
API-driven data
typed models
proper state management
build step
Dockerized frontend output
```

---

## Global CSS and App Shell

The prototype defines global CSS for:

- full-screen mobile app layout
- dark background
- hidden scrollbars
- bottom navigation
- cards
- section labels
- search input styling
- exercise rows
- settings rows
- toggles
- stat pills

Useful for engineering:

- spacing and visual direction
- dark theme colors
- card radius and border style
- bottom navigation layout
- mobile-safe-area awareness

Do not copy directly without refactoring.

Production should move these styles into Tailwind classes or reusable components.

---

## Mock Data

The prototype includes hardcoded arrays:

```txt
chartData
exercises
workoutLog
routines
catColors
EX_HISTORY
FOLDERS
```

These are mock/demo data only.

Production should replace these with API data from PostgreSQL.

Do not treat the hardcoded exercises, routines, workouts, charts, or history as real seed data.

Important:

The app will not include default exercises in MVP. Users create their own exercises.

---

## Tweak Panel

The prototype includes:

```txt
TWEAK_DEFAULTS
panel state
window.postMessage edit mode integration
accent color tweak buttons
```

This is prototype/edit-mode tooling only.

Production engineers do not need to implement this unless a design/dev tweak mode is intentionally desired.

For production, replace with normal app settings if accent color customization is wanted later.

---

## Atomic UI Components

The prototype defines small reusable visual components:

```txt
Avatar
Chevron
Toggle
SectionLabel
BackBtn
```

Useful concepts:

- consistent section labels
- reusable chevrons
- toggle pattern
- back button pattern

Prototype-only aspects:

- Avatar is hardcoded with a letter and fake styling
- Back labels are prototype-specific
- Toggle state is local only

Production should reimplement these as typed React components.

---

## Chart Component

Component:

```txt
WorkoutChart
```

Purpose:

- displays simple bar chart for duration, volume, or reps

This is post-MVP or analytics-related.

Engineers do not need to build this for the initial core live workout MVP.

If analytics are implemented later, replace the mock chart with real workout history data.

---

## Exercise Thumbnail

Component:

```txt
ExThumb
```

Purpose:

- circular placeholder illustration based on exercise category color

This is visual polish only.

Production can keep a simplified version or skip it for MVP.

Do not depend on `catColors` as final product data.

The real app uses muscle groups and equipment reference tables.

---

## Exercise List UI

Component:

```txt
ExerciseList
```

Purpose:

- search exercises
- filter by equipment
- filter by muscle
- select exercise
- open create exercise modal

This component is relevant to production.

Production version should:

- load exercises from API
- load equipment types from API
- load muscle groups from API
- support search
- support filters
- select exercise for live workout
- open create/edit exercise screen or modal

Prototype limitations:

- data is hardcoded
- filters use fixed arrays
- dropdown behavior is simple
- create modal does not persist anything

---

## Create Exercise Modal

Component:

```txt
CreateExerciseModal
```

Purpose:

- create or edit exercise fields

Fields shown:

```txt
name
category
primary muscle
equipment
notes
```

Production should modify this to match finalized schema:

```txt
name
description
equipment
primary muscle group
secondary muscle groups
```

Do not implement `category` as shown in the prototype.

The finalized app uses:

```txt
equipment_types table
muscle_groups table
exercise_secondary_muscle_groups table
```

The prototype modal is useful for layout direction only.

---

## Exercise Detail UI

Component:

```txt
ExerciseDetail
```

Purpose:

- shows exercise summary
- shows exercise history
- edit exercise
- overflow menu

Production relevance:

- exercise detail page is useful
- edit exercise action is useful

Post-MVP or not needed for MVP:

- exercise history tab
- analytics chart/metric controls
- add to routine
- duplicate

Important correction:

The prototype includes duplicate exercise in the menu, but duplicate exercise is not part of the product plan.

The future product direction is variants, not duplicate exercises.

---

## Workout Card

Component:

```txt
WorkoutCard
```

Purpose:

- displays completed workout summary in a feed-like layout

Useful production pieces:

- workout title
- date
- duration
- volume
- records/set summary
- exercise preview
- open workout detail

Do not implement social elements:

- fake user avatar/feed identity
- like button
- comment button
- follower/social assumptions

This is a single-user app.

Workout cards should be personal history cards, not social feed posts.

---

## Workout Detail UI

Component:

```txt
WorkoutDetail
```

Purpose:

- shows saved workout details
- shows workout stats
- shows exercises and set tables
- menu with save as routine/copy/edit/delete

Production relevance:

- saved workout detail is required
- edit workout is required
- delete workout is required

Post-MVP/not needed initially:

- save as routine
- copy workout
- social formatting

Routines are post-MVP.

Copy workout should not be confused with exercise variants or routine start behavior.

---

## Profile Screen

Component:

```txt
ProfileScreen
```

Purpose:

- prototype dashboard combining profile hero, stats, chart, dashboard shortcuts, workout history

Production guidance:

This screen is mostly not MVP-critical.

Useful later:

- workout history list
- dashboard links
- high-level stats

Do not build for MVP:

- followers/following
- social profile identity
- activity chart
- statistics dashboard
- calendar analytics

For MVP, focus on:

```txt
exercise library
start workout
active workout
saved workout history/detail
edit workout
settings
```

---

## Folder/Routine UI

Components:

```txt
WorkoutScreen
FolderMenuSheet
FOLDERS mock data
```

Purpose:

- shows routines grouped in folders
- start empty workout
- start routine
- folder menus

Production relevance:

- Start Empty Workout is MVP-critical

Post-MVP:

- routines
- folders
- reorder folders
- rename folder
- add routine
- delete folder

Routines are post-MVP and should be implemented after the live workout core is stable.

---

## Live Workout Session UI

Component:

```txt
WorkoutSession
```

This is the most important prototype component for MVP.

It demonstrates:

- live workout header
- close/minimize/discard direction
- timer
- volume
- set count
- empty state
- add exercise
- exercise rows
- set rows
- weight/reps inputs
- checkmark button
- Add Set button
- Finish button

Production should use this as the main visual reference but update behavior to match finalized rules.

Important finalized behavior not fully represented in the prototype:

- down arrow minimizes live workout
- floating active workout card restores it
- set types: normal, warmup, failure, drop
- RPE support
- weight unit selection per set/exercise context
- autosync to backend
- invalid weighted row warning
- Save Workout screen
- edit completed workout mode
- checkmark is visual, not save source of truth
- any set with reps >= 1 is recorded

Prototype-specific simplifications:

- set data is local React state only
- no backend persistence
- no autosync
- no finish validation
- no saved workout creation
- no set type picker
- no RPE
- no unit conversion

This component should be rebuilt carefully as production code, not copied directly.

---

## Settings Screen

Component:

```txt
SettingsScreen
```

Purpose:

- profile card
- weight unit toggle
- reminders
- compact view
- rest timer sound
- export/import
- server/version
- sign out

Production MVP relevance:

- global weight unit setting is required

Post-MVP or optional:

- reminders
- compact view
- rest timer sound
- export/import
- server status
- sign out, depending on auth

Important finalized rule:

Global weight unit controls the default unit throughout the app, but live workout logging can override unit for a specific set/exercise context.

---

## Navigation and Top Bars

Components:

```txt
ProfileTopBar
SimpleTopBar
TABS
bottom-nav
App
```

Purpose:

- provides bottom tab navigation
- switches between Profile, Workout, Settings
- shows top bars per tab

Production guidance:

The bottom navigation concept is useful.

However, tab names should match final MVP structure.

Recommended MVP navigation could be:

```txt
Workout
Exercises
History
Settings
```

or:

```txt
Home
Workout
Exercises
Settings
```

Avoid social-profile framing unless intentionally wanted for personal stats later.

---

## Icons

The prototype includes many inline SVG icon components.

Useful:

- visual reference
- no dependency on external icon library

Production options:

- keep custom SVGs
- use lucide-react
- use another icon system

No business logic depends on these icons.

---

## What Engineers Should Not Worry About From the Prototype

Do not prioritize these from the uploaded HTML:

```txt
CDN React setup
Babel in browser
single-file architecture
hardcoded mock arrays
edit-mode tweak panel
followers/following
likes/comments
social feed behavior
activity analytics chart
records/PR logic
routines/folders in MVP
save-as-routine in MVP
copy workout in MVP
server status card
photo/video upload
visibility/social controls
```

These are either prototype scaffolding, mock UI, post-MVP, or not part of the product.

---

## What Engineers Should Take From the Prototype

Use the prototype as reference for:

```txt
dark mobile visual style
bottom navigation direction
exercise list/search/filter feel
create/edit exercise modal direction
live workout screen layout
set row layout
checkmark interaction
Add Exercise and Add Set placement
Finish button placement
saved workout detail direction
settings weight unit toggle concept
```

Production implementation should follow the finalized engineering spec, not the prototype's hardcoded logic.

---

# 11. Post-MVP Features

## 11.1 Routines / Workout Splits

Routines are post-MVP.

A routine is a saved workout template.

In gym terms, examples include:

```txt
Push
Pull
Legs
Upper
Lower
Full Body
```

Starting a routine is like starting an empty workout, except the workout is pre-filled.

A routine can store:

```txt
exercise order
exercise list
empty set rows
set types
rest timer settings
```

User flow:

1. User creates a routine, for example `Push`.
2. User adds exercises they plan to perform.
3. User organizes exercise order.
4. User may add empty set rows.
5. User may choose set types.
6. User may configure rest timers.
7. User saves the routine.
8. Later, user starts the routine.
9. App creates a new active workout copied from the routine template.

Important rule:

```txt
Routine = reusable template
Workout session = actual performed workout
```

Starting a routine copies routine data into a new workout session.

Do not directly link live workout rows to routine rows as the source of truth.

This lets the user modify the live workout without changing the routine.

Possible future tables:

```txt
routines
routine_exercises
routine_sets
```

---

## 11.2 Exercise Variants

Exercise variants are post-MVP unless intentionally moved into the first release.

A variant is a named version of a base exercise.

Concept:

```txt
Exercise = base movement
Variant = specific version of that movement
```

Examples:

```txt
Exercise: Flat Bench Press
Variants:
- Standard Grip
- Close Grip
- Wide Grip
- Paused
- Tempo
```

```txt
Exercise: Back Squat
Variants:
- High Bar
- Low Bar
- Pause Squat
- Tempo Squat
```

Variants replace the need for a duplicate exercise feature.

Duplicate exercise is not part of the product plan.

### Why variants exist

Variants preserve the relationship between related movements while still allowing separate tracking.

This enables two future views:

```txt
Base exercise history: all Flat Bench Press work
Variant history: only Flat Bench Press — Close Grip
```

### Variant fields

Users can create and edit:

```txt
variant name
variant description
```

Rules:

```txt
name is required
description is optional
variant belongs to one exercise
variant name must be unique within the same exercise
different exercises can reuse the same variant name
```

Allowed:

```txt
Flat Bench Press -> Close Grip
Lat Pulldown -> Close Grip
```

Not allowed:

```txt
Flat Bench Press -> Close Grip
Flat Bench Press -> Close Grip
```

### Future schema

```sql
CREATE TABLE exercise_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (exercise_id, name)
);
```

### Workout logging with variants

When adding an exercise to a workout, the user may optionally select a variant.

Flow:

```txt
1. User selects base exercise
2. User optionally selects variant
3. User logs sets as usual
```

Suggested display:

```txt
Flat Bench Press — Close Grip
```

Workout exercise rows should store both references and snapshots when variants are implemented:

```sql
ALTER TABLE workout_session_exercises
ADD COLUMN exercise_variant_id UUID REFERENCES exercise_variants(id) ON DELETE SET NULL,
ADD COLUMN variant_name_snapshot TEXT;
```

At minimum, snapshot the variant name.

A variant description snapshot is optional and only needed if old workouts must preserve the exact variant description from the time of logging.

### Variant deletion

Deleting a variant should not break saved workouts.

Saved workouts remain readable through:

```txt
variant_name_snapshot
```

### Starting point

Do not implement variants until the core loop is stable:

```txt
start empty workout -> add exercise -> log sets -> finish -> save -> reopen -> edit
```

---

## 11.3 Rest Timer

Rest timer is post-MVP.

Each workout exercise can have an optional rest timer in live workout state.

Behavior:

- Timer is exercise-specific.
- Checking a set starts the rest timer for that exercise.
- Checking another set for the same exercise resets/restarts the timer.
- User can adjust rest duration.
- User can skip the timer.
- User can add/subtract time, for example +15 or -15 seconds.

If persistence is needed:

```sql
ALTER TABLE workout_session_exercises
ADD COLUMN rest_timer_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN rest_timer_seconds INTEGER,
ADD COLUMN active_rest_started_at TIMESTAMPTZ,
ADD COLUMN active_rest_duration_seconds INTEGER;
```

Do not store timer ticks.

Compute remaining time:

```txt
remaining = active_rest_duration_seconds - (now - active_rest_started_at)
```

---

## 11.4 Previous Column

Previous column is post-MVP.

Definition:

```txt
For a set row, Previous shows the most recent completed workout where the same exercise had that same set position recorded.
```

It should not simply use the last workout session.

Example:

```txt
Current exercise: Single Leg Extensions
Current row: Set 2
Previous should show the most recent historical Set 2 for Single Leg Extensions.
```

If the last workout with that exercise only had one set, skip it and keep searching backward until finding a recorded Set 2.

Display may include:

```txt
weight x reps
@ RPE if available
```

Example:

```txt
90 lbs x 12
@ 9.5 rpe
```

For MVP:

```txt
Previous can be hidden or shown as '-'
```

---

# 12. Development Order

## Phase 0: Project Setup

Build:

```txt
frontend
backend
postgres
docker-compose.yml
```

Confirm frontend can call a backend health endpoint.

---

## Phase 1: Database and Reference Data

Build:

```txt
app_settings
equipment_types
muscle_groups
exercises
exercise_secondary_muscle_groups
```

Seed equipment and muscle groups.

---

## Phase 2: Exercise Library CRUD

Build the exercise library before live workout.

This includes:

```txt
create exercise
edit exercise
list exercises
view exercise detail
delete exercise
secondary muscle selection
equipment selection
primary muscle selection
```

Do not build live workout until the exercise library is stable, because live workouts depend on selecting existing exercises.

### Duplicate exercise behavior

Duplicate exercise is not part of the product plan.

The product direction is to use exercise variants instead of duplicate exercises, but variants are post-MVP unless explicitly moved into the first release.

For MVP, users create and manage base exercises only.

---

## Phase 3: Start Workout and Active Recovery

Build:

```txt
workout_sessions
POST /workout-sessions
GET /workout-sessions/active
one active workout enforcement
live workout timer
refresh recovery
```

---

## Phase 4: Add Exercise to Workout

Build:

```txt
workout_session_exercises
workout_sets
add exercise endpoint
snapshot fields
auto-create first set
live workout exercise card
```

---

## Phase 5: Set Editing

Build:

```txt
weight input
unit selector
reps input
RPE input
checkmark
set type picker
summary stats
```

---

## Phase 6: Add/Delete Sets

Build:

```txt
add set
delete set
row reindexing
set number recalculation
drop set parent handling
```

---

## Phase 7: Autosync and Floating Card

Build:

```txt
autosave live workout changes
failed save indicator
minimize live workout
floating active workout card
restore latest synced state
```

---

## Phase 8: Finish Validation

Build:

```txt
finish validation endpoint
invalid weighted row detection
discard invalid rows endpoint
warning modal
empty row cleanup
```

---

## Phase 9: Save Workout Screen

Build:

```txt
title
description
start date/time
duration
save completed workout
```

---

## Phase 10: Saved Workout Detail

Build:

```txt
completed workout detail screen
show exercises in saved order
show recorded sets
show metadata
```

---

## Phase 11: Edit Completed Workout

Build:

```txt
edit completed workout screen
no running timer
same validation rules
save directly
```

---

## Phase 12: Exercise Reordering

Build:

```txt
drag handle
persist exercise order
mobile testing
```

---

## Phase 13: Hard Delete Behavior

Build:

```txt
hard delete active discarded workout
hard delete saved workout
hard delete exercise
snapshot-safe history
```

---

## Phase 14: Mobile Polish and Stability

Build:

```txt
loading states
error states
toasts
input focus behavior
safe area spacing
real phone testing
PostgreSQL backups
```

---

# 13. Testing Plan

## Backend Tests

Test:

```txt
equipment seed
muscle group seed
exercise validation
exercise hard delete
start workout one-active rule
add exercise snapshots
auto first set
set type numbering
set delete reindex
weight unit conversion
RPE validation
finish validation
invalid weighted row detection
finish save timestamps
edit workout validation
hard delete cascade
```

---

## Frontend Tests

Test:

```txt
create exercise
edit exercise
start workout
refresh active workout
add exercise
auto first set
add set
change set type
delete set
enter weight/reps/RPE
change unit
check/uncheck set
finish valid workout
finish invalid weighted row
save workout
view saved workout
edit completed workout
minimize live workout
reopen from floating card
```

---

## Manual Mobile Tests

Test on actual phone browsers:

```txt
iOS Safari
Android Chrome
```

Critical checks:

```txt
number keyboard behavior
tap target size
bottom sheets
scrolling while editing
input focus does not break layout
drag handle does not fight scroll
timer stays accurate
refresh resumes workout
autosync failure message is understandable
```

---

# 14. MVP Completion Definition

MVP is complete when:

1. User can create exercises.
2. User can edit exercises.
3. User can hard delete exercises.
4. User can start an empty workout.
5. Timer runs from `started_at`.
6. User can minimize live workout.
7. Floating active workout card restores the workout.
8. User can add exercises to workout.
9. First set auto-appears.
10. User can add/delete sets.
11. User can change set type.
12. User can enter weight, unit, reps, and RPE.
13. User can check/uncheck sets.
14. User can finish workout.
15. Invalid weighted rows trigger warning.
16. User can complete Save Workout screen.
17. Workout saves as completed.
18. User can view saved workout.
19. User can edit saved workout without timer.
20. User can hard delete saved workout.
21. Refresh during active workout resumes correctly.
22. Autosync works reliably enough for daily use.

Do not build routines, rest timer, Previous column, or analytics until the MVP loop is stable.

---

# 15. Implementation Warnings

## 15.1 Do Not Use Checkmark as Save Source of Truth

The saved workout includes all sets with reps >= 1.

Do not filter saved sets by `checked = true`.

## 15.2 Do Not Store Timer Ticks

Store start/end timestamps only.

## 15.3 Do Not Store Completed Workouts as JSON Only

Use relational rows for workout exercises and sets.

## 15.4 Do Not Allow Duplicate Active Workouts

Enforce this on the backend.

## 15.5 Do Not Let Frontend Validation Be the Only Validation

Backend must enforce finish and edit validation.

## 15.6 Do Not Make Whole Exercise Card Draggable

Use a drag handle only.

## 15.7 Do Not Treat Set Number as Row Number

These are different:

```txt
row_index
set_number
```

Warmups and drops make this distinction necessary.

---

# 16. Final Build Sequence Summary

```txt
1. Project setup
2. Database schema + migrations
3. Reference data seeds
4. Settings + default weight unit
5. Full exercise library CRUD
6. Start workout + active recovery
7. Add exercise to workout
8. Set editing
9. Set types + numbering
10. Add/delete sets
11. Autosync + floating card
12. Finish validation
13. Save Workout screen
14. Saved workout detail
15. Edit completed workout
16. Exercise reordering
17. Hard delete behavior
18. Mobile polish and testing
```

The critical product milestone is:

```txt
Start empty workout -> add exercise -> log sets -> finish -> save -> reopen -> edit
```

Once that loop is reliable, the app has its core value.

