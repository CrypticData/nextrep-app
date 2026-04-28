# Phase 8 — Finish & Save Workout (Stub Save)

> **Author:** Claude (planning), to be implemented by Codex.
> **Status:** Approved spec. Ready to build.
> **Scope:** Adds the front half of the finish loop — Finish button, validation, invalid-row cleanup, and a stub commit that auto-fills name and duration. Phase 9 will replace the stub with an editable Save Workout screen.
> **Goal:** After this lands, the user can finish a workout end-to-end at the gym. Workouts will leave `status='active'` for the first time.

---

## 1. Context — why this change

Today, a started workout has no path to `status='completed'`. The user can log sets perfectly, minimize/resume, and discard — but there's no Finish button, no validation, no commit. Sessions sit in `active` forever.

Phase 8 closes the front half of that loop. Phase 9 will follow up with an editable Save Workout screen (title, description, start time, duration). To unlock end-to-end usability *now*, Phase 8 includes a **stub finish** that auto-generates the workout name and uses the live timer's duration — so the user can actually save workouts before Phase 9 lands.

## 2. Product spec

### 2.1 Finish button

- The live workout sticky toolbar already has a Finish button (verify during implementation; wire it up if it's a no-op today).
- Tap behavior:
  1. Disable the button immediately to prevent double-taps.
  2. Call `POST /api/workout-sessions/[id]/finish/validate`.
  3. Branch on the response:
     - `can_continue: true` → proceed to step 6.
     - `reason: "no_recorded_sets"` → show inline error banner (see §2.3); re-enable button.
     - `reason: "invalid_weighted_sets"` → show invalid-row confirm sheet (see §2.4); user can confirm discard or cancel.
     - `reason: "not_active"` → show inline error "This workout was already completed or discarded."; clear active session via context.
  4. If user confirmed discard from the invalid-row sheet → `POST /api/workout-sessions/[id]/sets/discard-invalid` → revalidate by calling `/finish/validate` again. (Edge case: discarding all invalid rows could leave the workout with zero recorded sets — the second validate catches that.)
  5. (Loop back to step 3 with the second validate's response.)
  6. Call `POST /api/workout-sessions/[id]/finish` with auto-generated body (see §2.5).
  7. On 200: clear active session via context (`clear()`), show a small "Workout saved" toast (or inline success state on the home screen), navigate to `/`. The floating card and live workout collapse naturally because the context session goes null.
  8. On non-200: re-enable button, surface error inline.

### 2.2 Invalid-row rule (applies uniformly to all set types)

A set is **invalid weighted** if:

```
weight > 0 AND (reps is null OR reps = 0)
```

Applies to **all set types** — normal, warmup, failure, drop. No exemptions. This is the user's confirmed product call: simpler rule, no special cases. The user must clean up unfinished rows regardless of type before finishing.

A set is **completely empty** if:

```
weight is null/0 AND reps is null/0
```

Completely empty rows are removed silently as part of `POST /finish` — no user prompt.

A set is **recorded** if `reps >= 1`. (Existing rule from §5.3 — unchanged.)

### 2.3 No-recorded-sets error UI

When validate returns `reason: "no_recorded_sets"`, show an inline error banner on the live workout (matches the existing `SetEditError` pattern):

> "You haven't logged any sets yet. Record at least one set with reps to finish this workout."

If the workout also has zero exercises, prefer the more specific copy:

> "You haven't added any exercises yet. Add an exercise and log a set to finish this workout."

The Finish button re-enables so the user can try again after fixing.

### 2.4 Invalid-row warning sheet (count only)

Reuse the `ConfirmSheet` component from Phase 6.5. Per the user's product call: count only, no list.

- Title: `"Discard <N> unfinished row<s> to finish?"` (e.g. `"Discard 2 unfinished rows to finish?"`)
- Description: `"These rows have a weight but no reps. They cannot be saved."`
- Confirm label: `"Discard & Finish"` (red destructive tone, matching the discard-workout sheet).
- Cancel label: `"Cancel"`.
- On confirm: discard-invalid → revalidate → finish (per §2.1 step 4–6).

### 2.5 Stub finish payload (Phase 8 only — Phase 9 replaces this)

Client computes and sends:

```json
{
  "name": "Workout — <day-of-week> <month> <day>",
  "description": null,
  "started_at": "<session.started_at unchanged>",
  "duration_seconds": <floor((Date.now() + offsetMs - Date.parse(session.started_at)) / 1000)>
}
```

- `name` example: `"Workout — Mon Apr 28"`. Compute on the client at the moment of finish using the workout's actual start date (not "today" — handles the edge case of starting at 11pm and finishing at 1am).
- `duration_seconds` uses the same offset-aware math as the existing live timer (`Date.now() + offsetMs - startedAt`) — keeps it consistent with what the user just saw on the toolbar.
- `description` is null in the stub.

Server uses this body to set `started_at`, compute `ended_at = started_at + duration_seconds`, set `status='completed'`, and persist the name.

## 3. API design

### 3.1 `POST /api/workout-sessions/[id]/finish/validate`

Validates without mutating. Returns one of:

```json
{ "can_continue": true }
```

```json
{
  "can_continue": false,
  "reason": "no_recorded_sets"
}
```

```json
{
  "can_continue": false,
  "reason": "invalid_weighted_sets",
  "invalid_set_count": 2
}
```

```json
{
  "can_continue": false,
  "reason": "not_active"
}
```

The spec example shows an `invalid_sets` array of full set objects. We don't need that for "count only" UI — return just `invalid_set_count`. Keeps the response light. (If Phase 9 or a future change wants the list view, expand the response then.)

Server logic:
1. Look up session by id. UUID validation, 400 on bad UUID, 404 on missing.
2. If `status !== 'active'` → return `not_active`.
3. Count invalid weighted rows: `weight > 0 AND (reps IS NULL OR reps = 0)` across all sets in the session.
4. If invalid count > 0 → return `invalid_weighted_sets` with count.
5. Count recorded sets: `reps >= 1`.
6. If recorded count = 0 → return `no_recorded_sets`.
7. Else → `can_continue: true`.

Order matters: invalid weighted rows are reported **before** no-recorded-sets, because cleaning up invalid rows could leave the user with zero recorded sets, and we want to reveal that state on the second validate after the user discards invalid rows.

### 3.2 `POST /api/workout-sessions/[id]/sets/discard-invalid`

Bulk-deletes all invalid weighted rows for the session, then reindexes per-exercise.

- 400 on bad UUID.
- 404 on missing session.
- 409 on `status !== 'active'`.
- On success: 200 with `{ deleted_count: N }`. Body is informational; the client revalidates rather than trusting it.

Reuse the existing per-exercise reindex logic from `deleteActiveWorkoutSet` (`src/lib/workout-set-api.ts`) — but apply it once per affected exercise after the bulk delete, not per-row.

### 3.3 `POST /api/workout-sessions/[id]/finish`

Commits the workout.

Request body:

```json
{
  "name": "string, required, 1-120 chars",
  "description": "string | null",
  "started_at": "ISO8601 string",
  "duration_seconds": "integer >= 0"
}
```

Server logic (in a single transaction):
1. UUID/body validation.
2. Look up session. 404 on missing, 409 on `status !== 'active'`.
3. **Re-run validation** (don't trust the client). If `no_recorded_sets` or `invalid_weighted_sets` → 409 with reason. The client should never hit this if it's behaving, but per spec §7.3 backend must enforce.
4. Silently delete completely empty rows (`weight IS NULL/0 AND reps IS NULL/0`).
5. Reindex per-exercise after the empty-row cleanup.
6. Update session: `status='completed'`, `name`, `description`, `started_at` (from body), `ended_at = started_at + duration_seconds * 1000`.
7. Return the completed session in the same shape as the existing session response.

Notes:
- `one_active_workout` partial unique index automatically allows a new session after this commits.
- Don't trust the client's `started_at` blindly — validate it parses, and reject values in the future or absurdly far in the past (>30 days). For Phase 8's stub, the client just passes the existing `session.started_at` unchanged, so this guard mostly matters for Phase 9.

## 4. Files to add / modify

### Add
- `src/app/api/workout-sessions/[id]/finish/validate/route.ts`
- `src/app/api/workout-sessions/[id]/sets/discard-invalid/route.ts`
- `src/app/api/workout-sessions/[id]/finish/route.ts`

### Modify
- `src/lib/workout-session-api.ts` — add three new service functions:
  - `validateFinishWorkout(id)` returning the discriminated-union response.
  - `discardInvalidSets(id)` performing the bulk delete + reindex; returns deleted count.
  - `finishWorkout(id, payload)` performing the commit; reuses validation internally.
- `src/lib/workout-set-api.ts` — extract or expose a reusable per-exercise reindex helper if it isn't already. Avoid duplicating row_index/set_number recalculation logic.
- `src/app/workout-app.tsx` — wire up the existing Finish button. Add the validate-then-finish flow with the invalid-row sheet, error banner, success toast, and post-success navigation. Reuse `ConfirmSheet`. Add inline `<FinishError>` component matching `<SetEditError>`.
- `src/app/active-workout-context.tsx` — no changes expected. `clear()` already does the right thing on success.

### Untouched
- Prisma schema (no new fields needed).
- Migrations (no new migration).
- Phase 7 autosync (this work doesn't depend on it).
- Floating card (unchanged — collapses naturally when context session is cleared).

## 5. Edge cases and decisions already locked

- **Double-tap Finish** → button disabled after first tap; server returns `not_active` if a duplicate sneaks through.
- **Workout with zero exercises** → handled by `no_recorded_sets` reason, with a friendlier copy variant.
- **All sets are invalid** → first validate returns `invalid_weighted_sets`. After discard, second validate returns `no_recorded_sets`. User sees both prompts in sequence — acceptable.
- **In-flight set save when Finish tapped** → today every set PATCH is instant (no debounce yet). Phase 7 will introduce debounce + retry; flushing pending saves before validate becomes a Phase 7 concern. For Phase 8, no explicit handling needed.
- **Network failure during finish** → button re-enables, error surfaces inline. User can retry. No partial-state risk because the finish endpoint is transactional.
- **Server time vs client time for duration** → client uses offset-aware math (same as the timer). Acceptable drift; Phase 9 will let the user edit duration if it's slightly off.
- **What does "Workout saved" success look like?** → Small toast or banner on `/` for ~2 seconds, then dismisses. No new toast component needed if you can reuse an inline banner pattern from Measures or Exercise Library; otherwise a minimal toast is fine — keep it tiny.

## 6. Verification

Run on the real dev stack (`docker compose up`).

**Static**
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] `git diff --check` clean.
- [ ] No new Prisma migration generated.

**API smoke (curl)**
- [ ] `POST /finish/validate` on a session with zero exercises → `{ can_continue: false, reason: "no_recorded_sets" }`.
- [ ] Add an exercise with a single set `{ weight: 135, reps: null }`. Validate → `{ can_continue: false, reason: "invalid_weighted_sets", invalid_set_count: 1 }`.
- [ ] `POST /sets/discard-invalid` → `{ deleted_count: 1 }`. Validate again → `{ can_continue: false, reason: "no_recorded_sets" }`.
- [ ] PATCH the surviving set (or add a new one) to `{ weight: 135, reps: 8 }`. Validate → `{ can_continue: true }`.
- [ ] `POST /finish` with valid body → 200, session shape returned with `status: "completed"` and `ended_at` populated.
- [ ] Repeat `POST /finish` on the same id → 409 `not_active`.
- [ ] `POST /finish/validate` with bogus UUID → 400.
- [ ] `POST /finish/validate` with missing UUID → 404.

**Server-side validation enforcement**
- [ ] Manually craft a finish request that bypasses client validation (e.g. invalid weighted rows still present, or zero recorded sets) → 409 with the appropriate reason. Confirms backend is the source of truth per spec §7.3.

**End-to-end UI**
- [ ] Start a workout, add no exercises, tap Finish → no-recorded-sets error banner. Button re-enables.
- [ ] Add an exercise, type weight `225` but no reps. Tap Finish → invalid-row sheet shows "Discard 1 unfinished row to finish?". Cancel → sheet dismisses, no changes. Tap Finish again, confirm Discard & Finish → no-recorded-sets banner (because the only row was just discarded). Add a real set, finish again → "Workout saved", land on `/`, floating card gone.
- [ ] Start a workout, log 3 normal sets and a warmup with `45 lbs / 0 reps`. Finish → invalid-row sheet shows count of 1. Confirm → workout saves with the 3 normal sets, warmup discarded.
- [ ] Verify in DB: completed session has `status='completed'`, `name='Workout — <weekday> <mon> <day>'`, `started_at` matches the original, `ended_at = started_at + duration_seconds * 1000`.
- [ ] Start a new workout immediately after finishing → succeeds (the partial unique index allowed it).
- [ ] Discard a set, try to finish → behaves correctly with the remaining sets.

**Race / double-tap**
- [ ] Tap Finish, then tap again before the network response → only one validate request fires (button disabled).
- [ ] Confirm Discard & Finish, then tap Discard again before response — same protection.

## 7. Out of scope (do not include)

- Editable Save Workout screen (title, description, start time, duration editing) — that's Phase 9.
- Workout history view (`/profile` placeholder) — Phase 10.
- Edit completed workout — Phase 11.
- Phase 7 autosync robustness, retry, "saving"/"saved" indicators — separate phase.
- Toast component if one already exists — reuse. If not, the simplest possible inline success banner is fine; don't build a full toast system.
- Listing the specific invalid sets in the warning sheet — user explicitly chose count-only.

## 8. Hard rules respected

- **Backend validates finish/edit** (CLAUDE.md §15) — `POST /finish` re-runs validation server-side regardless of what the client sent.
- **One active workout** — server enforces via existing `one_active_workout` partial unique index. Finish frees the slot.
- **Snapshot on add** — unchanged. Existing exercise/equipment/muscle-group snapshots persist into the completed session.
- **Don't store timer ticks** — duration is computed on the client at the moment of finish from `started_at + offsetMs`.
- **Recorded set rule** — `reps >= 1`. Reused unchanged.
- **`row_index` ≠ `set_number`** — reuse existing reindex logic; don't reinvent.

## 9. Hand-off expectations

After merging:
- Append a `## YYYY-MM-DD (Codex)` entry to `HANDOFF.md` listing files added/modified, validation commands run, and any deviations from this spec.
- Push to `origin/main` once validated — this is a user-testable feature (per the push rule, completing a workout end-to-end is exactly the kind of milestone that should ship).
- Update `PHASE_STATUS.md` to mark Phase 8 done, Phase 9 (Save screen) and Phase 7 (autosync) as next remaining.
