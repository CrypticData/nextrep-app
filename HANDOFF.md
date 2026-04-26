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

## Current Known Git Status

- `AGENTS.md` has a type change because it is now a symlink to `CLAUDE.md`.
- `CLAUDE.md` has instruction updates, including v2 planning-schema guidance and the handoff-logging requirement (now pointing at `HANDOFF.md`).
- `HANDOFF.md` replaces the earlier `CLAUDE_HANDOFF.md`; both Codex and Claude write here, tagging dated sections with their author.
- Latest Codex update only added the context-refresh note above to `HANDOFF.md`.
- `eslint.config.mjs`, `prisma/schema.prisma`, `prisma/migrations/`, and the reference/settings API route directories contain Phase 1 work.
- `src/app/api/exercises/`, `src/lib/exercise-api.ts`, `src/app/exercise-library-app.tsx`, `src/app/page.tsx`, and `src/app/layout.tsx` contain Phase 2 work.
- `next.config.ts` now sets `allowedDevOrigins` for the LAN IP, Tailscale IP, and `pravlab` hostname (dev-server fix).
- `workout_app_planning_schema_v2.md` is still untracked and was not modified, but is now referenced as authoritative by `CLAUDE.md`.
