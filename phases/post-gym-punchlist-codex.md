# Post-Gym Test Punch List — Plan for Codex

## Context

User ran a real workout at the gym after the Phase 14 polish landed. Phase 14 polish itself worked cleanly (no toast/zoom/skeleton issues). What surfaced is a 9-item punch list of pre-existing bugs and new design directions discovered during real use.

Goal: ship these fixes as a focused batch on top of a freshly committed Phase 14 baseline. Each item is small enough to land independently; bundling them keeps the diff coherent.

User-confirmed scope decisions:
- Phase 14 polish gets committed + pushed first as a clean baseline (separate commit, no changes to its content).
- The `phases/phase14-outstanding-codex.md` plan doc gets tracked in git as part of the Phase 14 baseline commit.
- Item #7's drag handle stays a handle (per CLAUDE.md hard rule). The handle's *hit area* expands to cover thumbnail + name — not the whole card.
- Item #6 scrollbar hide is applied globally (`*` selector).

Out of scope: any post-MVP work (routines, Previous column, analytics).

---

## Pre-step — Commit + push Phase 14 polish

Before touching any of the 9 items, commit the modified files from the prior session (`src/app/active-workout-card.tsx`, `app-shell.tsx`, `confirm-sheet.tsx`, `exercise-library-app.tsx`, `profile/measures/measures-app.tsx`, `profile/settings/settings-app.tsx`, `profile/settings/units/units-settings-app.tsx`, `profile/workouts/[id]/edit/edit-workout-app.tsx`, `profile/workouts/[id]/saved-workout-detail-app.tsx`, `workout-app.tsx`, `workout-metadata-ui.tsx`) plus the new `src/app/toast.tsx` and `phases/phase14-outstanding-codex.md`. Single commit, push to `origin/main`. Append a HANDOFF entry.

---

## Bug batch — fix in place

### Item 1 — Unit switch (kg→lbs) breaks saves on existing rows

**Root cause** (confirmed via exploration): `src/app/workout-app.tsx:881-925` `handleUpdateWorkoutExerciseUnit()` updates `workoutExercise.input_weight_unit` in local state, but child sets keep their old `set.weight_input_unit`. The 350ms-debounced set PATCH in `getWorkoutSetPatch()` (`workout-app.tsx:2912-2921`) reads the stale per-set unit and sends it to the server, where it conflicts with the new exercise unit.

**Fix:** In `handleUpdateWorkoutExerciseUnit()`, when applying the optimistic local update (lines 887–895), also mirror the new unit onto every child set's `weight_input_unit`. Then the server-success replacement at lines 912–923 will already match what the client expects.

- File: `src/app/workout-app.tsx`
- Single edit inside the existing optimistic-update block.
- Server PATCH shape unchanged.
- Add a brief verification: Prisma `WorkoutSet.weightInputUnit` (schema line 180) accepts the same enum as `WorkoutSessionExercise.inputWeightUnit` (line 151), so no schema work.

### Item 3 — Minimize → reopen scrolls to top (preserve scroll position)

**Current state:** `requestOpenLive()` in `src/app/active-workout-context.tsx:130-135` accepts an optional `scrollToWorkoutExerciseId` (used for add-exercise highlight). Minimize today is just a UI flip with no scroll capture. Scroll-to-card effect lives in `src/app/workout-app.tsx:591-636`.

**Fix:**
- On minimize handler in `workout-app.tsx` (header `onMinimize` callback, line ~1298), read the live workout scroll container's `scrollTop` and stash it on the active workout context (new `lastScrollTop: number | null`).
- On reopen, if `scrollToWorkoutExerciseId` is null but `lastScrollTop` is non-null, restore `scrollTop` after exercises mount. The newly-added scroll-to-card path takes precedence (don't restore if a scroll target was set).
- Identify the scroll container by walking up from a card ref (or add a ref to the wrapping `<div className="space-y-4">` at line 1291 that's actually scrollable — likely AppShell `<main>`).
- Clear `lastScrollTop` after restore so the next open without minimize doesn't replay it.

- Files: `src/app/active-workout-context.tsx`, `src/app/workout-app.tsx`.

### Item 4 — RPE popup janky after Android screen-off → wake (best-effort low-risk fix)

**Symptom:** First RPE sheet open after the Android phone wakes from screen-off has a janky transition; subsequent opens are smooth. Likely cause: GPU layer eviction during screen-off, paid back on first composite.

**Fix (low-risk, no behavior change):**
- Add `will-change: transform` and `transform: translateZ(0)` to the RPE sheet panel + backdrop in `workout-app.tsx:2668-2675`. This keeps the layer warm.
- If still janky after that, add a one-time `visibilitychange` listener at `app-shell.tsx` level that nudges a layout thrash on `visible` (last resort — don't add unless the CSS hint alone doesn't cut it).

- File: `src/app/workout-app.tsx` (sheet panel classes).
- Note: This is investigative; user re-tests at next gym session and reports back. If still janky, escalate.

### Item 9 — Save Workout summary cramps Volume (e.g. "22,000 lbs")

**Pattern to copy:** Live workout stats strip already fixed at `src/app/workout-app.tsx:1765-1769`. It uses `grid-cols-[minmax(84px,0.75fr)_minmax(112px,1fr)_minmax(40px,max-content)]` with `gap-x-4` so Volume gets the dominant column.

**Fix:** Replace the cramped grid in `src/app/workout-metadata-ui.tsx:94-103` (`grid-cols-[minmax(116px,1.35fr)_minmax(74px,0.85fr)_minmax(52px,0.55fr)]` + `gap-3`) with the same column template the live strip uses, adjusted for the metadata stat sizing if needed.

- File: `src/app/workout-metadata-ui.tsx`.
- Verify the same grid renders correctly inside both finish and edit-workout callers (`edit-workout-app.tsx`).

---

## Sync tweak

### Item 2 — Exercise notes: longer typing-idle debounce

**Current:** `src/app/workout-app.tsx:1024-1052` `handleChangeWorkoutExerciseNotes()` already debounces at **500ms** via `setTimeout`/`clearTimeout`. User perceives this as "syncs on every keystroke" because 500ms fires while still typing in normal cadence.

**Fix:** Bump the notes debounce window from 500ms → 800ms (clear "typing pause" feel without making save feel laggy). One-line constant change. Edit workout (`edit-workout-app.tsx:755-764`) is a draft editor with no live PATCH — leave it as-is.

- File: `src/app/workout-app.tsx`.
- No new utility.

---

## UI redesigns

### Item 5 — Bottom nav scope + Profile header rename

**Current:** `src/app/app-shell.tsx:123` renders `<BottomNav />` unconditionally. Profile passes `title={currentProfile.username}` (`profile-menu-app.tsx:128`) which then duplicates inside `ProfileSummary` at line 173.

**Fix:**
- In `app-shell.tsx`, gate `<BottomNav />` rendering on `pathname` being one of the two root tabs: `/` (Workout) or `/profile` (Profile root). All other routes (`/exercises`, `/profile/exercises`, `/profile/measures`, `/profile/settings`, `/profile/settings/units`, `/profile/workouts/[id]`, `/profile/workouts/[id]/edit`) get full-screen.
- Add a `showBottomNav` derived boolean using the existing `usePathname()` already imported by `BottomNav`. Lift it to AppShell level so the layout can also drop the bottom padding/safe-area space when nav is hidden.
- Rename `profile-menu-app.tsx:128` from `title={currentProfile.username}` → `title="Profile"` (mirrors `title="Workout"` from `workout-app.tsx:260`). Username display remains in the body via `ProfileSummary` (line 173).

- Files: `src/app/app-shell.tsx`, `src/app/profile-menu-app.tsx`.

### Item 6 — Hide mobile scrollbars

**Current:** No scrollbar CSS in `src/app/globals.css`. Tailwind v4 + PostCSS, no conflicts.

**Fix:** Add a global rule:

```css
* { scrollbar-width: none; }
*::-webkit-scrollbar { display: none; }
```

Apply globally so every scroll surface (live workout list, exercise library, sheets) is clean.

- File: `src/app/globals.css`.

### Item 7 — Live exercise card: thumbnail + wrappable name + larger drag handle

**Current:** `src/app/workout-app.tsx:1900-1921` `ExerciseDragHandle()` is a small button containing `GripIcon`, with `setActivatorNodeRef` + dnd-kit `{...attributes} {...listeners}` scoped to that button only. Card flex row at line 1964; name at line 1967 uses `truncate text-lg font-semibold text-white`.

**Fix:**
- Replace the grip icon inside `ExerciseDragHandle` with `<ExerciseThumb name={...} size="sm" />` (from `src/app/exercise-thumb.tsx`).
- Expand the activator button to wrap both the thumbnail and the exercise name `<h2>`. Move `setActivatorNodeRef` + `attributes` + `listeners` onto this wider button. The non-handle portion of the card (badge, more menu, set rows) stays untouched, preserving the hard rule (drag is still on a handle, not the whole card).
- Remove `truncate` from the name; switch to `break-words` (or `whitespace-normal`) so long names wrap to a second line within the handle area.
- Apply identical changes to the edit-workout drag handle at `src/app/profile/workouts/[id]/edit/edit-workout-app.tsx:700-721`.
- `ExerciseThumb` already has a `size="sm"` (42×42px) per `src/app/exercise-thumb.tsx:10-15` — reuse, no new component.

- Files: `src/app/workout-app.tsx`, `src/app/profile/workouts/[id]/edit/edit-workout-app.tsx`.

---

## Platform investigation

### Item 8 — Android keypad showing autofill bar (passwords/addresses)

**Status:** Partial mitigation already shipped in Phase 14 (`autoComplete="off"` on numeric inputs). Android Chrome ignores `autoComplete="off"` inconsistently when it pattern-matches the input as a known field type.

**Fix attempt (low-risk):**
- Add `name` attributes that don't suggest credit card / password / address (e.g., `name="weight-value"` rather than `name="weight"`).
- Add `autoComplete="off"` and `data-lpignore="true"` (LastPass) and `data-form-type="other"` to the weight/reps/RPE/bodyweight inputs.
- Confirm `inputMode="decimal"` / `inputMode="numeric"` is set (already done in Phase 14).
- This is best-effort; Android may still show the bar in some cases.

- Files: `src/app/workout-app.tsx`, `src/app/profile/workouts/[id]/edit/edit-workout-app.tsx`, `src/app/profile/measures/measures-app.tsx`.

---

## Critical files (consolidated)

- `src/app/workout-app.tsx` — items 1, 2, 3, 4, 7, 8.
- `src/app/active-workout-context.tsx` — item 3 (lastScrollTop).
- `src/app/workout-metadata-ui.tsx` — item 9.
- `src/app/app-shell.tsx` — item 5 (nav scope).
- `src/app/profile-menu-app.tsx` — item 5 (header rename).
- `src/app/globals.css` — item 6.
- `src/app/profile/workouts/[id]/edit/edit-workout-app.tsx` — items 7, 8.
- `src/app/profile/measures/measures-app.tsx` — item 8.
- `src/app/exercise-thumb.tsx` — read-only reuse for item 7.

## Reusable patterns (no new helpers)

- 350ms / 500ms debounce idiom via `setTimeout`/`clearTimeout` already in `workout-app.tsx` — pattern to extend for item 2.
- `formatVolumeSummary()` + `formatDecimal()` in `workout-app.tsx:1303-1306, 3095-3102` — already used by save metadata; only the grid template needs the swap.
- `ExerciseThumb size="sm"` from `exercise-thumb.tsx` — reuse for item 7.
- `setActivatorNodeRef` from `useSortable()` — extend hit area for item 7 without breaking the hard rule.

## Verification

For each landed batch (Codex should commit bug batch separately from UI redesign batch):

1. `npm run lint`
2. `npm run build`
3. `git diff --check`
4. Local browser smoke (per item):
   - **Item 1:** Start workout, add an exercise that defaults to kg, log 3 sets, switch unit to lbs, edit reps on row 1 → confirm save succeeds (no console error, no rejection in network tab).
   - **Item 2:** Type a multi-word note slowly; confirm save fires only after pause (~800ms), not per keystroke. Watch network tab for PATCH frequency.
   - **Item 3:** Scroll halfway down a long exercise list, minimize via header arrow, reopen via floating card → confirm scroll position is preserved.
   - **Item 4:** Re-test on phone after screen lock/unlock cycle — sheet open should be smooth.
   - **Item 5:** Navigate every subpage in the list; confirm bottom nav is hidden. Profile root header reads "Profile". Workout root + Profile root still show nav.
   - **Item 6:** All scroll surfaces have no visible bar on phone and desktop.
   - **Item 7:** Long exercise name wraps to a second line in card. Tap+hold thumbnail OR name region → drag works. Tap+hold elsewhere on card → no drag, normal scroll.
   - **Item 8:** Android Chrome — confirm autofill bar suppression (best-effort).
   - **Item 9:** Save Workout screen with 22,000+ lbs volume — confirm Volume fits without truncating.
5. Append `## YYYY-MM-DD (Codex)` HANDOFF entry per CLAUDE.md handoff rules.
6. Commit + push the bug batch first, then the UI redesign batch separately, so the user can revert UI work alone if a redesign feels wrong on next gym test.

## Sequencing

1. **Pre-step:** Commit + push Phase 14 polish baseline (including `phases/phase14-outstanding-codex.md`).
2. **Bug batch:** Items 1, 3, 4, 9, 2 (sync tweak rides with bugs since it's tiny). One commit, push, gym retest.
3. **UI redesign batch:** Items 5, 6, 7, 8. Separate commit, push, gym retest.

This keeps the bug fixes immediately verifiable against today's gym findings, and the bigger UI redesign decoupled so it can be evaluated on its own at the next test.
