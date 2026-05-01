# Refactor Roadmap

Tracked architectural improvements identified after Phase 2 completion. Each item
includes the current shape, the proposed shape, and rough effort. Order is
recommended sequence — earlier items unblock later ones.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

## 1A. Shared workout-formatting helpers `[~]`

Pure helpers duplicated between `src/app/workout-app.tsx` (live) and
`src/app/profile/workouts/[id]/edit/edit-workout-app.tsx` (edit). Confirmed
identical: `LBS_PER_KG`, `formatDecimal`, `formatPreviousValue`,
`formatVolumeSummary`, `getErrorMessage`, `getDurationSecondsFromInputs`,
`parseNonNegativeInteger`, `parseSignedInteger`, `toLocalDateTimeInputValue`,
`readLocalDateTimeInput`, `normalizeNullableText`, `convertWeightValue`.

**Effort:** Small. Zero behavior change.

## 1B. Shared bottom-sheet UI primitives `[ ]`

`BottomSheet`, `SheetHeader`, `SetTypeSheet`, `WeightUnitSheet`, `RpeSheet`, plus
the inline SVG icon set (`PlusIcon`, `CheckIcon`, `TrashIcon`, `XIcon`,
`DumbbellIcon`, etc.) are duplicated verbatim across `workout-app.tsx`,
`edit-workout-app.tsx`, and partially `saved-workout-detail-app.tsx`.

**Proposed:** `src/app/_components/bottom-sheet.tsx`,
`src/app/_components/set-sheets.tsx`, `src/app/_components/icons.tsx`.

**Effort:** Small/Medium. Risk = visual regression; verify by using each sheet
once at the gym.

## 1C. Shared SetRow component `[ ]`

The interactive set-row component is the largest piece of duplicated UI. Live
(`WorkoutSetEditorRow`, ~235 LOC) and edit (`EditableSetRow`, ~160 LOC) differ
in save behavior — live syncs each field optimistically via the save queue, edit
mutates a local draft.

**Proposed:** Single `<SetRow mode="live" | "edit" ... />` with mode-specific
callbacks. Requires harmonizing the input shape (snake_case `weight_input_value`
vs camelCase `weightValue`) — likely via a small adapter at the call sites
rather than unifying the types.

**Effort:** Large. **Do not start until 1A is shipped and at least one set-row
behavior has a unit test** — the blast radius is too big without one.

## 1D. Type unification via adapters `[ ]` (deprioritized)

Originally proposed: a single `WorkoutDraft` type with `fromActiveSession()` /
`fromCompletedWorkout()` adapters.

**Recommendation:** **Skip for now.** The two contexts have genuinely different
lifecycles (live = optimistic per-field server sync; edit = local draft + bulk
save), so the types are not actually equivalent. Forcing them together adds
indirection without removing real duplication. Revisit only if a third workout
surface appears.

## 2. Consolidate set-numbering rule `[ ]`

The "warmup and drop sets get `setNumber=null`; others get sequential 1,2,3"
rule is implemented at:

- `src/lib/workout-set-api.ts:642` — `recalculateSetNumbering` (server, live)
- `src/lib/completed-workout-edit-api.ts:934` — `recalculateSetNumbering` (server, edit)
- `src/lib/completed-workout-edit-api.ts:957` — `buildPreviewWorkoutSets`
- `src/app/profile/workouts/[id]/edit/edit-workout-app.tsx:1780` — `renumberExerciseSets`

**Proposed:** `src/lib/set-numbering.ts` exporting
`assignSetNumbers(setTypes: SetType[]): (number|null)[]`. All four callers
consume it.

**Effort:** Small. Pairs naturally with first unit test (#8).

## 3. Single `fetchJson` / `HttpError` wrapper `[ ]`

`fetchJson<T>`, `readErrorResponse`, `getErrorMessage`, `isErrorBody` copy-pasted
in `workout-app.tsx`, `edit-workout-app.tsx`, `active-workout-context.tsx`,
`saved-workout-detail-app.tsx`, and several settings pages. `src/lib/http-error.ts`
already exists but isn't used as the single wrapper.

**Proposed:** Make `http-error.ts` deeper — export `fetchJson<T>(url, init)`
that throws a typed `HttpError` carrying status, message, and the parsed body
(`{error, reason, ...}`). Every client file imports it; delete the copies.

**Effort:** Small. Removes a class of error-handling drift bugs (e.g., the
`reason: "invalid_weighted_sets"` on Finish 409s isn't picked up uniformly today).

## 4. Bottom-sheet primitives (covered by 1B) `[ ]`

Same scope as 1B — listed separately in original audit. Treat as one task.

## 5. Split `completed-workout-edit-api.ts` (1,595 LOC) `[ ]`

One file mixes 5 responsibilities:

1. Body parsing / type guards (lines 1208–1599)
2. Edit orchestration (`editCompletedWorkout`, etc., lines 180–789)
3. Preview orchestration (lines 455–600)
4. Bodyweight resolution (lines 790–932) — **also duplicated** in
   `src/lib/workout-set-api.ts:510`
5. Set numbering / preview-set building (lines 934–988) — covered by #2

**Proposed:** `src/lib/edit-workout/{parse,persist,preview}.ts` plus a shared
`src/lib/bodyweight-resolution.ts` consumed by both live and edit paths.

**Effort:** Medium. Bodyweight resolution requires care — live and edit have
slightly different contexts (active session vs. snapshotted session).

## 6. API route handler boilerplate `[ ]`

Every route in `src/app/api/` re-rolls `badRequest()`/`notFound()`/`conflict()`
helpers and a long if/else chain mapping discriminated-union result kinds to HTTP
statuses (see `workout-sessions/[id]/finish/route.ts`,
`workout-sessions/[id]/edit/route.ts`, `sets/[id]/route.ts`).

**Proposed:** `src/lib/api-route.ts` with a `respond(result)` helper or a
`withApiHandler(fn)` wrapper that converts thrown typed `ApiError` subclasses to
responses.

**Effort:** Medium. Touches every route file but each change is small.

## 7. Decompose `LiveWorkout` god component `[ ]`

`LiveWorkout` in `workout-app.tsx` (lines 452–1614, ~1,160 LOC) holds workout
exercise list state, save-queue interaction, exercise-notes debouncing, drag
order, scroll memory, finish validation + invalid-set sheet, rest-timer
integration, and the JSX. ~25 refs and ~15 useState hooks.

**Proposed custom hooks:**
- `useLiveWorkoutExercises(sessionId)` — list state + server-merge
- `useDebouncedExerciseNotes(saveQueue)`
- `useFinishWorkoutFlow(session, saveQueue)` — finish + invalid-set sheet
- `useExerciseOrder(workoutExercises, saveQueue)` — DnD wiring

**Effort:** Large. Best done after 1A and once test scaffolding (#8) exists.

## 8. Test scaffolding (Vitest, no DOM) `[ ]`

Repo has zero tests. The pure functions are easiest to test once they're pulled
out of React components by 1A, #2, #3, #5.

**Proposed first targets:**
- `src/lib/set-numbering.ts` (after #2)
- `src/lib/save-queue.ts` (already pure; 270 LOC of retry/cancel/coalesce
  logic — highest-stakes untested code in the repo)
- `src/lib/workout-formatting.ts` (after 1A)
- `src/lib/edit-workout/parse.ts` (after #5)

**Effort:** Small to start. One test file alongside #2 = 30-minute proof.
Compounds with each following refactor.

## Recommended sequence

1. **1A** (this slice)
2. **#2 + #8 first test** — set-numbering + first unit test together
3. **#3** — consolidate fetch/error handling
4. **1B / #4** — shared sheet & icon primitives
5. **#5** — split the 1,595-LOC edit API (includes consolidating bodyweight
   resolution)
6. **#6** — API route boilerplate
7. **1C** — shared SetRow (only after a SetRow test exists)
8. **#7** — `LiveWorkout` decomposition

`1D` deferred indefinitely.
