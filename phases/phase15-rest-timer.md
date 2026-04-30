# Phase 15 - Rest Timer

> **Author:** Claude (implementation plan).
> **Status:** Draft plan.
> **Scope:** Per-exercise rest timer in the live workout. The global stopwatch icon next to Finish is explicitly out of scope and handled in a separate future phase.
> **Goal:** A user can configure a rest duration per exercise, see a countdown bar after checking a set, adjust ±15s or skip mid-rest, and have that exercise's chosen duration persist for next time the exercise is used in a workout.

---

## 1. Context

Phases 0–14 are shipped. The active workout flow can add/remove exercises, edit set rows, autosave, minimize to a floating card, finish, and save. There is no per-exercise rest timer today — `workout_session_exercises` has no rest columns and the floating card always shows green "Workout · elapsed".

Spec §11.3 documents rest timer as post-MVP with this baseline:

- Timer is exercise-specific.
- Checking a set starts the timer for that exercise. Checking again on the same exercise resets it.
- User can adjust duration, skip, or ±15s.
- Don't store ticks. Persist `started_at` + `duration_seconds`; compute `remaining` client-side.

Phase 15 promotes that feature with these additional product rules captured during planning:

- Per-exercise default persists across workouts on the source `Exercise` row, but only on successful Save.
- Empty-workout flow only — routine-bound defaults are deferred.
- All set types (warmup, normal, drop, failure) trigger the timer.
- Different-exercise checkmark while a timer is running: if that exercise has a configured rest, the timer resets to its value; if it's OFF, the running timer is untouched.
- Uncheck does not cancel a running timer.
- Sound at zero is a boxing-bell, gated by a new global `sound_enabled` app setting.
- Floating active-workout card switches green/blue: green "Workout · elapsed" normally, blue "Rest · countdown" while resting, back to green when rest ends.
- Survives browser refresh.

Reference: spec §11.3 (`workout_app_planning_schema_v2.md` lines 2493–2525).

## 2. Product Behavior

### 2.1 Entry point on the exercise card

In live workout, each `WorkoutExerciseCard` (`src/app/workout-app.tsx:2015`) gets a new clock-icon row directly under or beside the existing notes textarea (`src/app/workout-app.tsx:2076`). Label reads:

- `Rest Timer: OFF` when no rest is configured for this workout exercise.
- `Rest Timer: 1:30` (or `45s` etc.) when configured.

Tapping the row opens the **Rest Timer bottom sheet**.

### 2.2 Rest Timer bottom sheet

Reuses the existing `BottomSheet` shell (`src/app/workout-app.tsx:2766`).

Header:

- Title: `Rest Timer`
- Subtitle: the exercise display name (snapshot or live, e.g. `Pull Up (Weighted)`).
- No top-right icon in v1.

Body:

- iOS-style scroll-wheel picker, vertically centered.
- Options, in order:
  - `off`
  - `5s, 10s, 15s, 20s, 25s, 30s, 35s, 40s, 45s, 50s, 55s, 1m 0s, ... up to 2m 0s` (5-second increments)
  - `2m 15s, 2m 30s, 2m 45s, 3m 0s, ... up to 5m 0s` (15-second increments)
- Selected option shown in white, neighboring options dimmed.

Footer:

- Full-width blue `Done` button.
- Tapping outside the sheet (backdrop) also commits the current selection (matches existing `BottomSheet` close behavior).

Selecting `off` and confirming clears the rest setting on this workout exercise. Any other value sets it.

### 2.3 Running timer bar

Once a rest is configured AND the user checks any set on that exercise, a thin bar slides up from the bottom edge, above the bottom nav and above the floating active-workout card.

Layout, left to right:

- 2px-tall blue progress bar at the very top of the bar component, animating from full-width to zero.
- `-15` button (compact, dark fill).
- Large center label `MM:SS` countdown.
- `+15` button.
- Blue `Skip` button (right-aligned).

The bar is fixed at the bottom and shown on **all** routes where the live-workout context is available (i.e. it follows the user across tab switches the same way the floating card does today).

Behavior:

- `-15`: subtract 15 seconds from remaining. Floor at 0; if it would go to 0 or below, end the rest immediately (same as Skip).
- `+15`: add 15 seconds to remaining. No upper cap.
- `Skip`: end the rest immediately. Bar slides down and disappears.
- At zero: bar slides down and disappears, and a single boxing-bell sound plays (gated by `sound_enabled`).

### 2.4 Floating card mode switch

The floating active-workout card (`src/app/active-workout-card.tsx`) gets two visual modes:

- Default ("Workout"): green dot + `Workout` label + elapsed-since-start (existing behavior).
- Rest ("Rest"): blue dot + `Rest` label + remaining-rest countdown.

When a rest is running, the card flips to Rest mode. When the rest ends (zero, Skip, or canceled by another exercise's rest start), the card flips back to Workout mode immediately. This applies on routes where the floating card is visible (`/`, `/profile` per `src/app/app-shell.tsx:60`).

If the bottom timer bar is rendered (because the user is on the live workout page), the floating card may not be visible — that's fine; the bar already conveys the same information.

If `active_rest_workout_session_exercise_id` no longer resolves to a `WorkoutSessionExercise` in the active session (the user deleted the originating exercise mid-rest), the floating card and running bar render the countdown **without** an exercise-name subtitle/label. The rest is **not** auto-canceled.

### 2.5 Multi-exercise interaction rules

- **Same exercise re-check:** checking another set on the same exercise (where timer is running) resets the bar to that exercise's configured rest value.
- **Different exercise, timer ON:** checking a set on a different exercise that has its own rest configured immediately replaces the running timer with that exercise's value.
- **Different exercise, timer OFF:** checking a set on a different exercise with no rest configured does nothing to the running timer; it keeps counting.
- **Uncheck:** unchecking a set does not cancel a running timer.
- **Set type:** all set types (warmup, normal, drop, failure) trigger the timer when their checkmark is tapped.
- **Originating exercise removed:** if the user deletes the workout exercise that started the running rest, the bar keeps counting and the bell still plays at zero. The exercise-name label is hidden until rest ends. Do **not** auto-cancel.
- **Finish while rest running:** tapping Finish proceeds normally with no warning. The bar disappears as part of the finish transition. The active rest is implicitly cleared on the same save path that clears workout state.

### 2.6 Persistence rules

While the live workout is running, edits to a workout exercise's rest setting only affect that workout's row (`workout_session_exercises.rest_seconds`). The source `Exercise` row is **not** updated yet.

On successful **Finish + Save** (existing flow):

- For each `workout_session_exercise` whose `rest_seconds` differs from its `Exercise.default_rest_seconds`, copy the value back to `Exercise.default_rest_seconds`.
- A `NULL` `rest_seconds` (i.e. user set it to OFF in this workout) writes `NULL` back to the exercise default.

If the user discards the active workout, or the save fails, no propagation happens.

When an exercise is **added** to an active workout, the new `workout_session_exercise.rest_seconds` is initialized from `Exercise.default_rest_seconds` (which itself defaults to NULL = OFF for newly created exercises and existing seeded exercises).

Routine-bound defaults are deferred to whenever routines ship.

### 2.7 Refresh resilience

Active rest timer state lives in the database on `workout_sessions` (see §3). On browser refresh, the existing `/api/workout-sessions/active` hydration path (`src/app/active-workout-context.tsx:105–111`) returns the active rest fields alongside the session, and the client recomputes `remaining = active_rest_duration_seconds - (server_now - active_rest_started_at)`. If `remaining <= 0`, the client clears the active rest fields server-side and does not play the bell (the rest already ended while the page was gone).

### 2.8 Sound

The bell asset is `public/sounds/rest-end.mp3`, sourced from freesound.org as `Boxing Bell 1.wav`. Codex should download the source wav, encode it to a small mp3, and bundle it. Plays once at zero, only when `app_settings.sound_enabled = true`.

- Single ~1.5s ring (the source clip; do not loop).
- Playback is **attenuated** so the bell does not startle the user over their workout music. Set the `<audio>` element's `.volume = 0.4` (40%) on creation. No user-facing volume control in v1.

iOS PWA / mobile Safari requires a user-gesture-primed audio element. Strategy: the first time the user taps a set checkmark in a session, prime an `<audio>` element by calling `.play()` then `.pause()` immediately, so subsequent programmatic `.play()` from a `setTimeout`-style trigger works. This priming is done once per page load.

If `sound_enabled` is `false` at zero, no bell plays. The visual disappear-and-revert still happens.

**Backgrounded behavior.** If the app is backgrounded (PWA minimized, screen locked, another app on top) at the moment the timer hits zero, mobile browsers do not allow scheduled JS audio to play. The bell will silently fail to fire and the rest will end on its own. The user sees the bar gone when they return to the app. This is an accepted limitation for v1. OS-level push notifications with sound are deferred to a future feature.

### 2.9 Out of scope behavior

Do not implement in Phase 15:

- Global stopwatch icon next to Finish.
- Per-routine rest timer defaults.
- Haptic vibration at zero (sound only).
- Push notifications when rest ends.
- Per-set rest overrides (timer is per-exercise, not per-set).
- ±15s configurability (locked at 15s for v1).
- A global on/off toggle for the entire feature (the per-exercise OFF is sufficient).
- Editing rest setting from outside an active workout (e.g. from the exercise library detail screen).
- OS-level push notifications when rest ends while the app is backgrounded.
- Showing the saved rest timer value on the Exercise Library detail screen (or anywhere outside the live workout exercise card). The library detail does **not** surface `default_rest_seconds`.

## 3. API and Schema Plan

### 3.1 Schema additions

`prisma/schema.prisma` — add columns:

```prisma
model Exercise {
  // ... existing fields ...
  default_rest_seconds Int? @map("default_rest_seconds")
  // ... existing fields ...
}

model WorkoutSessionExercise {
  // ... existing fields ...
  rest_seconds Int? @map("rest_seconds")
  // ... existing fields ...
}

model WorkoutSession {
  // ... existing fields ...
  active_rest_started_at         DateTime? @db.Timestamptz(6) @map("active_rest_started_at")
  active_rest_duration_seconds   Int?      @map("active_rest_duration_seconds")
  active_rest_workout_session_exercise_id String? @db.Uuid @map("active_rest_workout_session_exercise_id")
  // ... existing fields ...
}

model AppSettings {
  // ... existing fields ...
  sound_enabled Boolean @default(true) @map("sound_enabled")
  // ... existing fields ...
}
```

Notes:

- Active rest state lives on `WorkoutSession` (not on each `WorkoutSessionExercise`) because there is exactly one running rest per session at a time. This keeps the "different exercise replaces the timer" rule trivially atomic.
- `active_rest_workout_session_exercise_id` is a soft pointer to the originating workout exercise; not a foreign key constraint (cascade would be noise here). Validate UUID at the route layer.

### 3.2 Migration

Generate a new migration:

```sh
npx prisma migrate dev --name add_rest_timer
```

The generated SQL must include:

```sql
ALTER TABLE exercises ADD COLUMN default_rest_seconds INTEGER;

ALTER TABLE workout_session_exercises ADD COLUMN rest_seconds INTEGER;

ALTER TABLE workout_sessions
  ADD COLUMN active_rest_started_at TIMESTAMPTZ,
  ADD COLUMN active_rest_duration_seconds INTEGER,
  ADD COLUMN active_rest_workout_session_exercise_id UUID;

ALTER TABLE app_settings ADD COLUMN sound_enabled BOOLEAN NOT NULL DEFAULT TRUE;
```

No data backfill needed — NULL on the rest fields means OFF, and `sound_enabled` defaults to TRUE.

### 3.3 API additions and changes

**A. PATCH workout exercise — extend existing route**

The existing route that updates a `WorkoutSessionExercise` (notes, etc.) takes a new optional field:

```
PATCH /api/workout-sessions/[id]/exercises/[exerciseId]
  body: { rest_seconds: number | null }
```

- `null` → set `rest_seconds = NULL` (OFF).
- A positive integer → set `rest_seconds` to that value. Validate `rest_seconds >= 5 && rest_seconds <= 300`.

Reuse the existing `useSaveQueue` debounce pattern (`EXERCISE_NOTES_SAVE_DEBOUNCE_MS = 800` style) for autosaving the picker selection. Key: `getWorkoutExerciseFieldKey(exerciseId, "rest_seconds")`.

**B. Start rest — new route**

```
POST /api/workout-sessions/[id]/rest
  body: { workout_session_exercise_id: string, duration_seconds: number }
```

- `400` if either field is invalid.
- `404` if the session is not active or the workout exercise doesn't belong to this session.
- On success, set `workout_sessions.active_rest_started_at = now()`, `active_rest_duration_seconds = body.duration_seconds`, `active_rest_workout_session_exercise_id = body.workout_session_exercise_id`.
- Returns `200 { server_now, active_rest_started_at, active_rest_duration_seconds, active_rest_workout_session_exercise_id }`.

The existing `started_at` server-clock pattern is reused so the client can recompute remaining time accurately across refreshes.

**C. Adjust rest — extend the same route with PATCH**

```
PATCH /api/workout-sessions/[id]/rest
  body: { delta_seconds: number }   // +15 or -15
```

- `400` if no active rest or `delta_seconds` is not ±15.
- On success: re-anchor by adjusting `active_rest_duration_seconds += delta_seconds`. (Don't move `started_at`; the math `remaining = duration - (now - started_at)` naturally absorbs the delta.)
- If the resulting remaining is `<= 0`, treat it as a skip: clear all three columns and return `204`.

**D. Skip rest — DELETE on the same route**

```
DELETE /api/workout-sessions/[id]/rest
```

- Idempotent. Sets all three `active_rest_*` columns to NULL. Returns `204` whether or not a rest was running.

**E. Active session GET — extend response**

`GET /api/workout-sessions/active` (existing, `src/app/api/workout-sessions/active/route.ts`) must include the three rest columns alongside `server_now`, so the provider can hydrate after refresh:

```ts
{
  // ... existing fields ...
  active_rest_started_at: string | null,
  active_rest_duration_seconds: number | null,
  active_rest_workout_session_exercise_id: string | null,
}
```

`active_rest_workout_session_exercise_id` may be non-null but unresolvable (the originating workout exercise was deleted mid-rest). The route must return the rest fields anyway. Clients handle the missing exercise gracefully — the running bar / floating card show the countdown without an exercise-name label.

**F. Workout session response — exercises include rest_seconds**

The exercises array returned from session-detail endpoints must include `rest_seconds` per workout exercise so the picker shows the correct selected value on remount.

**G. App settings — extend GET/PATCH**

`GET /api/settings` includes `sound_enabled`.
`PATCH /api/settings` accepts `{ sound_enabled?: boolean }`.

**H. Save flow — write back to Exercise default**

`finishAndSaveWorkoutSession` (or whichever service finalizes the workout in `src/lib/workout-session-api.ts`) gains a step inside the same transaction:

```
for each WorkoutSessionExercise wse in session:
  if wse.rest_seconds != wse.exercise.default_rest_seconds:
    update Exercise where id = wse.exercise_id set default_rest_seconds = wse.rest_seconds
```

Do this **only** on the successful save path. Discard does not propagate.

If a workout exercise references an `Exercise` that has been hard-deleted, skip the propagation for that row (defensive — snapshot fields keep the workout readable but there's nothing to write back to).

### 3.4 Add-exercise initialization

The "add exercise to active workout" service (existing) must initialize `rest_seconds = exercise.default_rest_seconds` on insert, instead of leaving it NULL. NULL stays NULL (= OFF).

## 4. Workstreams

### 4.1 Schema and migration

- Edit `prisma/schema.prisma` per §3.1.
- `npx prisma migrate dev --name add_rest_timer` and verify the SQL matches §3.2.
- `npx prisma generate`.

### 4.2 Service layer

- Update add-exercise service to copy `default_rest_seconds` → `rest_seconds`.
- Update finish-and-save service to write `rest_seconds` back to `default_rest_seconds` in the same transaction (skip rows whose source exercise was hard-deleted).
- Add `startRest`, `adjustRest`, `skipRest` service functions in `src/lib/workout-session-api.ts`.

### 4.3 API routes

- Extend PATCH workout-exercise route to accept `rest_seconds` (validate range).
- New route file: `src/app/api/workout-sessions/[id]/rest/route.ts` with `POST`, `PATCH`, `DELETE`.
- Extend `GET /api/workout-sessions/active` and any session-detail endpoint to expose the rest fields and per-exercise `rest_seconds`.
- Extend `GET /api/settings` and `PATCH /api/settings` with `sound_enabled`.

### 4.4 Provider — `active-workout-context.tsx`

- Add an `activeRest` slice to the context: `{ started_at: Date | null, duration_seconds: number | null, workout_session_exercise_id: string | null }`, plus a derived `remainingSeconds` similar to `useElapsedSeconds`.
- Hydrate from `/api/workout-sessions/active` on mount and on `refresh()`.
- Expose `startRest(workoutExerciseId, durationSeconds)`, `adjustRest(deltaSeconds)`, `skipRest()` that call the API and optimistically update state.
- After hydrate, if `remainingSeconds <= 0`, call `skipRest()` to clear server state quietly (no bell).

### 4.5 UI — picker sheet

- New component `src/app/rest-timer-sheet.tsx` wrapping `BottomSheet`.
- Renders the iOS-style scroll-wheel picker with the option list from §2.2.
- On `Done` or backdrop close, PATCH `rest_seconds` for that workout exercise via the existing save queue.

### 4.6 UI — exercise card entry

- In `WorkoutExerciseCard` (`src/app/workout-app.tsx:2015`), add the clock-icon row beside or under notes (`src/app/workout-app.tsx:2076`) showing `Rest Timer: <value | OFF>`.
- Tapping toggles `isRestSheetOpen` state and renders `RestTimerSheet`.

### 4.7 UI — set checkmark integration

- In the set-checkmark handler (`src/app/workout-app.tsx:2399`), after the existing `onUpdate({ checked: !set.checked })` call:
  - If `set.checked` transitioned from `false` → `true` AND the workout exercise's `rest_seconds` is non-null, call `startRest(workoutExerciseId, rest_seconds)`.
  - If transitioned from `true` → `false` (uncheck), do nothing to the rest.
  - When the exercise containing the just-checked set is the same one whose rest is currently running, posting `startRest` again is intentional — it resets the timer to that exercise's `rest_seconds` value (server-side overwrite of `started_at` and `duration_seconds`).

### 4.8 UI — running timer bar

- New component `src/app/rest-timer-bar.tsx`.
- Subscribes to `activeRest` and `remainingSeconds` from the provider.
- Renders only when `activeRest.duration_seconds != null && remainingSeconds > 0`.
- Buttons call `adjustRest(-15)`, `adjustRest(+15)`, `skipRest()`.
- When `remainingSeconds` transitions from `> 0` to `<= 0` on the client, play the bell (if `sound_enabled`) and call `skipRest()` to clear server state.
- Mounted in `src/app/app-shell.tsx`, positioned above the floating card and bottom nav.
- On workout finish (the existing `finishAndSave...` path), the bar must unmount immediately as part of the route/state transition. No explicit `skipRest` call is required if the same transaction also clears the `active_rest_*` columns; otherwise call `skipRest` from the client right before navigating.
- When the `activeRest.workout_session_exercise_id` no longer resolves to a workout exercise in the active session, render the bar with the countdown only — omit the exercise-name label that the bar would normally show. Do not auto-cancel.

### 4.9 UI — floating card mode switch

- In `src/app/active-workout-card.tsx`, branch on `activeRest.duration_seconds != null`:
  - Rest mode: blue dot, label `Rest`, remaining countdown.
  - Default mode: existing green dot + `Workout` + elapsed.

### 4.10 Sound priming

- A small `<audio src="/sounds/rest-end.mp3" preload="auto" />` element rendered inside the live workout shell.
- Set `audio.volume = 0.4` immediately after element creation, before the priming `play()/pause()` call.
- On the first user tap inside the live workout (cheapest hook: the first set checkmark or the first rest config selection), call `audio.play(); audio.pause(); audio.currentTime = 0;` to unlock playback.
- When the timer reaches zero and `sound_enabled === true`, call `audio.play()`.

### 4.11 App settings

- Extend the settings page to include a `Sound` toggle bound to `sound_enabled`.
- Use the existing settings-page pattern.

## 5. Validation Plan

Static:

- `npm run lint`
- `npm run build`
- `git diff --check`
- `npx prisma generate` clean.
- `npx prisma migrate dev --name add_rest_timer` produces an SQL diff that matches §3.2.

API smoke checks (via `curl` or REST client):

- `PATCH /api/workout-sessions/<id>/exercises/<wseId>` with `{ rest_seconds: 90 }` → 200, then `GET` confirms persisted.
- Same with `{ rest_seconds: null }` → OFF.
- Out-of-range values (`4`, `301`, `0`, `-1`) → 400.
- `POST /api/workout-sessions/<id>/rest` with valid body → 200, `GET /api/workout-sessions/active` shows the three `active_rest_*` fields populated.
- `PATCH /api/workout-sessions/<id>/rest` with `{ delta_seconds: 15 }` → updates duration. `delta_seconds: -1000` → 400.
- `DELETE /api/workout-sessions/<id>/rest` → 204, fields cleared.
- Restart server / refresh: `GET /api/workout-sessions/active` still returns the in-flight rest with consistent math against `server_now`.

UI smoke checks (manual, on phone via Tailscale at `:3000`):

1. Open a live workout. Add Bench Press. Open the rest-timer sheet, pick `1m 30s`, Done. Card row reads `Rest Timer: 1:30`.
2. Check a set on Bench Press → bottom bar appears, blue progress, countdown from `01:30`.
3. Tap `+15` → countdown jumps to ~`01:45`. Tap `-15` twice → countdown lower.
4. Tap `Skip` → bar disappears immediately.
5. Re-check the same set, then check a different set on Bench Press → bar resets to `01:30`.
6. Add a second exercise with no rest configured. While the bar is running, check a set on it → bar keeps counting.
7. Set the second exercise to `45s`. Check a set → bar resets to `00:45`.
8. Uncheck the originating set → bar continues uninterrupted.
9. Minimize live workout → floating card on `/profile` shows blue `Rest · 00:30`. After zero, flips back to green `Workout · elapsed`.
10. While bar is running on `01:00`, refresh the browser → bar resumes within ~1s of the correct remaining time.
11. Boxing bell plays at zero with `sound_enabled = true`. Toggle off in settings, repeat — no sound, visuals same.
12. Finish + Save the workout. Open a new empty workout, add Bench Press → `Rest Timer: 1:30` is preselected.
13. Discard a workout where you'd changed Bench Press to `2:00` → next add still shows `1:30` (no propagation on discard).
14. Set Bench Press rest to `OFF` and save → next add shows `OFF`.
15. Start a rest from Bench Press, then delete Bench Press from the active workout. The bar keeps counting; the exercise-name label disappears; the bell still plays at zero.
16. Tap Finish while a rest is counting. Finish proceeds with no prompt; the bar disappears as part of the transition.
17. Lock the phone screen mid-rest, wait until past zero, return to the app. Bar is gone, no bell played retroactively, no error in the console.
18. Confirm the bell plays noticeably quieter than typical media playback (volume attenuation working).

Edge cases:

- All set types: warmup, drop, failure each trigger the timer.
- A workout exercise whose source `Exercise` was hard-deleted: save propagation skips it without erroring.

## 6. Acceptance Criteria

1. Rest timer can be configured from `OFF` through `5s..2m` (5s steps) and `2m..5m` (15s steps) on each exercise in a live workout.
2. Checking any set on an exercise with a configured rest starts the bottom bar.
3. ±15s adjusts the countdown live; Skip ends it; reaching zero ends it and plays the bell when sound is enabled.
4. Same-exercise re-check resets the bar to that exercise's value.
5. Different-exercise check with rest ON resets the bar; with rest OFF leaves the bar untouched.
6. Uncheck does not cancel the bar.
7. Refreshing the browser mid-rest resumes the bar at the correct remaining time within one second.
8. Floating card shows blue `Rest · countdown` while resting and green `Workout · elapsed` otherwise.
9. On Finish + Save, each workout exercise's `rest_seconds` is written back to its `Exercise.default_rest_seconds`. Discard does not propagate.
10. `sound_enabled` global toggle silences the bell without affecting visuals.
11. Schema migration adds the four columns and one app-settings column with no data backfill issues.
12. Deleting the originating workout exercise mid-rest does not cancel the rest; the exercise-name label is hidden but the bar keeps counting and the bell still plays at zero.
13. Tapping Finish while a rest is running proceeds without warning; the bar disappears as part of the finish flow.
14. Bell volume is attenuated (~40%) so it does not startle over music.
15. The Exercise Library detail screen does not surface the saved rest setting.

## 7. Handoff and Git

- Append a dated `(Codex)` entry to `HANDOFF.md` after the work, including commit hashes and validation summary.
- Phase 15 is a user-testable feature, so push to `origin/main` once committed (per the project rule to push when a core feature is done).
- Prisma migration is required: ship `prisma/migrations/<timestamp>_add_rest_timer/` alongside the schema edit.
- No changes to local-only files (`HANDOFF.md`, `CLAUDE.md`, `PHASE_STATUS.md`, `.codex`).
