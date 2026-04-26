# Phase 3: Start Workout and Active Recovery

Status: proposed by Codex on 2026-04-26, reviewed by Claude on 2026-04-26, scope confirmed by user on 2026-04-26. Not yet implemented.

## Summary

Implement strict Phase 3 only: workout session persistence, start/recover APIs, one-active-workout enforcement, and a timer-only live workout shell. Do not add exercises to workouts, sets, autosync, minimize/floating card, finish/save, or saved workout history yet.

## Codex's proposed plan

### Key changes

- Add `WorkoutStatus` enum with `active` and `completed`, plus a `WorkoutSession` Prisma model mapped to `workout_sessions`.
- Create a Prisma migration for `workout_sessions` with:
  - UUID primary key using `gen_random_uuid()`
  - nullable `name`, `description`, `ended_at`
  - non-null `status`, `started_at`, `created_at`, `updated_at`
  - `status` check constraint if Prisma migration does not generate one from the enum
  - raw SQL partial unique index:

    ```sql
    CREATE UNIQUE INDEX one_active_workout
    ON workout_sessions ((status))
    WHERE status = 'active';
    ```

- Add server helper logic for workout session response mapping and one-active creation/recovery behavior.
- Add API routes:
  - `POST /api/workout-sessions` — return the existing active session if present; otherwise create a new active session.
  - `GET /api/workout-sessions/active` — return the active session or `null`.
- Response shape (snake_case externally):

  ```json
  {
    "id": "uuid",
    "name": null,
    "description": null,
    "status": "active",
    "started_at": "iso",
    "ended_at": null,
    "created_at": "iso",
    "updated_at": "iso"
  }
  ```

### UI behavior

- Refactor the current single Exercise Library screen into an app shell with working Workout and Exercises tabs.
- Keep the existing Exercise Library behavior intact under the Exercises tab.
- Make Workout the primary start/recovery surface:
  - On load, call `GET /api/workout-sessions/active`.
  - If no active workout exists, show a dark mobile "Start Empty Workout" screen.
  - Tapping start calls `POST /api/workout-sessions` and opens the live workout shell.
  - If an active workout exists, surface a clear "Resume Workout" affordance that reopens it.
- Live workout shell for Phase 3:
  - Show a workout status header.
  - Show elapsed timer computed client-side from `started_at`.
  - Recompute elapsed locally; do not persist timer ticks.
  - Show an empty state where exercises will appear in Phase 4.
  - Do not render disabled Phase 4+ buttons.

### Test plan

- Schema and client checks:
  - `npx prisma validate`
  - `npx prisma migrate dev --name add_workout_sessions`
  - `npx prisma generate`
  - `npm run build`
- API checks:
  - `POST /api/workout-sessions` creates one active session.
  - Repeated `POST /api/workout-sessions` returns the same active session, not a second row.
  - The partial unique index rejects a second active row at the DB level.
  - `GET /api/workout-sessions/active` returns the active session after creation.
- UI scenarios:
  - Fresh load with no active workout shows the start screen.
  - Starting a workout opens the live workout shell.
  - Timer increases from `started_at` and survives browser refresh.
  - Refresh with an active workout recovers the same session.
  - Existing Exercise Library create/edit/delete still works under the Exercises tab.
- Log implementation and validation results to `HANDOFF.md` in a `## YYYY-MM-DD (Codex)` section during implementation.

### Assumptions

- Current `origin/main` (commit `24694e6`) is the baseline.
- Phase 3 intentionally leaves active workouts without a discard UI/API (see Claude's note below — recommended to add).
- No auth/user columns are added.
- No workout exercises or workout sets are added until Phase 4.

## Claude's review and recommended changes

Spec compliance is good — partial unique index, snake_case JSON, server-side enforcement, no timer-tick persistence, POST-returns-existing all match v2 §4.8 / §6 / §9.4 and the hard rules in `CLAUDE.md`. Recommendations before implementation:

1. **Include the discard endpoint + a discard button in Phase 3.**
   - Spec already defines `POST /api/workout-sessions/:id/discard` (§9.4). Without it, every test session you start during development sits as the active row until manually deleted from Postgres.
   - Cost: one route handler + one button. Low effort, high dev-iteration value.
   - Recommend: include in Phase 3 scope.

2. **Use a "Resume Workout" card on the Workout tab, not auto-open.**
   - Codex's plan offers either; pick the explicit Resume card. Auto-opening a session that was started yesterday and never finished would dump the user into a 19-hour timer with no clear exit (especially before discard exists).
   - The Resume card should display the running elapsed time so the user has context.

3. **Be explicit: no greyed-out Phase 4+ buttons in the live workout shell.**
   - Show the timer + an empty content area with copy like "Exercises will appear here in the next phase." Don't render a disabled "Add Exercise" or "Finish" button.

4. **Tab refactor: use App Router routes, not client-state tabs.**
   - Move the current `src/app/page.tsx` (which renders `ExerciseLibraryApp`) to `src/app/exercises/page.tsx`.
   - Make `src/app/page.tsx` (`/`) the Workout surface.
   - Wire the existing `BottomNav` to use Next.js `Link` so the nav actually navigates.
   - Optionally extract a shared layout (`src/app/layout.tsx` already wraps everything; a nested layout for the tab pages would make sense if shell-chrome diverges later).
   - This is more idiomatic for Next.js 16 App Router and avoids one-giant-component drift.

5. **Default landing page = Workout.** When the app is opened cold (`/`), it should show the Workout tab. Exercises lives at `/exercises`. (Confirmed by user 2026-04-26.)

6. **Migration mechanics reminder.** Codex hit this in Phase 1 — Prisma `migrate dev --create-only` first, then hand-edit the migration SQL to add the partial unique index, then `migrate dev` to apply. The same pattern applies here.

7. **Enum vs CHECK.** Prisma maps a string-backed enum to a Postgres enum type, which is functionally equivalent to a CHECK on `('active', 'completed')`. Either works; the spec uses CHECK syntax. If Codex uses Prisma enums, no separate CHECK is needed.

## Decisions confirmed by user (2026-04-26)

- **Default landing page is the Workout tab.** Cold launch of the app shows the Workout surface; Exercises is reached via the bottom nav.
- **Discard endpoint + button included in Phase 3.** Essential for testing — without it, every test session blocks the next start until manually cleared from the DB. Adds `POST /api/workout-sessions/:id/discard` and a "Discard Workout" button on the live workout shell (and/or the Resume card).
- **No other changes to Codex's plan** beyond the Claude-recommended adjustments above.


## Files this phase will touch

- `prisma/schema.prisma` — add `WorkoutStatus`, `WorkoutSession`.
- `prisma/migrations/<timestamp>_add_workout_sessions/migration.sql` — table + partial unique index.
- `src/lib/workout-session-api.ts` (new) — response mapping + start/recover helper.
- `src/app/api/workout-sessions/route.ts` — `POST` (create-or-return-active).
- `src/app/api/workout-sessions/active/route.ts` — `GET` (active or null).
- `src/app/api/workout-sessions/[id]/discard/route.ts` (new, recommended) — `POST` discard.
- `src/app/page.tsx` — replaced with the Workout tab (Start Empty Workout / Resume card / live workout shell).
- `src/app/exercises/page.tsx` — new home for `ExerciseLibraryApp`.
- `src/app/layout.tsx` and/or a new shared shell — bottom nav wired to navigate.
- `src/app/exercise-library-app.tsx` — minor: drop the local `BottomNav` if shell owns it.
- `HANDOFF.md` — entries during implementation.

## Verification before merging Phase 3

- `npx prisma validate`, `npx prisma migrate status`, `npm run lint`, `npm run build` all pass.
- API checks listed in the test plan above pass.
- Manual UI walkthrough on the LAN URL covers: cold start (no session) → start → see timer → reload → see Resume card → resume → see same timer → discard → back to Start screen. Existing Exercise Library at `/exercises` still works.
