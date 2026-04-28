# Phase 8.1 — Drop-set recovery during Finish

> **Author:** Claude (planning), to be implemented by Codex.
> **Status:** Approved spec. Ready to build. Small follow-up to Phase 8.
> **Scope:** ~30 lines. No new endpoints, no schema changes.

---

## 1. Context

Two related polish items for Phase 8 bundled into one pass:

**Item A — drop-set recovery during Finish.** Codex's Phase 8 implementation correctly added an `invalid_drop_set` reason code when discarding invalid weighted rows would orphan a drop set (its parent normal/failure set was the discarded row). Today, both `POST /sets/discard-invalid` and `POST /finish` return `409 invalid_drop_set` in this case, and the user is stuck — they have to manually edit or delete the drop set, then retry Finish.

Existing `recalculateSetNumbering` (`src/lib/workout-set-api.ts:640`) already auto-rechains drop sets to whatever earlier numbered set exists. The 409 only fires when the discarded row was the **first** normal/failure set in the exercise with no earlier one to fall back to.

Per the user's product call: **bulk discard-invalid (during Finish)** should auto-promote an orphaned drop to a Normal set so Finish proceeds. **User-initiated** set deletions and set-type changes (PATCH set, DELETE set) keep the existing strict guard, since the user is explicitly choosing to break the chain.

Real reps stay logged. The drop set just changes type. Once Phase 11 (Edit Completed Workout) ships, the user can flip it back to a drop if they care.

**Item B — empty-row discard ignores checkmark.** The user wants explicit confirmation that a row with `weight = null/0 AND reps = null/0` is silently auto-discarded on Finish **regardless of the checked column**. Phase 8's `emptySetWhere` filter already does this (it doesn't reference `checked`), but this should be locked in with a code comment and a verification test so a future change can't accidentally regress it. Per CLAUDE.md §15, the checkmark is a visual indicator only — not a save filter.

## 2. Implementation

### 2.1 Add a `promoteOrphanedDrops` flag to `recalculateSetNumbering`

In `src/lib/workout-set-api.ts:640`, add an optional second argument:

```ts
function recalculateSetNumbering(
  sets: Array<{ id: string; setType: WorkoutSetType }>,
  options: { promoteOrphanedDrops?: boolean } = {},
): ...
```

In the loop's drop branch (line 662), when `lastNumberedSetId` is null:
- If `options.promoteOrphanedDrops` is true → treat this set as a Normal: assign the next set number, update `lastNumberedSetId = set.id`, push with `parentSetId: null` and the new `setNumber`. Also signal that this set's `setType` must be updated in the database to `'normal'`.
- Else → return `{ ok: false }` (existing behavior).

To carry the type-change signal, expand the `data` element shape to include an optional `setType` override:

```ts
data.push({
  id: set.id,
  setNumber,
  parentSetId: null,
  setType: "normal" as const,  // only present when a drop was promoted
});
```

For all other entries, leave `setType` unset (callers ignore it when not present).

### 2.2 Update `reindexWorkoutExerciseSets` to apply type promotions

In `src/lib/workout-set-api.ts:392`, accept and pass through the same option:

```ts
export async function reindexWorkoutExerciseSets(
  tx: Prisma.TransactionClient,
  workoutSessionExerciseId: string,
  options: { promoteOrphanedDrops?: boolean } = {},
) { ... }
```

In the second-pass write loop, include `setType` in the update if the numbering data carries one:

```ts
data: {
  rowIndex: index + 1,
  setNumber: setNumbering.setNumber,
  parentSetId: setNumbering.parentSetId,
  ...(setNumbering.setType ? { setType: setNumbering.setType } : {}),
}
```

### 2.3 Pass the flag from finish-flow callers, leave others strict

- `discardInvalidSets` (in `workout-session-api.ts`) → call `reindexWorkoutExerciseSets(tx, id, { promoteOrphanedDrops: true })`.
- `finishWorkout`'s post-empty-row reindex → same flag (defensive — empty rows can't be drop parents in practice, but keeps the policy consistent for the finish pass).
- `deleteActiveWorkoutSet` (workout-set-api.ts:346) → **no change**. User explicitly deleted; strict guard stays.
- The PATCH set type flow (workout-set-api.ts:192) → **no change**. User explicitly changed type; strict guard stays.

### 2.4 Remove now-unreachable `invalid_drop_set` paths

With the flag on, `discardInvalidSets` should never return `kind: "invalid_drop_set"` in practice. Two options:

- **Defensive:** Leave the catch and the 409 response as-is — they become unreachable but cost nothing. (Recommended.)
- **Clean:** Remove the `invalid_drop_set` branch from `discardInvalidSets` and the `discard-invalid` route. Tighter code; less safety net if a future change reintroduces the path.

Either is fine. The defensive option is the safer call.

### 2.5 Lock in the empty-row + checkmark rule

In `src/lib/workout-session-api.ts`, find the existing `emptySetWhere` helper and add a one-line comment above it:

```ts
// Checked state is intentionally ignored — empty rows (weight null/0 AND reps null/0)
// are discarded regardless of checkmark. Per CLAUDE.md §15, the checkmark is a visual
// indicator only, never a save filter.
function emptySetWhere(workoutSessionId): Prisma.WorkoutSetWhereInput { ... }
```

No code change to the filter itself — the existing implementation is correct.

## 3. Files to modify

- `src/lib/workout-set-api.ts` — `recalculateSetNumbering` and `reindexWorkoutExerciseSets`.
- `src/lib/workout-session-api.ts` — `discardInvalidSets` and `finishWorkout` pass the flag through; add the comment above `emptySetWhere`.

No route file changes needed.

## 4. Verification

**Static**
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] `git diff --check` clean.

**API repro**
- [ ] Create a temporary active workout. Add an exercise. Add three sets:
  - Set 1: `weight: 225, reps: null` (invalid weighted)
  - Set 2: `set_type: 'drop', weight: 185, reps: 12`
  - Set 3: `set_type: 'drop', weight: 155, reps: 10`
- [ ] `POST /finish/validate` → `{ can_continue: false, reason: 'invalid_weighted_sets', invalid_set_count: 1 }`.
- [ ] `POST /sets/discard-invalid` → `{ deleted_count: 1 }` (no `invalid_drop_set` 409). DB check: Set 2 is now `set_type='normal'`, `set_number=1`, `parent_set_id=null`. Set 3 is now `set_type='drop'`, `parent_set_id=Set 2 id`.
- [ ] `POST /finish/validate` → `{ can_continue: true }`.
- [ ] `POST /finish` with stub payload → 200, completed session.

**User-initiated guards still strict**
- [ ] On a fresh active workout with `[Normal × 8, Drop × 12]`, `DELETE /api/sets/<normal id>` → `409 invalid_drop_set` (unchanged).
- [ ] On a fresh active workout with `[Normal × 8, Drop × 12]`, `PATCH /api/sets/<normal id>` with `{ set_type: 'warmup' }` → `409 invalid_drop_set` (unchanged).

**No regression on normal flow**
- [ ] Existing Phase 8 finish smoke (no exercises, invalid only, mixed valid + invalid, all valid) still passes.

## 5. Out of scope

- UI copy changes for `invalid_drop_set` errors elsewhere — those are still surfaced for user-initiated actions and the existing terse copy is fine for now.
- Any change to PATCH set / DELETE set behavior.
- Any schema change.

## 6. Hand-off expectations

After merging:
- Append a `## YYYY-MM-DD (Codex)` entry to `HANDOFF.md`.
- Push to `origin/main` once validated. This bundles cleanly with the still-uncommitted Phase 8 changes — recommend committing Phase 8 first (if not already), then Phase 8.1 as a separate commit so the diff is reviewable in two parts.
