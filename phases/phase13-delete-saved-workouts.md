# Phase 13 - Delete Saved Workouts

> **Author:** Claude (implementation plan).
> **Status:** Draft plan.
> **Scope:** Hard delete a completed workout from the saved workout detail screen. The other Phase 13 spec items (delete active discarded workout, delete exercise, snapshot-safe history) are already implemented; this phase fills only the saved-workout deletion gap.
> **Goal:** From the saved workout detail screen, the user can permanently remove a completed workout, including all logged exercises and sets, and return to the workout history list.

---

## 1. Context

Phases 0–11 are shipped. The user can edit a saved workout from the detail screen but cannot delete one. Spec §12 Phase 13 calls for hard-delete of saved workouts with snapshot-safe history.

Snapshot fields on `workout_session_exercises` (`exercise_name_snapshot`, `equipment_name_snapshot`, `primary_muscle_group_name_snapshot`) make completed workouts readable even after the source `Exercise` is deleted. Deleting a workout does not touch any source `Exercise`, so snapshot safety is automatic.

```txt
Saved detail -> Delete button -> Confirm sheet -> DELETE /api/workout-sessions/[id] -> back to /profile
```

## 2. Product Behavior

### 2.1 Entry point

Saved workout detail (`/profile/workouts/[id]`) exposes a Delete affordance at the bottom of the screen, below the exercise sections.

The existing Edit icon in the AppShell `action` slot stays as-is. Delete is intentionally placed at the bottom of the page so a destructive action is not adjacent to the primary navigation chrome.

### 2.2 Confirm flow

Tapping Delete opens the existing `ConfirmSheet` component (`src/app/confirm-sheet.tsx`) with:

- title: `Delete this workout?`
- description: `This permanently removes the workout, including all logged exercises and sets. This can't be undone.`
- confirmLabel: `Delete`
- confirmingLabel: `Deleting`

Cancel closes the sheet and stays on the detail screen.

Confirm calls the new `DELETE` route. On success, the user is navigated back to `/profile` via `useRouter().push("/profile")`. The Profile workout history list re-fetches on mount, so the deleted workout disappears.

On error, the sheet stays open and surfaces the message via the `ConfirmSheet` `error` prop (already supported).

### 2.3 Out of scope behavior

Do not implement:

- inline delete button or swipe-to-delete inside the Profile history list
- multi-select / bulk delete
- soft delete, archive, or undo/restore
- deleting from the completed workout edit screen
- deleting active workouts (already covered by `POST /api/workout-sessions/[id]/discard`)

## 3. API Plan

Add `DELETE` to the existing `src/app/api/workout-sessions/[id]/route.ts` alongside the current `GET`:

```txt
DELETE /api/workout-sessions/[id]
```

Status codes:

- `204` on success
- `400` for invalid UUIDs (message: `Workout session id must be a valid UUID.`)
- `404` for missing sessions and for sessions that are not in `completed` status (uses the existing `notFound()` helper, message: `Completed workout session not found.`)

Active sessions must not be deletable through this route. The `discardActiveWorkoutSession` flow remains the only way to remove an active session.

Add a service function in `src/lib/completed-workout-api.ts`:

```ts
export async function deleteCompletedWorkout(id: string): Promise<
  | { kind: "invalid_id" }
  | { kind: "not_found" }
  | { kind: "ok" }
> {
  if (!isUuid(id)) return { kind: "invalid_id" };

  const result = await prisma.workoutSession.deleteMany({
    where: { id, status: "completed" },
  });

  return result.count > 0 ? { kind: "ok" } : { kind: "not_found" };
}
```

Rationale for `deleteMany` over `findFirst` + `delete`:

- The `status: "completed"` filter is enforced by the same SQL statement that does the delete, so there is no race between read and write.
- Mirrors the existing `discardActiveWorkoutSession` pattern at `src/lib/workout-session-api.ts:170`.

Reuse the existing `isUuid` helper from `@/lib/workout-session-api`.

### 3.1 Cascade behavior (already in place)

`prisma/schema.prisma` already configures:

- `workout_session_exercises.workoutSessionId` -> `onDelete: Cascade`
- `workout_sets.workoutSessionExerciseId` -> `onDelete: Cascade`
- `workout_sets.parentSetId` -> `onDelete: SetNull` (irrelevant; siblings are being deleted in the same operation)

A single `prisma.workoutSession.deleteMany` removes the session row, all its workout exercises, and all sets in one transaction. No new migration is needed.

## 4. UI Plan

Edit `src/app/profile/workouts/[id]/saved-workout-detail-app.tsx`:

- Import `useRouter` from `next/navigation` and `ConfirmSheet` from `@/app/confirm-sheet`.
- Add local state: `isConfirmDeleteOpen`, `isDeleting`, `deleteError`.
- Add a Delete workout button at the bottom of `WorkoutDetail`, after the exercises section. Style as a destructive secondary action: full-width, dark surface, red text, ring matching the `ConfirmSheet` primary button language so it does not read as the dominant CTA.
- Tap opens the `ConfirmSheet` described in §2.2.
- Confirm calls `fetch(\`/api/workout-sessions/${workoutId}\`, { method: "DELETE" })`. On `204`, `router.push("/profile")`. On non-OK, set `deleteError` from the response body via the existing `readErrorResponse` helper and clear `isDeleting`.
- The existing AppShell `action` slot keeps the Edit icon unchanged.

Do not modify:

- Profile workout history list (`src/app/profile-menu-app.tsx`) — it re-fetches on mount, so removal propagates without code changes.
- Completed workout edit screen.

## 5. Validation Plan

Static validation:

- Read relevant local Next 16 Route Handlers and Server/Client Components docs before editing.
- `npm run lint`
- `npm run build`
- `git diff --check`

API smoke checks:

- `DELETE /api/workout-sessions/not-a-uuid` returns `400`.
- `DELETE /api/workout-sessions/<random-but-valid-uuid>` returns `404`.
- `DELETE /api/workout-sessions/<active-session-id>` returns `404` (active sessions stay protected). Pull the active id from `GET /api/workout-sessions/active` if one exists, or skip this check and note it.
- Pick one real completed workout id from `GET /api/workout-sessions/completed`, delete it, expect `204`.
- Re-fetch `GET /api/workout-sessions/completed` and confirm the id is gone.
- Verify cascade: `psql` count of `workout_session_exercises` and `workout_sets` rows referencing the deleted id is `0`.

UI smoke checks (optional this phase, defer to Phase 14 phone testing if Playwright is unavailable):

- Open saved workout detail, tap Delete, confirm, lands on `/profile`, deleted entry no longer in history list.
- Open detail, tap Delete, cancel, stays on detail screen.
- Simulate concurrent delete: open detail, delete the same workout via API in another tab, then confirm in the original tab. The sheet shows the `404` error and does not navigate.

## 6. Handoff and Git

- Append a dated `(Claude)` or `(Codex)` entry to `HANDOFF.md` after the work, including commit hashes and validation summary.
- Phase 13 is a user-testable feature, so push to `origin/main` once committed (per the project rule to push when a core feature is done).
- No Prisma schema or migration changes.
- No changes to local-only files (`HANDOFF.md`, `CLAUDE.md`, `PHASE_STATUS.md`, `.codex`).
