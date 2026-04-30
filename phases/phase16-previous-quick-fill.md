# Phase 16 — Previous / Quick Fill

## 1. Overview

Replace the hardcoded `-` placeholder in the Previous column of live workout set rows (and add the column in completed workout edit) with real historical guidance derived from prior completed workouts. Tapping the Previous value copies historical weight/reps into the row.

**Source of truth for product behavior:** `phases/previous-quick-fill-design.md`. Read it end-to-end before writing code. This phase doc is the *implementation* plan, not a redefinition of the design.

**Scope:**
- Live workout: Previous ghost + tap-to-fill on every set row.
- Completed workout edit: same UX, with edit-cutoff lookup rules and original-saved-identity tracking.
- Exercise template seeding (first vs duplicate occurrence) when adding an exercise.
- Live Progress Summary volume changes (checked-set sum, global-unit translator).

**Out of scope:** read-only history views, saved workout detail views, analytics, RPE copying, exercise variants.

**No schema changes.** All data needed is already on `WorkoutSession`, `WorkoutSessionExercise`, `WorkoutSet`. Previous is derived server-side and returned in the active workout / edit-detail responses.

---

## 2. Server work

### 2.1 New module: `src/lib/previous-quick-fill.ts`

Owns the lookup and shaping logic. Pure read; no mutations.

**Responsibilities:**
- Compute the `DisplayedSetIdentity` for a given row: `normal_n | failure_n` (share numbered lane), `warmup_n` (by warmup order within the exercise block), `drop_n_under_parentIdentity` (drop position under a numbered parent's identity).
- Compute `occurrenceNumber` for each `WorkoutSessionExercise` within its session, derived from `orderIndex` filtered by `exerciseId`.
- Lazy newest-first search across completed `WorkoutSession`s for matching `(exerciseId, occurrenceNumber, displayedIdentity)`. No depth cap. Stop per row at first match.
- Convert matching historical recorded row's weight to the current exercise's `inputWeightUnit` using existing `convertWeight()` from `src/lib/weight-units.ts`. Format to two decimals.
- Drop rule: if no matching drop exists under that parent identity in the most recent completed workout containing the parent, return `-`. Do not search farther back.

**Exports:**
- `type PreviousValue = { weight: string | null; reps: number | null }` — strings keep `0.00` precision intact; `null` means "no value to show in this slot."
- `computePreviousForExerciseBlock(args)` → returns `Map<setRowId | clientId, PreviousValue>` for a single exercise occurrence.
- `computePreviousForSession(args)` → fans out across all exercises in a session for response injection.

**Lookup helper signature** (sketch):
```
loadCompletedSessionsNewestFirst({
  prisma,
  exerciseId,
  cutoffStartedAt?: Date,        // exclude workouts at/after this for completed-edit
  excludeSessionId?: string,     // exclude the workout being edited
  pageSize: 25,                  // chunked pull, lazy
})
```
Pull pages until every requested identity has resolved or pages are exhausted.

**Recorded-row filter:** `reps >= 1`. Mirror the filter already used in `getExerciseHistory()` (`src/lib/exercise-history-api.ts` lines 9–53).

### 2.2 Inject `previous` into the active workout response

`src/lib/workout-exercise-api.ts`:

- Extend `WorkoutSetResponse` (lines 58–77) with `previous: PreviousValue | null`. `null` = no historical match (UI shows `-`).
- In `toWorkoutSessionExerciseResponse()` (line 242), wire the precomputed `Map` from `computePreviousForExerciseBlock` into each set's response. The map should be assembled at the session level before mapping individual exercises so all rows are computed in one pass per session read.
- Add a `previousByRowKey` parameter (or threading via a session context) so `toWorkoutSessionExerciseResponse` doesn't fan back out to the DB per row.

### 2.3 Recompute on identity-affecting mutations

The design doc lists the recompute triggers. Each existing mutation handler already returns the active workout shape via `toWorkoutSessionExerciseResponse`. After the mutation persists, recompute Previous and re-inject before returning. Trigger points:

- `addWorkoutSet`, `deleteWorkoutSet`, `updateWorkoutSet` (set-type changes) in `src/lib/workout-set-api.ts`.
- `addExerciseToActiveWorkoutSession`, exercise reorder, exercise removal in `src/lib/workout-exercise-api.ts`.
- Exercise unit change (the route that updates `inputWeightUnit`).

The cheapest correct approach: each route that returns the active workout response funnels through one helper that fetches the session, runs `computePreviousForSession`, and emits the response. Avoid per-mutation recompute if a single response-shaping helper can do it.

### 2.4 Mid-workout exercise unit change converts typed values

When the exercise's `inputWeightUnit` changes:
- Convert each set's `weightInputValue` from the old unit to the new unit in-place (use `convertWeight`). Preserve `weightNormalizedValue` recompute via existing `resolveEffectiveWeight()` path so volume stays consistent.
- After conversion, recompute Previous (the ghost should now display in the new unit).
- Confirm whether this conversion lives in the unit-change route or is already in place — the user said it was previously established. Verify by reading the unit-change handler before changing it; if already converting, only Previous recompute remains.

### 2.5 Exercise template seeding on add

`src/lib/workout-exercise-api.ts → addExerciseToActiveWorkoutSession()` (lines 285–357):

- Compute `occurrenceNumber` for the exercise being added (count of existing `WorkoutSessionExercise` rows for the same `exerciseId` in this session, plus one).
- **First occurrence:**
  - Search newest-first for a completed workout where the same `exerciseId` first occurrence has recorded rows.
  - Clone that occurrence's set type structure and row count. Do not copy values, RPE, or checked state.
  - Drop rows under a non-existent parent → fall back to `normal`.
  - If no history found → create a single `normal` row (current behavior).
- **Duplicate occurrence (n ≥ 2):**
  - Always create a single `normal` row.
  - That row's Previous comes from the matching occurrence's numbered Set 1 (skipping warmups), via the standard lookup path.

### 2.6 Completed workout edit response

`src/lib/completed-workout-edit-api.ts` and the read used by the edit screen:

- The edit-screen GET that hydrates the completed workout must also return `previous` per row, with two rules:
  1. Each existing saved row carries an `originalSavedIdentity` (computed at hydrate time from the saved row's `setType`, `setNumber`, parent linkage). Persist this in the API response for the client to thread through edits.
  2. Lookup cutoff: only completed workouts with `startedAt < this workout's startedAt`, and `id !== this workout's id`.
- The edit save (`editCompletedWorkout()` line 162) does not need Previous in its payload. Previous is purely for read/UI.

### 2.7 Live Progress Summary volume

The top-strip volume currently sums recorded sets. Change behavior:

- Live volume = sum of *checked* set volumes only.
- Convert each contributing set's `volumeValue` from its `volumeUnit` to the global app unit before summing.
- Backend save behavior unchanged: `volumeValue` storage and saved/history volume continue using existing logic.

This is a client-side display change once the response carries per-set checked state and `volumeValue`/`volumeUnit` (which it already does). Verify the global unit setting source — likely `src/lib/app-settings*` — and feed it into the summary computation.

---

## 3. Client work

### 3.1 Live workout — `src/app/workout-app.tsx`

**Set table header (line 2202):** keep label as `Previous`.

**Set row (`WorkoutSetEditorRow` lines 2373–2576):**

- Replace hardcoded `-` (line 2464) with the combined Previous tap target.
- Render rules from design doc §"Previous Display":
  - `weight_reps`, `weighted_bodyweight`, `assisted_bodyweight`: `{weight} x {reps}` (no unit, no `+`/`-` sign — header column already shows direction).
  - `bodyweight_reps`: `{reps}` only.
  - No historical match: `-` (not tappable).
- Tap behavior:
  - One tap copies all visible Previous fields into the row's inputs.
  - Persists via the existing `useSaveQueue` debounced 350ms path (same as manual edits).
  - Does NOT toggle checkmark.
  - Overwrites typed values without warning or undo (per design).
- Ghost behavior:
  - When the row's input is empty, show the Previous value as a gray ghost in the input.
  - When the user types, the ghost is replaced with the white typed value.
  - When the user clears all text, the ghost returns.
  - Recompute updates the ghost silently — no flash, fade, or animation.

**Live progress summary (top strip):**
- Replace recorded-set volume with checked-set volume.
- Display in global app unit; convert each checked set's `volumeValue` from `volumeUnit` before summing.

### 3.2 Completed workout edit — `src/app/profile/workouts/[id]/edit/edit-workout-app.tsx`

- Add a Previous column to the edit grid (currently `[42px_minmax(68px,1fr)_46px_56px_38px]`, mirror the live layout).
- `EditableSetRow` (lines 917–1052) gets the same ghost + tap behavior as live.
- Thread `originalSavedIdentity` per draft set through `DraftWorkoutSet` (lines 140–151). Add a field, default to identity at hydrate time, never mutate.
- On every edit that affects displayed identity, recompute the per-row Previous client-side OR re-fetch from the edit GET (decide based on whether server recompute is cheap enough; prefer server recompute to avoid duplicated matching logic).
- Identity match logic for restoring original saved value:
  - If `currentDisplayedIdentity === originalSavedIdentity` → Previous is the row's *original saved values*, formatted via the same display rules.
  - Otherwise → Previous comes from the lookup (with edit cutoff).

### 3.3 Exercise template seeding UI

No bespoke UI — the server returns the seeded set rows on add. Confirm the UI re-renders the new exercise block correctly with multiple seeded rows (existing render path should already handle this, but smoke test it).

---

## 4. Edge cases (from the design doc — encode as tests / smoke)

- Hard-deleted source exercise → Previous shows `-` for all rows in that block.
- Drop with no matching drop under same parent in most recent containing workout → `-`.
- Mixed-unit workout volume → top strip converts everything to global unit.
- Reverting set type in completed edit (Normal → Warmup → Normal) → Previous returns to original saved value once identity matches original again.
- Mid-workout exercise unit change → typed values convert; Previous recomputes in new unit.
- Zero is a real value: historical `0 x 3` shows as `0.00 x 3`, tappable.
- RPE never copies.
- `bodyweight_reps` quick fill copies reps only.
- New row in completed edit: live-style lookup with cutoff `startedAt < edited workout's startedAt`.

---

## 5. Validation checklist

1. `npx prisma generate` (no schema changes expected, sanity only).
2. `npm run lint`.
3. `npm run build`.
4. `git diff --check`.
5. API smoke against a temp `next start -p 30XX`:
   - Create active workout with two exercises (one weighted, one bodyweight-reps).
   - Confirm Previous appears in the active workout response with correct shape.
   - Patch a set's reps; confirm response volume reflects checked-set sum only.
   - Tap-fill via the API write path; confirm row persists and checkmark stays untoggled.
   - Change exercise unit; confirm typed values convert and Previous recomputes in new unit.
   - Add the same exercise twice; confirm seeding rules (clone first, single normal for second).
   - Hit the edit GET on a completed workout; confirm `originalSavedIdentity` and `previous` per row.
   - Change a saved Normal Set 1 → Warmup → Normal and confirm Previous restores to original.
6. Manual mobile UI walk-through:
   - Ghost text appears in empty fields.
   - Typing replaces ghost with white text.
   - Clearing returns the ghost.
   - Tapping Previous fills weight + reps (or reps only for bodyweight).
   - Tapping Previous overwrites typed values silently.
   - Top-strip volume reflects checks/unchecks live.

---

## 6. Acceptance

- Every set row shows a usable Previous (or `-`) in live and completed-edit screens.
- Quick fill works one-tap in both screens, no warning, no undo, persists through the existing save queue.
- Volume on the top strip follows checked sets; unchecking subtracts; saved volume unaffected.
- Exercise add seeds rows correctly for first vs duplicate occurrences.
- All design-doc edge cases pass the smoke checks in §5.
- No regressions to existing live workout, finish/save, history, or completed edit flows.

---

## 7. Files expected to change

Server:
- `src/lib/previous-quick-fill.ts` (new)
- `src/lib/workout-exercise-api.ts`
- `src/lib/workout-set-api.ts`
- `src/lib/completed-workout-edit-api.ts`
- `src/lib/completed-workout-api.ts` (edit GET shape)
- Whichever route handles exercise unit change (verify path; under `src/app/api/workout-sessions/...`)

Client:
- `src/app/workout-app.tsx`
- `src/app/profile/workouts/[id]/edit/edit-workout-app.tsx`

No migrations. No new env vars. No new dependencies.
