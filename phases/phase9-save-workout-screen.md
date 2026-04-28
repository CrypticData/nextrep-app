# Phase 9 — Save Workout Screen

> **Author:** Codex (planning), to be reviewed before implementation.
> **Status:** Draft plan.
> **Scope:** Replace Phase 8's stub finish commit with an editable Save Workout screen. No schema changes expected.
> **Goal:** After Finish validation passes, let the user review and edit workout metadata before the workout is committed as completed.

---

## 1. Context

Phase 8 added the first usable finish loop:

```txt
Finish -> validate -> discard invalid rows if needed -> POST /finish with stub metadata
```

That unlocked completed workouts, but the metadata is generated automatically:

```txt
name = Workout — <weekday> <month> <day>
description = null
started_at = original session.started_at
duration_seconds = live timer duration
```

Phase 9 replaces only that final stub commit with an editable Save Workout screen:

```txt
Finish -> validate -> discard invalid rows if needed -> Save Workout screen -> POST /finish
```

The existing Phase 8 backend remains the source of truth. `POST /finish` already validates and commits `name`, `description`, `started_at`, and `duration_seconds`.

## 2. Product Behavior

### 2.1 Finish flow

When the user taps Finish from the live workout:

1. Disable the Finish button immediately.
2. Call `POST /api/workout-sessions/[id]/finish/validate`.
3. Preserve the Phase 8 branches:
   - `can_continue: true` -> open Save Workout screen.
   - `reason: "no_recorded_sets"` -> show the existing inline error.
   - `reason: "invalid_weighted_sets"` -> show the existing discard-invalid sheet.
   - `reason: "not_active"` -> clear active workout context and surface the existing error path.
4. If invalid rows are discarded, revalidate.
5. After revalidation returns `can_continue: true`, open Save Workout screen.
6. Do **not** call `POST /finish` until the user taps Save on the Save Workout screen.

### 2.2 Save Workout screen fields

The Save Workout screen includes editable fields:

```txt
Workout title
Description
Start date/time
Duration
```

It also shows read-only summary values:

```txt
Recorded set count
Volume summary
Duration summary
```

No social visibility.
No media upload.
No routine/folder controls.

### 2.3 Default values

Initialize the Save screen with the same values Phase 8 used for the stub commit:

```json
{
  "name": "Workout — <weekday> <month> <day>",
  "description": "",
  "started_at": "<session.started_at>",
  "duration_seconds": "<current offset-aware live duration>"
}
```

Rules:

- Title is generated from the workout's actual start date, not "today".
- Duration uses the same provider-owned `offsetMs` math as the live toolbar:

```txt
floor((Date.now() + offsetMs - Date.parse(session.started_at)) / 1000)
```

- Description saves as `null` if empty or whitespace-only.

### 2.4 Save action

When the user taps Save:

1. Client performs lightweight validation:
   - title trimmed length is 1-120 chars
   - duration is a non-negative integer in seconds
   - start date/time parses
2. POST to:

```txt
POST /api/workout-sessions/[id]/finish
```

with:

```json
{
  "name": "string",
  "description": "string | null",
  "started_at": "ISO8601 string",
  "duration_seconds": 1234
}
```

3. Server re-runs finish validation and commits.
4. On success:
   - clear active workout context
   - return to the start screen (`/`)
   - show the existing short `"Workout saved"` success banner
5. On failure:
   - keep the user on Save Workout screen
   - re-enable Save
   - show inline error

### 2.5 Discard action

Save Workout screen includes a destructive `Discard Workout` action.

Behavior:

1. Reuse `ConfirmSheet`.
2. On confirm, call existing:

```txt
POST /api/workout-sessions/[id]/discard
```

3. On success:
   - clear active workout context
   - return to the start screen
   - do not show `"Workout saved"`

## 3. UI Plan

### 3.1 Screen state

Extend the workout app local screen state:

```ts
type WorkoutScreen = "start" | "live" | "save";
```

The Save screen can remain in `src/app/workout-app.tsx` at first. Extract only if it becomes too large.

### 3.2 Save screen layout

Use the existing mobile dark-theme style:

- AppShell remains hidden header on the active-workout flow.
- Sticky top bar:
  - back/minimize-style left control returns to live workout
  - title: `Save Workout`
  - right action: `Save`
- Main content:
  - summary strip: duration, volume, recorded sets
  - title input
  - start date/time input
  - duration editor
  - description textarea
  - discard workout button

Keep controls dense and gym-friendly. Do not build a marketing-style or card-heavy page.

### 3.3 Duration editor

Prefer simple numeric fields:

```txt
Hours
Minutes
```

Seconds can be preserved internally from the captured default, but the user-facing editor can round/truncate to hours/minutes for Phase 9 unless implementation is simpler with seconds included.

Recommended:

- Initialize from captured `duration_seconds`.
- Let user edit hours and minutes.
- On save, compute:

```txt
duration_seconds = hours * 3600 + minutes * 60
```

Use integer inputs with min `0`.

### 3.4 Start date/time editor

Use native `datetime-local` input for Phase 9.

Implementation notes:

- Convert `session.started_at` ISO to local input value.
- Convert edited local value back to ISO for `POST /finish`.
- Avoid shifting the user's chosen local time accidentally.

## 4. API / Backend

No new endpoints expected.

Reuse:

```txt
POST /api/workout-sessions/[id]/finish/validate
POST /api/workout-sessions/[id]/sets/discard-invalid
POST /api/workout-sessions/[id]/finish
POST /api/workout-sessions/[id]/discard
```

Backend validation remains in `finishWorkout`.

Do not weaken:

- at least one recorded set
- no invalid weighted rows
- active-session requirement
- `started_at` parse/future/30-day guard
- title length guard

## 5. Files Likely To Modify

- `src/app/workout-app.tsx`
  - add `"save"` screen state
  - change valid Finish branch to open Save screen
  - add Save Workout UI
  - move stub-payload defaults into editable draft state
  - add save/discard handlers

Potentially:

- `src/app/active-workout-context.tsx`
  - no changes expected

No expected changes:

- Prisma schema
- migrations
- route handlers
- `src/lib/workout-session-api.ts`

## 6. Edge Cases

- **Refresh on Save screen:** acceptable for Phase 9 to recover the active workout and return to live screen. Do not add persistence solely for this unless it is trivial.
- **Back from Save screen:** return to live workout without changing workout data.
- **Invalid rows appear after Save screen opens:** server catches on `/finish`; show inline error and let user return to live workout.
- **Title cleared:** client blocks with inline error; server also rejects.
- **Start time in future or >30 days old:** server rejects; surface inline error.
- **Duration 0:** allowed by Phase 8 API contract, but UI should make it clear. If the user sets `0h 0m`, send `0`.
- **Double tap Save:** disable Save while request is in flight.
- **Discard from Save screen:** hard-deletes active workout, same as current discard behavior.

## 7. Verification

Static:

- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] `git diff --check` clean.
- [ ] No Prisma migration generated.

API:

- [ ] Existing `POST /finish` still accepts edited title/description/start/duration.
- [ ] `POST /finish` still rejects zero recorded sets.
- [ ] `POST /finish` still rejects invalid weighted rows.

UI:

- [ ] Valid workout -> tap Finish -> Save Workout screen opens, workout not completed yet.
- [ ] Edit title and description -> Save -> completed session stores both.
- [ ] Edit start date/time and duration -> Save -> `started_at` and `ended_at` match the edited values.
- [ ] Back from Save returns to live workout.
- [ ] Discard from Save confirms, then deletes active workout and returns home.
- [ ] No-recorded-sets and invalid-weighted-row flows still block before Save screen.
- [ ] Double-tapping Save only sends one commit request.

DB check:

- [ ] Completed `workout_sessions.name` matches edited title.
- [ ] Completed `workout_sessions.description` matches edited description or null.
- [ ] `ended_at = started_at + duration_seconds`.

## 8. Out Of Scope

- Completed workout detail screen.
- Workout history list.
- Edit completed workout.
- Phase 7 autosync/retry UI.
- Exercise reordering.
- New toast system.
- New backend endpoint unless current data proves insufficient.

## 9. Handoff Notes

After implementation:

- Append a `## YYYY-MM-DD (Codex)` entry to `HANDOFF.md`.
- Update `PHASE_STATUS.md`.
- Commit Phase 9 separately from Phase 8/8.1 commits.
