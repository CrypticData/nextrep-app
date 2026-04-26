# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

NextRep is a single-user, self-hosted workout tracker. Accessed from a phone browser, optimized for live workout logging at the gym. Always-on Docker deployment on a personal server, accessed via Tailscale only — no public internet exposure, no auth in MVP.

**No social features ever** — no sharing, profiles, followers, comments, likes, public visibility, or feed.

## Repo state

Phase 0 complete. The repo is now a runnable Next.js app with Prisma wired up to a Postgres container. No tables yet — Phase 1 adds reference data (equipment types, muscle groups, app settings).

Current top-level files:

- `nextrep-app_planning_schema.md` — ~2900-line engineering spec (authoritative for everything below)
- `prototype/` — visual reference only (HTML prototype + iOS frame, hardcoded mock data)
- `src/app/`, `src/lib/`, `prisma/`, `Dockerfile`, `docker-compose.yml`, `.env.example` — the actual app
- `README.md`, `CLAUDE.md`, `AGENTS.md` (Next 16 breaking-change notes from `create-next-app`)

## Common commands

```sh
docker compose up                # full stack (app + db) — visit localhost:3000
docker compose up -d db          # just the database (faster local dev)
npm run dev                      # next dev (after `docker compose up -d db`)
npm run build                    # production build
npm run lint                     # ESLint
npx prisma generate              # regenerate Prisma client after schema.prisma changes
npx prisma migrate dev --name X  # create and apply a new migration
```

The health endpoint at `/api/health` reports whether the app can reach the database — useful sanity check after any infra change.

## Stack (locked in)

- **Framework:** Next.js 16 (App Router) + TypeScript, strict mode. React 19. **Note:** Next 16 has breaking changes from Next 15 — see `AGENTS.md` and `node_modules/next/dist/docs/` before assuming older patterns still apply.
- **UI:** Tailwind CSS v4 (PostCSS plugin), mobile-first, dark-theme-first
- **ORM:** Prisma 7 — uses the new `prisma-client` generator (not `prisma-client-js`); client is generated to `src/generated/prisma` and imported as `@/generated/prisma`. Config lives in `prisma.config.ts` (not legacy `package.json#prisma`). `.env` is loaded via `dotenv/config` in that file.
- **Database:** PostgreSQL 17 (use `gen_random_uuid()` from `pgcrypto` for UUID PKs per schema §4.1)
- **Deployment:** Docker Compose, 2 services (`db`, `app`). `db` host is `db` inside compose, `localhost` outside.

The planning schema's §2 chapter recommends React+Vite+FastAPI; that recommendation is **superseded**. Schema §3–§9 (data model, behavior, API) remain authoritative.

## Authoritative spec — `nextrep-app_planning_schema.md`

Read the relevant section **before** suggesting any change to data model, validation, or product behavior:

| Section | Topic |
|---|---|
| §1.3 / §1.4 / §11 | MVP scope vs. post-MVP (routines, rest timer, Previous column, analytics, variants are post-MVP) |
| §3 | Domain concepts (workout session, workout exercise, workout set, snapshots) |
| §4 | PostgreSQL DDL — translate to Prisma schema preserving constraints |
| §5 | Set rules (`row_index` vs `set_number`, set types, recorded set rule, weight unit conversion, RPE) |
| §6 | Live workout behavior (timer, autosync debounce 300–600ms, minimize/floating card) |
| §7 | Finish + Save Workout flow with validation |
| §9 | REST API shape — endpoints + request/response examples |
| §12 | Phased build order (Phases 0–14) |
| §14 | 22-item MVP completion checklist |
| §15 | Hard implementation rules (see below) |

## Hard rules (schema §15) — do not violate

- **Checkmark is not a save filter.** Sets save when `reps >= 1`, regardless of checked state. The checkmark is a visual progress indicator only.
- **Don't store timer ticks.** Persist `started_at` / `ended_at` only; compute `elapsed = now - started_at` on the client.
- **Don't store completed workouts as JSON blobs.** Use relational rows for `workout_session_exercises` and `workout_sets` so future analytics work.
- **One active workout at a time** — enforce server-side via the partial unique index (`WHERE status = 'active'`), not just frontend state.
- **Backend must validate finish/edit.** Frontend validation is not sufficient.
- **Drag handle only** for exercise reordering — never make the whole exercise card draggable (mobile drag fights scroll).
- **`row_index` ≠ `set_number`.** Warmup and drop-set rows do not consume set numbers; numbering recalculates on add/delete/type-change.
- **Snapshot on add.** When an exercise is added to a workout, snapshot `exercise_name`, `equipment_name`, `primary_muscle_group_name` so saved history stays readable after the source exercise is edited or hard-deleted.

## Prototype is reference, not source

`prototype/nextrep-app.html` and `prototype/ios-frame.jsx` are visual/interaction references for layout, dark theme, set row UI, bottom nav placement, and the live workout screen. Do not lift code directly. Specifically ignore:

- Hardcoded arrays: `chartData`, `exercises`, `workoutLog`, `routines`, `catColors`, `EX_HISTORY`, `FOLDERS` — **not seed data**. Users create their own exercises in MVP; routines and folders are post-MVP.
- Tweak panel and `window.postMessage` edit-mode integration — prototype scaffolding only.
- Any social UI (avatars, likes, comments, follower counts) and the `category` field on exercises (replaced by `equipment_type` + `muscle_group` references).
- Duplicate-exercise menu item — the product direction is variants (post-MVP), not duplication.

## Conventions (apply once scaffolded)

- App Router only (no Pages Router). API routes under `src/app/api/`.
- Server-side validation lives in route handlers, not in client code alone.
- Use a Prisma client singleton (the standard `globalThis` pattern) to avoid connection-pool exhaustion in dev.
- TypeScript strict mode on. Avoid `any`; use Prisma's generated types end-to-end.
- No auth/multi-user code — schema is single-user (omit `user_id` columns until/unless auth is intentionally added).

## Dev environment

If `next dev` fails with `ENOSPC` (inotify watcher limit on this Linux host):

```sh
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```
