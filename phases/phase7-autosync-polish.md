# Phase 7 - Autosync Polish (reliability slice)

> **Author:** Claude (implementation plan, revised after Codex review).
> **Status:** Draft plan.
> **Scope:** Add the autosync reliability layer to the live workout: typed HTTP error, per-key serialized save queue, server-response merge guard, in-flight indicator, failed-saves banner with retry, and a Finish gate. Does **not** finish all of spec §6.7 — typing-time debounce and add-exercise reliability are explicit follow-ups (see §6).
> **Goal:** When the network or server briefly fails on a live-workout write, the user keeps their local change visible, the app retries on its own, and Finish cannot proceed until everything is reconciled.

---

## 1. Context

Phases 6.5/6.6 shipped the floating active-workout card, minimize/restore, and shared timer math. Phase 12 added a bespoke optimistic-with-revert banner for exercise reorder. This phase replaces that bespoke pattern with a single global reliability layer for live-workout writes, per spec §6.7:

```txt
keep local UI change visible
show a small unsaved/retrying state
retry automatically
prevent Finish while failed unsaved changes remain
```

The doc was revised after Codex flagged seven concrete issues with the prior draft. Each issue is addressed by a specific design decision in §3 below; the issues are recapped in §1.1 for traceability.

This is **not** offline support. It is reliability for "the Tailscale link blipped" or "the dev container restarted mid-edit."

### 1.1 Issues from Codex review (and where they're addressed)

| # | Severity | Issue | Resolved in |
|---|---|---|---|
| 1 | HIGH | Set PATCH responses replace the full sets array; in-flight responses can clobber newer local edits. Coalescing-by-key alone doesn't fix this. | §3.2 + §3.6 |
| 2 | HIGH | `fetchJson` (`src/app/workout-app.tsx:2264`) throws plain `Error` and discards `response.status`. Retry classification can't be implemented as written. | §3.1 |
| 3 | MED | Phase 12 reorder reverts on final failure (`src/app/workout-app.tsx:845–848`); spec §6.7 says keep the local UI change. The new banner pattern needs to reconcile this. | §3.5 |
| 4 | MED | Finish button uses HTML `disabled={isFinishing}` (`src/app/workout-app.tsx:1397`); a true-disabled button never fires onClick. "Disabled tap shows toast" can't work. | §2.4 |
| 5 | MED | Add-exercise lives in `src/app/exercise-library-app.tsx`, not `workout-app.tsx`. A LiveWorkout-local queue can't manage it. | §6 (out of scope this pass) |
| 6 | LOW | Spec §6.7 lists weight/reps/RPE inputs as 300–600ms debounced; this pass keeps blur-only. | §6 (out of scope this pass) |
| 7 | LOW | Prior draft said both "append HANDOFF.md" and "no changes to local-only files including HANDOFF.md." | §7 |

## 2. Product Behavior

### 2.1 In-flight indicator

Whenever any active-workout write is in flight, show a subtle "Saving…" pill near the live workout's sticky toolbar (recommended placement: between the title and the timer). The pill disappears when all in-flight writes resolve successfully. The existing per-row `isSaving` opacity treatment for individual set rows stays.

### 2.2 Automatic retry

On a transient failure (see classification in §3.1), the app retries the same operation up to **3 attempts total** with exponential backoff:

```txt
attempt 1: immediate
attempt 2: 1s later
attempt 3: 3s later
```

Permanent failures (4xx other than the listed transient codes) are not retried — they indicate validation or invariant errors that retrying won't fix.

### 2.3 Failed-save banner

If any operation fails permanently after retries, show a sticky banner directly under the live workout toolbar:

```txt
Couldn't save N change(s). Tap to retry.
```

Tapping the banner re-runs each failed operation (a fresh 3-attempt cycle). On full success, the banner disappears. On partial success, the banner updates with the new failed count. Single global banner — replaces the bespoke reorder banner from Phase 12.

If the target row of a failed op is deleted before retry succeeds (e.g. a failed set update for a since-deleted set), drop the failed entry; the row no longer exists.

### 2.4 Finish protection (uses `aria-disabled`)

The Finish button changes from HTML `disabled` to `aria-disabled` so onClick fires regardless of state:

```tsx
<button
  type="button"
  aria-disabled={isFinishing || isSyncBusy}
  onClick={() => {
    if (isFinishing) return;
    if (isSyncBusy) {
      showSyncBusyToast();
      return;
    }
    onFinish();
  }}
  className={
    // visually identical to current disabled style when aria-disabled is true
    (isFinishing || isSyncBusy) ? "...zinc-700 text-zinc-300 cursor-not-allowed" : "...emerald-500 text-white"
  }
>
```

`isSyncBusy = pendingCount > 0 || inFlightCount > 0 || failedCount > 0 || hasDebouncedNoteTimers`. This addresses Codex finding 4: HTML `disabled` swallows clicks, and it keeps Finish blocked while work is queued behind an in-flight request or still waiting in a debounce timer.

The toast is a transient (1.5–2s) bottom-of-screen amber pill: `"Wait for changes to save before finishing."` Reuse the existing success-banner pattern from `workout-app.tsx` (the green "Workout saved" pill the post-save flow uses) — same component, different color.

### 2.5 Reorder behavior change

Spec §6.7 says failed sync should **keep the local UI change visible**. Phase 12 currently reverts. This phase changes that: on permanent reorder failure, the new order **stays** in the UI; the global banner surfaces the failure; tap-retry resends the latest order. Finish is gated until the failure clears. This is an intentional behavior change vs. Phase 12 — call it out in the HANDOFF entry.

### 2.6 Out of scope this pass

See §6 for the full deferred list. The two main ones:

- Add-exercise reliability stays a single-shot fetch in `exercise-library-app.tsx`.
- Typing-time debounce on weight/reps/RPE inputs stays on blur.

## 3. Implementation

### 3.1 Typed HTTP error + status-aware retry classifier (fixes finding 2)

Add to a new `src/lib/http-error.ts`:

```ts
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly url: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function isTransientError(error: unknown): boolean {
  if (error instanceof HttpError) {
    return [408, 425, 429, 500, 502, 503, 504].includes(error.status);
  }
  // Fetch network failures throw TypeError without a status.
  return error instanceof TypeError;
}
```

Update `fetchJson` in `src/app/workout-app.tsx:2264`:

```ts
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new HttpError(response.status, await readErrorResponse(response), url);
  }
  return (await response.json()) as T;
}
```

Existing call sites still catch `error` and read `getErrorMessage(error)` — no behavior change for current consumers, since `HttpError extends Error`. The new `error.status` becomes available for the retry classifier.

If `fetchJson` is also used from `src/app/exercise-library-app.tsx` and other modules, extract it to `src/lib/fetch-json.ts` and re-export. Otherwise leave it co-located and import the new error class.

### 3.2 Save queue (`src/lib/save-queue.ts`)

A small client-side queue keyed by `operationKey`. The key shape:

- set field update → `set:<setId>`
- set add → `set-add:<workoutExerciseId>:<nonce>` (never coalesced)
- set delete → `set-delete:<setId>`
- exercise unit / notes → `workout-exercise:<id>:<field>`
- remove exercise → `workout-exercise-remove:<id>`
- exercise reorder → `exercise-order:<sessionId>`

Public API:

```ts
type SaveOperation = {
  key: string;
  // run() is called at fire time, NOT at enqueue time. It must read the
  // latest local state for its payload. This is critical for finding 1.
  run: (signal: AbortSignal) => Promise<unknown>;
  describe: string; // e.g. "set 2 weight"
  // Called when this op resolves or finally fails. Used by callers to
  // apply server response with the merge guard (§3.6).
  onSuccess?: (response: unknown) => void;
};

type SaveQueueState = {
  inFlight: Map<string, SaveOperation>;
  pending: Map<string, SaveOperation>;
  failed: Map<string, { op: SaveOperation; error: string }>;
};

export function useSaveQueue(): {
  state: SaveQueueState;
  isBusy: boolean; // pending.size > 0 || inFlight.size > 0 || failed.size > 0
  enqueue: (op: SaveOperation) => void;
  retryAll: () => void;
  drop: (key: string) => void; // when target row deleted
  waitForKeys: (keys: string[]) => Promise<boolean>; // true only if drained with no failures
};
```

Behavior:

- **Per-key serial sequencing.** While `key` has an in-flight op, a new enqueue replaces *any pending op for that key* but does not interrupt the in-flight one. When in-flight resolves, if a pending op exists for that key, it fires immediately. Different keys run in parallel.
- **Failed-key replacement.** If `enqueue(op)` is called with a key that currently exists in `failed`, remove the failed entry and start/queue the new op. This lets continued editing replace stale failures instead of leaving an old banner entry blocking Finish.
- **`run()` reads local state at fire time.** This is the key fix for finding 1. The op factory closes over a "build payload from current local state" function rather than over a snapshot. By the time `run()` actually executes, it sees the most recent local edits, so coalescing per key combines fields from successive edits without losing data.
- **AbortController per op.** When a pending op is replaced, the abandoned pending op is simply not fired. In-flight ops are not aborted (would risk server side-effect ambiguity); they run to completion and their `onSuccess` apply the merge guard.
- **3-attempt retry with backoff** (immediate, 1s, 3s) on transient errors per §3.1. Permanent errors fail fast. Final failure moves the op to `failed`.
- **Network status hint.** Consider `navigator.onLine` as a soft signal, but do not require a tap after reconnect. If an op is paused or failed because the browser reports offline, register an `online` listener and automatically retry affected ops when connectivity returns.

### 3.3 In-flight pill component

A small `<SavingPill />` in `src/app/workout-app.tsx`. Renders only when `inFlight.size > 0`. Simple "Saving…" text with a subtle dot. Place between the toolbar title and timer.

### 3.4 Failed-saves banner

A `<FailedSavesBanner />` rendered between the live toolbar and the summary strip. Shows when `failed.size > 0`. Tap → `retryAll()`. Banner copy uses the count: `"Couldn't save 1 change. Tap to retry."` / `"Couldn't save 3 changes. Tap to retry."`.

### 3.5 Reorder integration (fixes finding 3)

Replace the local revert/banner state added in Phase 12 (`src/app/workout-app.tsx:840–850`):

1. Optimistic-update local order. Do not retain a `previousOrderIds` for revert.
2. `enqueue({ key: "exercise-order:<sessionId>", run: () => PATCH .../exercise-order with current local order, describe: "exercise order", onSuccess: replaceFromServer })`.
3. On final failure, the queue's `failed` map contains the op. The global banner surfaces it. Local order **stays** in the new arrangement — user can still see and edit; it just isn't synced.
4. Tap-retry sends the **latest** local order (because `run()` re-reads), not the order at the original drag-drop moment. This naturally handles the "reorder twice while failed" edge case.

The `failedExerciseOrderIds` and `reorderError` local state from Phase 12 are removed; the global queue subsumes them.

### 3.6 Server-response merge guard (fixes finding 1)

For set PATCH responses (and any other endpoint that returns full state for the parent), add per-set "dirty fields since this request was fired" tracking:

```ts
type DirtyFields = Set<"weight" | "reps" | "rpe" | "set_type" | "checked" | "weight_unit">;

// In LiveWorkout component:
const dirtyFieldsBySet = useRef<Map<string, DirtyFields>>(new Map());
```

When a set field changes locally, add it to `dirtyFieldsBySet.get(setId)`.
`handleUpdateSet` must also optimistically merge the patch into parent-level `workoutExercises` before enqueueing. This is required because `WorkoutSetEditorRow` currently owns weight/reps/RPE input state until commit; the queue's "read latest local state at fire time" rule only works if committed local edits are reflected in the parent state that `run()` reads.
When enqueueing a set update, snapshot+clear the current dirty set for that key (or pass the current dirty set into the op as a marker).
When the response arrives:

- For each returned set, look up its current dirty set.
- For each field on the response: if the field is in the dirty set, **keep local value**; else apply server value.
- Critically, do not clear the dirty set on success — only clear fields that were *included in the request payload that just resolved*. Newer dirty fields stay marked so the next enqueue catches them.

This handles the race: PATCH 1 with `{weight:25}` is in flight, user types in reps, PATCH 1 returns; the response's `reps` is null/old, but `dirtyFieldsBySet[setId]` includes "reps" → response merge skips reps → local typed value persists.

For non-set endpoints whose responses don't carry user-editable fields (set add, set delete, remove exercise), the merge guard is a no-op — just apply the response normally.

### 3.7 Notes integration

`persistWorkoutExerciseNotes` already debounces (500ms). Wire its actual fetch through the queue using key `workout-exercise:<id>:notes`. The existing `flushPendingExerciseNotes` becomes:

1. Fire any debounced-but-not-yet-enqueued notes immediately.
2. Wait for the queue to drain `workout-exercise:<id>:notes` for every exercise.
3. Confirm no `failed` entry exists for those keys.

If the queue still has pending notes ops or any failed notes ops, `flushPendingExerciseNotes` returns false and the Finish flow gates accordingly (already covered by `isSyncBusy`).

### 3.8 Backend

No backend changes. Existing routes already return appropriate 4xx/5xx codes; the new client retry logic handles the transient ones.

## 4. Critical files

- `src/app/workout-app.tsx` — wire queue into all live-workout handlers; replace Phase 12 revert; update Finish gate to `aria-disabled`; add SavingPill and FailedSavesBanner; update fetchJson to throw HttpError.
- `src/lib/save-queue.ts` — **new** — the queue hook and types.
- `src/lib/http-error.ts` — **new** — typed error class and classifier.
- (optional) `src/lib/fetch-json.ts` — **new** — extract `fetchJson` if other modules need it.
- `src/app/exercise-library-app.tsx` — **not changed** in this phase (add-exercise reliability is deferred per §6).

## 5. Validation Plan

Static validation:

- Read local Next 16 client-component docs and `AbortController` notes before introducing the queue.
- `npm run lint`
- `npm run build`
- `git diff --check`

Manual reliability checks against the dev container:

- **Happy path:** add an exercise, edit a set's weight and reps, change set type, check the box. Watch the toolbar "Saving…" pill flash and disappear; no banner appears.
- **Network blip:** Chrome DevTools → Network → Offline → edit a set's weight. Pill stays, then banner appears: "Couldn't save 1 change. Tap to retry." Switch to Online → tap banner → banner clears.
- **Server error:** temporarily patch a route handler to return `500` once, edit a set, expect 3 attempts (visible if logging). Banner shows. Revert the patch, tap retry → banner clears.
- **Coalescing across fields:** with throttling on, rapidly enter weight, then reps, then RPE on a set. Verify exactly one final PATCH with all three fields lands server-side (`psql` confirm).
- **In-flight response merge:** with throttling on, type weight `25`, blur (PATCH 1 fires); immediately type reps `8` while PATCH 1 is in flight; PATCH 1 returns. Verify reps `8` is still visible locally and is then sent in PATCH 2.
- **Finish gate (in-flight):** simulate slow network, edit a set, immediately tap Finish. Toast appears. After save resolves, Finish enables.
- **Finish gate (failed):** force a permanent failure on a set update, attempt Finish. Toast appears. Restore route, tap retry, banner clears, Finish enables.
- **Reorder UI persists on failure:** force `/exercise-order` to fail permanently. Drag exercise A→bottom. Order stays as A→bottom in UI; banner appears. Tap retry; banner clears.
- **Reorder twice while failed:** with route still failing, drag again to a different order. Banner stays; on tap retry (after restoring route), the *latest* order persists, not the first one.
- **Drop on delete:** force a permanent fail on a set update; while banner is up, delete that set. Banner clears (op dropped, no orphan retry).

API smoke is already covered by prior phases — no route changes here.

## 6. Deferred to follow-up phase

These spec §6.7 items are explicitly **not** shipping in this pass:

- **Add-exercise reliability.** Add-exercise lives in `src/app/exercise-library-app.tsx:145`. Its current single-shot fetch shows errors locally. Wiring it through the queue requires lifting queue state into `src/app/active-workout-context.tsx` so it survives the cross-route navigation. That's a meaningful architectural change; defer.
- **Typing-time debounce on weight/reps/RPE inputs (300–600ms).** Today saves on blur, which is reliable on mobile because numeric keyboards have a Done button. Adding typing-time debounce means more code paths and more test surfaces. Skip unless the user reports a complaint.
- **Floating active-workout card save indicator.** Only the live workout toolbar gets the SavingPill / banner this pass. Floating card stays as today.

A follow-up phase doc will pick these up if the user prioritizes them.

## 7. Handoff and Git

- Append a dated `(Codex)` or `(Claude)` entry to `HANDOFF.md` after the work, including commit hashes and validation summary. **Do not stage or commit `HANDOFF.md`** — it's gitignored and lives only in the working tree. (Fixes Codex finding 7.)
- Phase 7 reliability slice is a user-visible improvement, so push to `origin/main` once committed (per the project rule to push when a core feature is done).
- No Prisma schema, migration, or new package changes.
- No changes to local-only files (`CLAUDE.md`, `PHASE_STATUS.md`, `.codex`).

## 8. Risks and Open Questions

- **Risk:** the merge guard's "dirty fields" tracking has to be precise about *what was sent* vs. *what was newly typed*. Bug-prone area — write the merge logic with unit-test-sized paranoia even if no test framework is in place yet. Code comments should explicitly say "this is a workaround for partial-PATCH-with-full-response."
- **Open question:** when a permanent failure banner is up, should the user still be allowed to keep editing? Recommendation: **yes** — keep the UI fully editable. Each new edit creates a new queue op for that key, which replaces the pending-failed one; the merge guard ensures no clobber. The user's intent is the source of truth.
- **Open question:** does the queue need to survive minimize → resume? Today resume re-fetches via `loadWorkoutExercises` and would discard local pending state. This is acceptable for MVP; the user is the only writer and the Tailscale link is reliable enough that minimize-during-failure is rare. If it becomes a problem, lift the queue into `active-workout-context.tsx`.
