# Phase 6.5 — Floating Active-Workout Card + Reusable Discard Confirm Sheet

> **Author:** Claude (planning), to be implemented by Codex.
> **Status:** Approved spec. Ready to build.
> **Scope:** Pure UI/UX slice. Replaces the existing in-page Resume card with a global floating card visible on the two top-level tabs, and replaces the `window.confirm()` discard prompts with a polished bottom-sheet confirm.

---

## 1. Context — why this change

Today, when a user has an active workout and minimizes the live screen, a Resume card appears **only on the Workout tab (`/`)**. If the user navigates to Profile they lose all visibility of the in-progress workout — there's no way back to it without manually tapping the Workout tab and then tapping Resume. That's two taps and a context shift to do something that should be one tap from anywhere.

In addition, the live-workout Discard button currently uses `window.confirm()` — an OS dialog that looks alien against our dark mobile UI. We want a reusable in-app confirm sheet so both this discard and future destructive actions (Finish & Save in Phase 7, etc.) feel native.

## 2. Product spec

### 2.1 Floating active-workout card

A compact card that sits **above the bottom nav**, full-width within the app shell's `max-w-md` container.

**Visibility rules**
- Show **only** on `/` (Workout tab) and `/profile` (Profile tab).
- Hide on every subpage: `/profile/exercises`, `/profile/measures`, `/profile/settings`, `/profile/settings/units`.
- Hide while the user is in the **live workout** view (`screen === "live"` inside `WorkoutApp`).
- Show only when the API reports an active workout session exists.

**Layout (left → middle → right)**
- **Left:** circular chevron-up button (`h-10 w-10`, `bg-white/[0.06]`, `rounded-full`).
- **Middle:** two-line stack.
  - Top line: a small **green pulsing dot** (`h-2 w-2`, `bg-emerald-400`, `animate-pulse`), the word **"Workout"** in white semibold, and the live duration in mono (e.g. `11s`, `1m 5s`, `1h 18m 25s`).
  - Bottom line: the **most recently checked-set exercise name** in `text-zinc-500` text-sm. If no set has been checked yet in this workout, falls back to `"No exercise"`.
- **Right:** circular trash button (`h-10 w-10`, `bg-red-500/10`, `text-red-400`, `rounded-full`).

**Interaction**
- Tapping anywhere on the card body (left chevron OR middle text) opens the live workout: navigate to `/` and switch `WorkoutApp` to `screen === "live"`.
- Tapping the trash button (with `event.stopPropagation()`) opens the new reusable confirm sheet asking **"Discard this active workout?"**. Confirming runs `POST /api/workout-sessions/[id]/discard`, clears the active session in shared state, and dismisses the card.

**Visual language** — match existing NextRep elements; do **not** copy the reference screenshots. Card surface should read as `bg-[#181818]` with `ring-1 ring-white/10` inside `rounded-2xl`. Use the same emerald-300/400 palette already used elsewhere for "active" indicators. The pulsing dot uses Tailwind's `animate-pulse`.

### 2.2 Replaces the existing Resume card

The existing in-page Resume card on `/` (the `ResumeWorkout` component in `src/app/workout-app.tsx`) is **removed**. When a session is active and the user is on the Workout tab but not in live mode, the tab shows the **Start Empty Workout** layout with the Start button **disabled**, accompanied by subtle helper copy: *"You have a workout in progress — tap the card below to resume."* This prevents starting a second workout (which the server already blocks via the `one_active_workout` partial unique index) and visually points the user at the floating card.

### 2.3 Reusable confirm sheet

Replace the `window.confirm()` call in `src/app/workout-app.tsx:150` (the live-workout Discard button) with the new sheet. Use the same sheet for the trash button on the floating card.

The other two `window.confirm()` call sites (Measures delete in `measures-app.tsx`, Exercise delete in `exercise-library-app.tsx`) are **out of scope** for this slice — leave them alone.

**Sheet design — match existing bottom sheets in the app**
- Backdrop: `bg-black/60` overlay, click-outside cancels.
- Sheet container: `bg-[#141414]`, `rounded-t-3xl`, slide-in from bottom.
- Top handle: 36×4 rounded `bg-white/15` pill, centered.
- Title (large, white, centered): the question, e.g. *"Discard this active workout?"*
- Description (small, `text-zinc-400`, centered): one short line of consequence, e.g. *"Your in-progress sets and exercises will be deleted."*
- Primary button (full-width, prominent): the destructive action label in red — *"Discard Workout"*. Uses `bg-red-500/15 text-red-300 ring-1 ring-red-500/30`. (No emerald — that reads as "go" and would be wrong here.)
- Secondary button (full-width): *"Cancel"*, `bg-white/[0.06] text-white`.

## 3. Architecture

### 3.1 Shared active-workout state

Two unrelated tabs (`/` and `/profile`) both need to know whether an active session exists, plus its `id`, `started_at`, `server_now`, and `current_exercise_name`. Today this state lives privately inside `WorkoutApp`.

**Move it to a React context** that wraps the whole app at the layout level.

- New file: `src/app/active-workout-context.tsx` (Client Component).
- Exposes `{ session, isLoading, error, refresh(), clear() }` via `useActiveWorkout()`.
- On mount, calls `GET /api/workout-sessions/active`.
- `refresh()` re-fetches; called by `WorkoutApp` after starting a workout, after every successful set check toggle, and after discard/finish.
- `clear()` sets `session = null` locally without a network round-trip — used after a successful discard.
- Provider mounted in **`src/app/layout.tsx`** so it spans every page (including subpages — even though they don't render the card, the provider being mounted means `WorkoutApp` and `ProfileMenuApp` share one source of truth instead of duplicating fetches).

### 3.2 New API field: `current_exercise_name`

Add a derived field to the workout session response shape:

```ts
type WorkoutSession = {
  // ...existing fields
  current_exercise_name: string | null;
};
```

**Server computation** (in `src/lib/workout-session-api.ts`):
- After loading the session, query the most recent `WorkoutSet` where `workoutSessionExercise.workoutSessionId === session.id` and `checked === true`, ordered by `checkedAt DESC`, take 1.
- If found, include the joined `WorkoutSessionExercise.exerciseNameSnapshot` in the response.
- If no checked sets exist, return `null`.

Apply this addition to the response mapper used by:
- `GET /api/workout-sessions/active`
- `POST /api/workout-sessions` (so a freshly-started session also has the field; will always be `null` initially)
- Any other route that returns the session shape (if the existing mapper is shared, one change covers all of them — confirm during implementation).

### 3.3 Where the card renders

Render the card inside `AppShell` between `<main>` and `<BottomNav>`. `AppShell` already uses `usePathname` (Client Component), so it can:
- Read pathname.
- Read `useActiveWorkout()`.
- Decide whether to render the card based on pathname AND a new `hideFloatingCard` prop (set to `true` by `WorkoutApp` while `screen === "live"`).

Add prop:
```ts
type AppShellProps = {
  // ...existing
  hideFloatingCard?: boolean;  // default false
};
```

Card visibility logic inside `AppShell`:
```
showCard = !hideFloatingCard
        && session != null
        && (pathname === "/" || pathname === "/profile")
```

### 3.4 Discard wiring

The card's trash button and the live-workout's Discard button both:
1. Open the confirm sheet.
2. On confirm, call `POST /api/workout-sessions/[id]/discard`.
3. On 204, call `clear()` on the context.
4. If the request fails, surface the error inline via the existing error-banner pattern (the live workout already has `error` state; the floating card can reuse a small toast or inline error in the sheet).

## 4. Files to add / modify

### Add
- `src/app/active-workout-context.tsx` — provider + `useActiveWorkout` hook.
- `src/app/active-workout-card.tsx` — the floating card component.
- `src/app/confirm-sheet.tsx` — reusable bottom-sheet confirm dialog.

### Modify
- `src/app/layout.tsx` — wrap `{children}` in `<ActiveWorkoutProvider>`.
- `src/app/app-shell.tsx`:
  - Add `hideFloatingCard?: boolean` prop.
  - Import `useActiveWorkout` and the card; render card between `<main>` and `<BottomNav>` per the visibility rule above.
- `src/app/workout-app.tsx`:
  - Remove `ResumeWorkout` component and its render branch.
  - Remove the `screen === "resume"` value (now only `"start" | "live"`).
  - Read session from `useActiveWorkout()` instead of local state. Local `session` state goes away.
  - When `session !== null && screen !== "live"`, render the Start Empty Workout view but with `disabled={true}` on the Start button and the helper copy from §2.2.
  - When the chevron-down minimize is tapped in the live view, set `screen = "start"` (the floating card now appears via AppShell).
  - On the live screen's Discard button, replace `window.confirm(...)` with the new `<ConfirmSheet>` and the same wiring as the floating card's trash.
  - Pass `hideFloatingCard={screen === "live"}` to `AppShell`.
  - After every successful `PATCH /api/sets/[id]` that toggles `checked`, call `refresh()` on the context so `current_exercise_name` stays accurate when the user minimizes.
- `src/lib/workout-session-api.ts`:
  - Add `current_exercise_name: string | null` to the response type.
  - Update the Prisma `select` to include the data needed (workout-session-exercise rows with their sets).
  - In the mapper, compute the most-recent-checked-set lookup and include the exercise's `exerciseNameSnapshot`.

### Untouched
- `measures-app.tsx` and `exercise-library-app.tsx` `window.confirm()` calls — out of scope.
- API discard route, Prisma schema, all migrations — no changes needed.

## 5. Implementation order

1. **API field first** — extend `workout-session-api.ts` and the active/start endpoints to return `current_exercise_name`. Smoke test with `curl`.
2. **Context + provider** — wire `ActiveWorkoutProvider` into `layout.tsx`. Verify with React DevTools that both `WorkoutApp` and `ProfileMenuApp` see the same session reference.
3. **Confirm sheet component** — build the reusable component and verify it visually looks like our existing bottom sheets.
4. **Floating card component** — build it, hook up duration via `useElapsedSeconds`, and the trash → confirm sheet flow.
5. **AppShell integration** — render the card and add the `hideFloatingCard` prop.
6. **WorkoutApp refactor** — remove `ResumeWorkout`, switch to context, swap the live-workout `window.confirm` for the sheet, wire `refresh()` after set checkmark toggles.
7. **Manual end-to-end test** — see §6.

## 6. Verification

Run all of these against a real local dev stack (`docker compose up`):

**Static checks**
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] `git diff --check` clean.

**API**
- [ ] `GET /api/workout-sessions/active` with no active session → `null`.
- [ ] Start a session: `POST /api/workout-sessions` → response includes `current_exercise_name: null`.
- [ ] Add an exercise, edit a set with `checked: true`, then `GET /api/workout-sessions/active` → response includes `current_exercise_name: "<exercise name>"`.
- [ ] Toggle that set back to `checked: false`, fetch again → `current_exercise_name` reverts to whichever older checked set is most recent, or `null` if none.

**UI — happy path**
- [ ] On `/`, with no active session, the floating card is **not** visible.
- [ ] Tap **Start Empty Workout** → live workout opens, **no** floating card visible (we're in live view).
- [ ] Tap the chevron-down minimize → returns to `/`. Start button is disabled with helper copy. Floating card appears above bottom nav, shows **"Workout 0s"** + **"No exercise"**, green dot pulsing.
- [ ] Wait a few seconds — duration ticks up live.
- [ ] Navigate to `/profile` — floating card still visible, duration still ticking.
- [ ] Tap card body — opens live workout.
- [ ] Add an exercise, edit a set's reps/weight, **tap the checkmark**. Minimize. Floating card subtitle now shows that exercise's name.
- [ ] Tap the trash button on the card → confirm sheet appears with title "Discard this active workout?" and red "Discard Workout" + "Cancel" buttons.
- [ ] Tap Cancel → sheet dismisses, card still present.
- [ ] Tap trash → Discard Workout → sheet dismisses, card disappears, Start button becomes enabled.

**UI — subpages**
- [ ] Start a workout, minimize, navigate to `/profile/exercises` → floating card **hidden**.
- [ ] Same for `/profile/measures` and `/profile/settings` → hidden.
- [ ] Return to `/profile` → reappears.

**UI — discard from live view**
- [ ] In the live workout, tap the existing Discard button → the **same** confirm sheet appears (no more `window.confirm()`).
- [ ] Confirm → workout discarded, returns to Start Empty state, no floating card.

**Browser regressions to watch for**
- [ ] No hydration warnings in dev (Proton Pass overlay aside, which is a known benign extension issue).
- [ ] No double-fetch of `/api/workout-sessions/active` on initial load (provider should fetch once; `WorkoutApp` should not re-fetch).

## 7. Out of scope (do not include)

- Any changes to the `window.confirm()` calls in Measures or Exercise Library — defer.
- Polling for active session changes from external clients (single-user app, only one tab matters).
- Animations beyond `animate-pulse` and the sheet's slide-in (no fancy enter/exit choreography on the card itself for this slice — appears/disappears instantly).
- Persisting "minimized" state across page reloads — if the user reloads while in the live workout, they land back on `/` showing the floating card; they can re-open the workout from there. This is acceptable.
- Swipe-down to dismiss the confirm sheet — Cancel button is sufficient.

## 8. Hard rules to respect (from `CLAUDE.md` §15)

- **Don't store timer ticks** — duration on the floating card is computed client-side from `started_at` + `server_now`, same as everywhere else.
- **One active workout** — `current_exercise_name` lookup must scope by `workoutSessionId`, not query globally.
- **Snapshot on add** — use `exerciseNameSnapshot`, not a live join to `Exercise.name`. (The snapshot is already there from earlier phases; just make sure the new query joins on the snapshot.)

## 9. Handoff log entry (for Codex to write after merging)

When you finish, append a `## YYYY-MM-DD (Codex)` section to `HANDOFF.md` with:
- The new files added.
- Files modified and the gist of each change.
- Validation commands run and their results.
- Any deviations from this spec.
- Confirm whether you pushed to `origin/main` or kept it local (per the user's preference, push when a user-testable feature lands).
