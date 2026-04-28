# Phase 12 - Exercise Reordering

> **Author:** Claude (implementation plan).
> **Status:** Draft plan.
> **Scope:** Add drag-handle reordering for workout exercises in the live workout screen and the completed-workout edit screen, with persistence in both.
> **Goal:** The user can rearrange exercises within an active workout (persisted live) and within an editable completed workout (persisted on Save), using a drag handle that does not fight mobile scroll.

---

## 1. Context

Spec §6.6 and §12 Phase 12 require drag-handle reordering. Spec hard rule §15 forbids making the whole exercise card draggable because mobile drag conflicts with scroll — only the dedicated drag handle may initiate a drag.

`WorkoutSessionExercise.orderIndex` already exists with a unique-per-session constraint (`@@unique([workoutSessionId, orderIndex])`, see `prisma/schema.prisma:163`). The remove-exercise flow already implements a two-pass offset trick to reindex `orderIndex` without violating the unique constraint (`src/lib/workout-exercise-api.ts:370-391`). Phase 12 reuses that pattern for bulk reorder.

Phase 11 deliberately deferred reorder UI; the completed-workout edit endpoint already preserves order from the submitted graph (`src/lib/completed-workout-edit-api.ts:325`, `for (const [exerciseIndex, exerciseInput] of payload.exercises.entries())` becomes `orderIndex`), so the edit screen reorder ships without new API surface — only a new draft-rearrange UI.

```txt
Live workout: drag handle -> drop -> PATCH /api/workout-sessions/[id]/exercise-order
Edit workout: drag handle -> drop -> local draft only -> existing PATCH /api/workout-sessions/[id]/edit on Save
```

## 2. Product Behavior

### 2.1 Drag handle

Each exercise card on the live workout screen and the completed-workout edit screen gets a drag handle (recommended: a `≡` grip-dots icon) on the left side of the exercise header. Only the handle initiates drag.

The rest of the exercise card — title, notes textarea, set rows, kebab menu, Add Set button — stays tappable and scrollable as today. The handle reserves a small fixed-width column (~32–40px) so it does not change the existing header layout meaningfully.

### 2.2 Drag interaction

- Pointer-down on the handle starts the drag after a short hold (sensor activation distance, e.g. 5px movement) so a tap does not accidentally initiate a drag.
- During drag: the active card lifts (slight scale + shadow), other cards shift to indicate the drop target.
- Pointer-up commits the new order.
- Cancel (drag outside list, Escape on desktop): no commit.

### 2.3 Persistence

**Live workout:** on drag end, optimistically apply the new order in client state, then call `PATCH /api/workout-sessions/[id]/exercise-order`. On error, revert and surface a small error pill ("Couldn't save order. Tap to retry.") above the exercise list, dismissible by tapping it. Other interactions on the screen continue to work during the in-flight save.

**Completed-workout edit:** drag end mutates only the local draft. The existing `PATCH /api/workout-sessions/[id]/edit` payload sends `exercises` in their current draft order; the existing service uses array index as `orderIndex`, so no edit-route changes are needed.

### 2.4 Out of scope

- Reordering sets. Spec §5.5 explicitly says rows cannot be manually reordered.
- Reordering exercises in saved workout detail (read-only view).
- Reordering during the add-exercise flow.
- Animations beyond what the dnd library provides for free.
- Cross-list drag.

## 3. Library Choice

Use `@dnd-kit/core` and `@dnd-kit/sortable`.

Reasons:

- First-class touch sensor that respects scroll containers (critical for mobile).
- Proper drag-handle support via the listener-spread pattern, which makes spec hard rule §15 (handle-only) trivial to enforce.
- Maintained, small (~30KB combined), accessible (keyboard support out of the box).
- HTML5 drag-and-drop is unreliable on mobile; `react-beautiful-dnd` is deprecated; custom pointer-event handling is a maintenance trap for one screen.

Install:

```sh
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Sensor setup uses `PointerSensor` with an `activationConstraint: { distance: 5 }` so taps on adjacent UI don't start drags.

## 4. API Plan

Add one new route. The completed-workout edit screen needs no new API.

```txt
PATCH /api/workout-sessions/[id]/exercise-order
```

Request body (matches spec §9.5):

```json
{
  "workout_exercise_ids": ["uuid-1", "uuid-2", "uuid-3"]
}
```

Response: `200` with the updated workout exercise list (same shape as `GET /api/workout-sessions/[id]/exercises`) so the client can replace state from the response.

Status codes:

- `200` on success
- `400` for invalid UUIDs in the path or body, missing `workout_exercise_ids`, non-array, empty array, or duplicate ids in the array
- `404` for missing session, non-active session, or when the submitted id set does not exactly match the current set of workout exercises for that session (no extras, no missing)
- `409` for unexpected unique-constraint conflicts during reindex (should not occur with the two-pass offset; included as a safety net)

Validation order (do all in a single transaction):

1. Validate session id is a UUID and resolves to an active workout.
2. Validate body shape: `workout_exercise_ids` must be a non-empty array of UUIDs with no duplicates.
3. Load all `WorkoutSessionExercise` rows for the session.
4. Reject if the submitted id set does not exactly match the current set.
5. Apply the two-pass offset: bump every row's `orderIndex` to `orderIndex + N + 1` (where `N` is the row count), then write the final indices `0..N-1` in submission order. This avoids transient unique-constraint violations.
6. Return the freshly ordered list.

### 4.1 Service

Add `reorderActiveWorkoutExercises(sessionId, ids)` to `src/lib/workout-exercise-api.ts`. It mirrors the structure of the existing `removeExerciseFromActiveWorkout` (which already lives there with the two-pass reindex). Reuse `workoutSessionExerciseSelect` and the existing response mapper for the return value.

### 4.2 Route handler

Add `src/app/api/workout-sessions/[id]/exercise-order/route.ts` with `PATCH` only. Mirror the validation/error helpers from `src/app/api/workout-sessions/[id]/discard/route.ts`.

## 5. UI Plan

### 5.1 Live workout (`src/app/workout-app.tsx`)

- Wrap the exercise list section in `DndContext` + `SortableContext` (vertical strategy, `restrictToVerticalAxis` from `@dnd-kit/modifiers`).
- Each exercise card becomes a `useSortable` consumer; spread `setNodeRef` + transform on the card root, but spread `listeners` + `attributes` only on the drag handle button.
- Add a `DragHandleIcon` button on the left of the exercise header. `aria-label="Reorder exercise"`, fixed size (e.g. h-11 w-11 to honor 44px tap target).
- On `onDragEnd`: compute the new id order; if unchanged, no-op; otherwise call `handleReorderExercises(newIds)`.
- `handleReorderExercises` does optimistic update + PATCH; on failure, restore the previous order and set a dismissible error banner.
- Style: handle uses `text-zinc-500` (subtle), active row gets `cursor-grabbing`, dragging row gets `scale-[1.02]` and a slightly stronger shadow.

### 5.2 Completed-workout edit (`src/app/profile/workouts/[id]/edit/edit-workout-app.tsx`)

- Same `DndContext` + `SortableContext` setup as live workout.
- `onDragEnd` mutates the draft `exercises` array in local state. No API call.
- Save Workout submits the existing edit payload, which sends exercises in current draft order — the server already maps array index to `orderIndex`.
- The drag handle UI must match the live workout's, except actions on the card differ (Edit's existing structure stays the same).

### 5.3 Saved workout detail (read-only)

No drag handle. Order is displayed as `order_index` per the existing `ExerciseSection` rendering in `saved-workout-detail-app.tsx`.

### 5.4 Mobile scroll vs drag

- The page main scroller is the `AppShell`'s `<main>` (per the `min-h-0 flex-1 overflow-y-auto` setup). `@dnd-kit` auto-scrolls during drag near the edges, which is the desired behavior.
- The activation constraint `{ distance: 5 }` keeps a tap-on-handle from accidentally starting a drag.
- Restricting drags to the vertical axis with `restrictToVerticalAxis` prevents diagonal drift during a touch drag.

## 6. Validation Plan

Static validation:

- Read local Next 16 Route Handlers and Client Component docs before adding the route and before introducing the dnd context.
- Read `@dnd-kit` docs in `node_modules/@dnd-kit/*/dist` for current API surface (sensors, modifiers, sortable strategy).
- `npm run lint`
- `npm run build`
- `git diff --check`

API smoke checks (against a temporary workout):

- `PATCH /api/workout-sessions/not-a-uuid/exercise-order` returns `400`.
- Empty body, missing `workout_exercise_ids`, non-array, duplicate ids, malformed UUIDs in array — each returns `400`.
- Submitting the wrong id set (extra id, missing id, completely different ids) returns `404`.
- Submitting an id set that matches the session but in a different order returns `200` with the new order persisted.
- Reordering a session with a single exercise is a no-op (`200`, same order).
- Submitting against a completed (non-active) session returns `404`.
- Direct DB check after a successful reorder confirms `orderIndex` values are `0..N-1` and unique within the session.

UI smoke checks (mobile browser, LAN-IP URL):

- Tap on the drag handle, drag the card up/down, drop in a new position. Order persists across page refresh.
- Tap-without-drag on the handle does nothing.
- Tap on the exercise title, notes field, set row, kebab, Add Set — all still tappable.
- Long vertical scroll while drag is not active works as before.
- Drag near the top/bottom of the visible area auto-scrolls the main pane.
- Reorder during an in-flight set save: both should resolve cleanly (separate endpoints, separate optimistic state).
- Edit completed workout: reorder in draft, Save, reopen the saved workout detail — order matches.
- Network failure on live reorder: drag completes, error banner shows, prior order restored. Tap retry → succeeds when network is back.

## 7. Handoff and Git

- Append a dated `(Claude)` or `(Codex)` entry to `HANDOFF.md` after the work, including commit hashes and validation summary.
- Phase 12 is a user-testable feature, so push to `origin/main` once committed (per the project rule to push when a core feature is done).
- No Prisma schema or migration changes — `orderIndex` and the unique constraint already exist.
- New runtime dependencies: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`. Commit `package.json` and `package-lock.json` together with the source changes.
- No changes to local-only files (`HANDOFF.md`, `CLAUDE.md`, `PHASE_STATUS.md`, `.codex`).
