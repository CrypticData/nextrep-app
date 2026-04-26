# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

NextRep is a single-user, self-hosted workout tracker. Accessed from a phone browser, optimized for live workout logging at the gym. Always-on Docker deployment on a personal server, accessed via Tailscale only — no public internet exposure, no auth in MVP.

**No social features ever** — no sharing, profiles, followers, comments, likes, public visibility, or feed.

## Repo state

The repo is **pre-scaffold**. There is no `package.json`, `tsconfig.json`, Next.js project, Prisma schema, or Docker config yet. The current files are:

- `nextrep-app_planning_schema.md` — ~2900-line engineering spec (authoritative for everything below)
- `index.html` — single-file React 18 prototype (CDN React + Babel standalone, hardcoded mock data) — **visual reference only**
- `ios-frame.jsx` — iOS 26 device frame for previewing the prototype — visual reference only
- `README.md`, `.gitignore`

Build/lint/test commands will exist once the Next.js scaffold lands. Do not invent commands until then.

## Stack (locked in)

- **Framework:** Next.js 15 (App Router) + TypeScript, strict mode
- **UI:** Tailwind CSS, mobile-first, dark-theme-first
- **ORM:** Prisma
- **Database:** PostgreSQL (use `gen_random_uuid()` from `pgcrypto` for UUID PKs per schema §4.1)
- **Deployment:** Docker Compose, 2 services (`app`, `postgres`)

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

`index.html` and `ios-frame.jsx` are visual/interaction references for layout, dark theme, set row UI, bottom nav placement, and the live workout screen. Do not lift code directly. Specifically ignore:

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
