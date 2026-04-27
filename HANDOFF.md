# Handoff Log

This file records workspace changes made by Codex and Claude so future sessions of either agent can quickly understand what happened. Each dated section is tagged with the author (`(Codex)` or `(Claude)`). The "Current Known Git Status" at the bottom is shared state and is updated by whichever agent last touched the repo.

## 2026-04-26 (Codex)

- Created `AGENTS.md` as a symlink to `CLAUDE.md` so Codex and Claude share one instruction source.
- Preserved the original `AGENTS.md` briefly as `AGENTS.md.bak`, then copied its Next.js warning into `CLAUDE.md` and removed the backup.
- Updated `CLAUDE.md` to include the `nextjs-agent-rules` block near the top.
- Updated the Next.js stack note in `CLAUDE.md` to reference the local rules and `node_modules/next/dist/docs/` instead of self-referencing `AGENTS.md`.
- Clarified in `CLAUDE.md` that `AGENTS.md` is a symlink to `CLAUDE.md`.
- Analyzed the repo state:
  - The app is still at Phase 0 complete.
  - Phase 1 has not started.
  - `prisma/schema.prisma` has no models yet.
  - `src/app/page.tsx` is still the create-next-app starter UI.
  - `/api/health` is the only real API route.
- Ran validation:
  - `npm run build` passed.
  - `npm run lint` failed because `prototype/ios-frame.jsx` uses `React.Fragment` without importing `React`; the prototype folder is reference-only, so ignoring `prototype/**` in ESLint is likely cleaner than fixing prototype code.
- Reviewed `workout_app_planning_schema_v2.md` after the user said the SWE provided new instructions/insight for Codex and Claude.
- Found v2 materially changes the old spec by making Next.js App Router + TypeScript + Prisma + PostgreSQL the final stack in §2 and adding §16 Prisma Implementation Documentation.
- Updated `CLAUDE.md` so `workout_app_planning_schema_v2.md` is now the current authoritative spec for agents.
- Marked `nextrep-app_planning_schema.md` as the older v1 spec retained for reference.
- Added v2 §2, §16, and §17 to the `CLAUDE.md` authoritative-spec reading table.
- Implemented v2 Phase 1 database/reference data:
  - Added Prisma `WeightUnit`, `AppSettings`, `EquipmentType`, `MuscleGroup`, `Exercise`, and `ExerciseSecondaryMuscleGroup`.
  - Kept datasource URL in `prisma.config.ts` and omitted auth/user/workout/set tables.
  - Created migration `20260426111024_init_reference_data` with `pgcrypto`, `app_settings_singleton`, and seed data for app settings, equipment types, and muscle groups.
  - Added DB-backed API routes: `GET /api/equipment-types`, `GET /api/muscle-groups`, `GET /api/settings`, and `PATCH /api/settings`.
  - Added `prototype/**` to ESLint ignores.
- Phase 1 validation completed:
  - `npx prisma validate` passed.
  - `npx prisma migrate dev --create-only --name init_reference_data` created the migration; migration SQL was manually edited before applying.
  - `npx prisma migrate dev` applied successfully.
  - `npx prisma generate` completed.
  - `npx prisma migrate status` reports the DB schema is up to date.
  - Database checks confirmed one `app_settings` row, 3 equipment rows, 18 muscle groups, idempotent seed inserts, and the singleton constraint rejects `id = 2`.
  - API checks passed for reference/settings GETs, `PATCH /api/settings` with `lbs` and `kg`, malformed JSON, invalid body shape, and invalid unit values.
  - Local app container was restarted after Prisma generation so the dev server loaded the regenerated client.
  - `npm run build` passed.
  - `npm run lint` passed.
- Implemented v2 Phase 2 Exercise Library CRUD:
  - Added `GET /api/exercises`, `POST /api/exercises`, `GET /api/exercises/[id]`, `PATCH /api/exercises/[id]`, and `DELETE /api/exercises/[id]`.
  - Added shared server-side exercise request validation, Prisma selection, response mapping, UUID checks, reference existence checks, and Prisma error handling in `src/lib/exercise-api.ts`.
  - Kept external exercise JSON snake_case and Prisma/internal code camelCase.
  - Implemented hard delete for exercises; secondary muscle join rows cascade through the existing relation.
  - Replaced the create-next-app starter page with a production mobile Exercise Library UI using the prototype as visual/interaction reference without copying prototype data/code.
  - Added search, equipment filter, muscle filter, empty/loading/error states, create/edit bottom sheet, exercise detail view, history placeholder, and confirmed delete UI.
  - Updated app metadata from Create Next App to NextRep.
- Phase 2 validation completed:
  - `npm run lint` passed.
  - `npm run build` passed.
  - Local API checks passed for empty exercise list, create, detail, invalid create validation, update, delete, post-delete `404`, and cleanup back to `[]`.
  - Local app was reachable at `http://localhost:3000` during validation.
- Added a persistent `CLAUDE.md` instruction requiring future meaningful repo changes and validation passes to be logged in the handoff file.

## 2026-04-26 (Claude)

- Diagnosed and fixed Exercise Library "Create"/"+" buttons being non-interactable when the app is opened from anything other than `localhost`:
  - Root cause: Next.js 16 dev mode blocks client JS/HMR/RSC chunks for non-`localhost` origins. The Exercises page server-rendered with both create buttons disabled (their `disabled` rule depends on equipment/muscle reference data, which lives in client state). With chunks blocked, hydration never completed, so the buttons stayed grayed out.
  - Confirmed via dev-server log: `⚠ Blocked cross-origin request to Next.js dev resource /_next/webpack-hmr from "192.168.50.11"`.
  - Verified backend was healthy first: `POST /api/exercises` from the host returned 201 and persisted, ruling out an API issue.
  - Fix: added `allowedDevOrigins: ["192.168.50.11", "100.69.4.50", "pravlab"]` to `next.config.ts` (LAN IP, Tailscale IP, and local hostname respectively, all confirmed by user).
  - Restarted the `app` container so the new config was loaded; `/api/health` returned 200.
  - Created and deleted a `__claude_test` exercise during diagnosis; library is back to empty.
  - Pending user-side verification: reload the Exercises screen on the LAN-IP URL and confirm the buttons are now interactable.
- Renamed `CLAUDE_HANDOFF.md` → `HANDOFF.md` and split the 2026-04-26 section into `(Codex)` and `(Claude)` subsections so authorship is explicit going forward. Updated `CLAUDE.md` to point at the new filename and to instruct future agents to tag their entries.
- User confirmed the dev-server fix worked: page loads, both create buttons are interactable, created and deleted an exercise successfully end-to-end.
- Known benign dev-mode warning: a hydration-mismatch overlay appears in the user's browser pointing at `src/app/exercise-library-app.tsx:322` (the `<div className="space-y-4">` inside `ExerciseList`). The diff shows `data-protonpass-form=""` injected by the Proton Pass browser extension before React hydrates. This is not an app bug, only appears in dev, and does not affect functionality. Do not "fix" it with `suppressHydrationWarning` on that div — it would mask real hydration bugs we'll want to catch once the live workout screen lands. Recommended workaround for the user is to disable Proton Pass on the NextRep tab.
- Removed the redundant inline "Create" pill button from the exercises list in `src/app/exercise-library-app.tsx`. The list now shows just the "All Exercises" / "X shown" count label above the list; the header `+` button (which is outside the scroll area and stays reachable from any scroll position) is now the sole always-on entry point for creating exercises. The empty-state CTA is unchanged. Decision rationale: with one screen of exercises both buttons looked redundant, but the inline pill was inside the scrolling area so it would disappear once the library got long. Header `+` is the more durable choice. `npm run lint` passed.

## 2026-04-26 (Codex)

- Read the renamed `HANDOFF.md` after the user returned from Claude and confirmed the active shared handoff file is now `HANDOFF.md`, not `CLAUDE_HANDOFF.md`.
- Confirmed `CLAUDE.md` and symlinked `AGENTS.md` now point future agents at `HANDOFF.md` and require author-tagged dated sections.
- Loaded Claude's latest context:
  - `next.config.ts` now sets `allowedDevOrigins` for `192.168.50.11`, `100.69.4.50`, and `pravlab` so dev-mode chunks work from LAN/Tailscale/hostname origins.
  - User verified the create/delete exercise flow works end-to-end through the browser.
  - The Proton Pass hydration warning is known benign dev-only extension injection; do not suppress it in app code.
  - Claude removed the redundant inline Create pill from the Exercise Library list; the header `+` is now the main create entry point, with the empty-state CTA retained.
- No source code was changed in this Codex context-refresh pass beyond this handoff log entry.

## 2026-04-26 (Claude)

- Committed and pushed everything that was sitting in the working tree: Phase 1 reference data, Phase 2 Exercise Library CRUD + UI, the `next.config.ts` dev-server fix, the inline-Create-pill removal, the `AGENTS.md` → `CLAUDE.md` symlink, the v2 planning schema, the ESLint `prototype/**` ignore, and the new `HANDOFF.md` itself.
- One bundled commit (`4b20cd7`, branch `main`) titled "Phase 1 & 2: reference data and Exercise Library CRUD"; staged files explicitly (no `git add -A`) to avoid sweeping anything unintended into the commit.
- Pushed to `git@github.com:CrypticData/nextrep-app.git` `main`. Fast-forward from `eb85ed4` to `4b20cd7`. No force-push, no hooks skipped.
- Logging convention going forward: agents should append a HANDOFF.md entry whenever they commit, push, branch, or otherwise touch git state, not just code, so the log captures repo history alongside file changes. (Updated CLAUDE.md to reflect this.)
- Follow-up commit after the bundled Phase 1+2 push: committed the CLAUDE.md handoff-logging tweak and these HANDOFF.md entries as their own small commit, then pushed. Working tree clean afterward.

## 2026-04-26 (Codex)

- Implemented Phase 3 start/recovery scope:
  - Added Prisma `WorkoutStatus` and `WorkoutSession` mapped to `workout_sessions`.
  - Added migration `20260426130000_add_workout_sessions` with `WorkoutStatus`, `workout_sessions`, and raw partial unique index `one_active_workout`.
  - Added `src/lib/workout-session-api.ts` for snake_case response mapping, UUID validation, active-session lookup, create-or-return-active, and active-session discard.
  - Added `POST /api/workout-sessions`, `GET /api/workout-sessions/active`, and `POST /api/workout-sessions/[id]/discard`.
  - Added shared `AppShell` with route-backed bottom nav and moved Exercise Library to `/exercises`; `/` is now the Workout surface.
  - Added timer-only Workout UI with explicit resume card on refresh, local elapsed timer from `started_at`, empty Phase 4 placeholder, and confirmed discard action. No workout exercises, sets, finish/save, autosync, or minimize/floating-card controls were added.
- Validation completed:
  - `npx prisma validate` passed.
  - `npx prisma migrate dev` applied `20260426130000_add_workout_sessions`.
  - `npx prisma generate` completed.
  - `npx prisma migrate status` reports 2 migrations and DB schema up to date.
  - `npm run lint` passed.
  - `npm run build` passed.
  - Restarted the app container after Prisma generation so dev mode loaded the new `workoutSession` delegate.
- API checks completed:
  - `GET /api/workout-sessions/active` returned `null` with no active session.
  - `POST /api/workout-sessions` created active session `411d6e91-f73b-424d-9494-e7bbb8ad535a` with `201`.
  - Repeated `POST /api/workout-sessions` returned the same active session with `200`.
  - Direct DB insert of a second `active` row failed on unique constraint `one_active_workout`.
  - `GET /api/workout-sessions/active` returned the active session.
  - `POST /api/workout-sessions/411d6e91-f73b-424d-9494-e7bbb8ad535a/discard` returned `204`; repeating it returned `404`.
  - Discarding a direct DB-created `completed` session returned `404`; the completed test row was deleted afterward.
  - Existing Exercise API create/patch/delete flow passed with temporary `__phase3_api_test` row, then cleaned up.
- UI/server checks:
  - `GET /` returned `200` and server-rendered the Workout shell.
  - `GET /exercises` returned `200` and server-rendered the Exercise Library shell with route-backed nav.
  - Browser automation was not run; interaction behavior was covered through API checks and successful build/lint.
- Follow-up after user testing:
  - User confirmed Start Empty Workout and Discard Workout work in the browser.
  - User initially reported the timer looked stopped, then confirmed they could see it running.
  - Adjusted `useElapsedSeconds` in `src/app/workout-app.tsx` to keep explicit elapsed-seconds state updated from an interval callback keyed by `started_at`.
  - Re-ran `npm run lint` and `npm run build`; both passed.

## 2026-04-26 (Claude)

- Reviewed Codex's Phase 3 implementation against the plan in `phases/phase3.md` and the v2 spec. Findings:
  - Schema, migration (including the raw partial unique index), and snake_case JSON match the spec exactly.
  - `createOrReturnActiveWorkoutSession` handles the unique-violation race correctly (catches `P2002` and re-fetches).
  - Discard route validates UUID, returns 400/404/204; only `active` rows can be discarded.
  - `useElapsedSeconds` computes elapsed from `started_at` client-side; no timer ticks persisted (hard-rule compliant).
  - `AppShell` uses Next.js `Link` + `usePathname` for tab routing — App Router idiomatic.
  - Exercise Library refactor cleanly removed its local `BottomNav` and uses the AppShell `action` slot.
  - One UX gap surfaced: Resume card has no Discard button, so stale-session cleanup takes two taps (Resume → live shell → Discard). User chose to leave it for now.
- Committed Phase 3 + the planning doc, pushed to `origin/main`. No code changes from Claude in this pass beyond this log entry.

## 2026-04-26 (Codex)

- Implemented the pre-Phase-4 `phases/phase3.5.md` UI/navigation rework:
  - Updated `AppShell` bottom nav from `Workout + Exercises` to `Workout + Profile`.
  - Added `/profile` with a single-user Profile menu, profile summary, dashboard tiles, and workout-history placeholder/card view-model scaffolding.
  - Moved the Exercise Library mount to `/profile/exercises`; `/exercises` now redirects to `/profile/exercises` for compatibility.
  - Added `/profile/measures` as a placeholder screen reachable from the Profile dashboard.
  - Refactored the Exercise Library list into sticky `ExerciseListControls` and normal-flow `ExerciseResults` so search/filter/count stay pinned inside the existing `AppShell` main scroll container.
- Read local Next 16 docs for App Router pages and navigation before adding the profile routes and client-side dashboard navigation.
- Validation completed:
  - `npm run lint` passed.
  - `npm run build` passed.
  - Running dev stack already serves `http://localhost:3000`.
  - `curl -I` checks returned `200` for `/profile`, `/profile/exercises`, and `/profile/measures`; `/exercises` returned `307` with `location: /profile/exercises`.
- Follow-up scroll fix after user testing:
  - Updated `AppShell` to use constrained `h-dvh`/`overflow-hidden` shell containers, `shrink-0` header/nav, and `min-h-0 flex-1 overflow-y-auto` on `<main>` so the main pane is the actual scroll container for sticky exercise controls.
  - Re-ran `npm run lint` and `npm run build`; both passed.
- Follow-up sticky spacing fix after user testing:
  - Updated `ExerciseListControls` with `-mt-4` and reduced top padding so the sticky controls panel starts directly under the fixed header instead of leaving a shell-padding gap.
  - Re-ran `npm run lint` and `npm run build`; both passed.
- Second sticky spacing fix after user testing:
  - Added optional `mainClassName` to `AppShell` and set Exercise Library to `px-5 pb-6 pt-0`, removing the source top padding from the exercise scroll container instead of relying on negative margin.
  - Removed the `-mt-4` workaround from `ExerciseListControls`; the sticky controls now start from a zero-top-padding main pane.
  - Re-ran `npm run lint` and `npm run build`; both passed.
- Follow-up subpage header change after user feedback:
  - Added `subpage`, `backHref`, and `backLabel` support to `AppShell`.
  - Updated `/profile/exercises` to show a left back button to Profile, centered `Exercises` title, no `NextRep` eyebrow, and the existing create action on the right.
  - Updated `/profile/measures` to use the same subpage header pattern.
  - Re-ran `npm run lint` and `npm run build`; both passed.
- Started remaining Pre Phase 4A exercise-type work:
  - Added Prisma `ExerciseType` enum and `Exercise.exerciseType @default(weight_reps) @map("exercise_type")`.
  - Added migration `20260426220000_add_exercise_type`; it adds `exercise_type` as `NOT NULL DEFAULT 'weight_reps'`, preserving existing user-created exercises and backfilling them as Weight & Reps.
  - Applied the migration with `npx prisma migrate dev` and regenerated Prisma client.
  - Updated Exercise API validation, create/update writes, and response mapping for snake_case `exercise_type`; omitted `exercise_type` defaults to `weight_reps`.
  - Added Exercise Type selector to create/edit exercise UI and displays Type in exercise detail.
  - Restarted the app container after Prisma generation.
  - Validation: `npx prisma validate`, `npx prisma migrate status`, `npm run lint`, and `npm run build` passed.
  - DB check confirmed existing rows were preserved: `select exercise_type, count(*) from exercises group by exercise_type` returned `weight_reps | 17`.
  - API check confirmed `GET /api/exercises` includes `exercise_type: "weight_reps"` for existing exercises.
- Follow-up immutable exercise type rule after user correction:
  - Edit Exercise now shows Exercise Type as read-only with copy that it cannot be changed after creation.
  - `PATCH /api/exercises/[id]` now reads the existing row in a transaction and rejects any `exercise_type` change with `400`.
  - Re-ran `npm run lint` and `npm run build`; both passed.
  - API check: trying to PATCH existing `Chest Fly` from `weight_reps` to `bodyweight_reps` returned `400 {"error":"exercise_type cannot be changed after creation."}`.
- Follow-up workout timer responsiveness fix:
  - Updated `useElapsedSeconds` in `src/app/workout-app.tsx` to reset immediately for each `started_at`, run an immediate update before the first interval tick, tick every 250ms, and clamp small future `started_at` values to the current client time so client/server clock skew cannot make a just-started timer appear frozen.
  - Re-ran `npm run lint` and `npm run build`; both passed.
  - Restarted the app container so the running dev server serves the updated timer code.
- Follow-up workout timer refresh fix:
  - Added `server_now` to workout session API responses and changed the client timer to calculate elapsed time from a stable server-time anchor plus client monotonic elapsed time.
  - This replaces the prior client-clock clamp, which could make the timer reset on every refresh if the server clock was ahead of the browser clock.
  - Re-ran `npm run lint` and `npm run build`; both passed.
  - Restarted the app container.
  - Verified `POST /api/workout-sessions` returns `server_now`; created temporary session `da7ab4a3-62e2-48eb-9115-f6a26bbae9c7` for the check and discarded it with `204`.
- Caveats:
  - `phases/phase3.5.md` was already untracked user input and remains untracked.
  - Profile edit/settings/metrics/calendar remain placeholders by design; no backend profile or workout history data was added.

## 2026-04-27 (Codex)

- Preparing the completed Phase 3.5 / Pre Phase 4A changes for git:
  - Profile navigation/subpage UI is implemented and includes the remembered submenu header pattern: left back button, centered title, optional right action, and no `NextRep` eyebrow.
  - Exercise Library lives under `/profile/exercises`; `/exercises` redirects there.
  - Exercise list search/filter/count controls are sticky inside the corrected `AppShell` scroll container.
  - Added `ExerciseType` and `exercise_type` with default/backfill `weight_reps`; existing user-created exercises were preserved.
  - Exercise type is selectable only on create; edit UI is read-only and API rejects type changes.
  - Workout timer now uses `server_now` from session responses to avoid delayed starts and refresh resets under client/server clock skew.
- Validation already completed before commit:
  - `npx prisma validate` passed.
  - `npx prisma migrate dev` applied `20260426220000_add_exercise_type`.
  - `npx prisma generate` completed.
  - `npx prisma migrate status` reported DB schema up to date.
  - `npm run lint` passed after each follow-up.
  - `npm run build` passed after each follow-up.
  - API checks confirmed existing exercises report `exercise_type: "weight_reps"`, changing an existing exercise type returns `400`, and workout session responses include `server_now`.
- Including `phases/phase3.5.md` and `phases/prephase4.md` in git with this push so future agents can see the planning inputs.

## Current Known Git Status

- Branch: `main`, tracking `origin/main`.
- Phase 1, Phase 2, and Phase 3 are all committed and pushed.
- `phases/phase3.md` is now in git as part of the Phase 3 push.
- Working tree is being committed and pushed with Phase 3.5 / Pre Phase 4A changes.
