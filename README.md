# NextRep

A single-user, self-hosted workout tracker built for live logging on a phone at the gym.

Phone-first UI, dark theme, big tap targets. Custom exercises, live sets with weight/reps/RPE, autosaving live workouts you can minimize between sets, post-workout edit and saved-workout history. Designed to run on a personal server and reach over Tailscale — no public internet exposure, no auth, no social features.

**Status:** v1.0 shipped — see the [latest release](https://github.com/CrypticData/nextrep-app/releases/latest).

**Stack:** Next.js 16 (App Router) + TypeScript · Tailwind v4 · Prisma 7 · PostgreSQL 17 · Docker Compose.

## Run it locally (development)

Requires Docker + Docker Compose.

```sh
git clone git@github.com:CrypticData/nextrep-app.git
cd nextrep-app
cp .env.example .env
docker compose up
```

Open http://localhost:3000 — and http://localhost:3000/api/health to confirm the database is reachable.

### Faster hot reload (DB in Docker, Next.js on host)

```sh
docker compose up -d db
npm install
npx prisma generate
npm run dev
```

## Run it on a server (production)

Production runs from a versioned Docker image published to GitHub Container Registry, pulled by `docker-compose.prod.yml`. Full first-time setup and upgrade steps are in [`docs/deployment.md`](docs/deployment.md).

Quick version:

```sh
docker login ghcr.io                          # one-time, with a GitHub PAT (read:packages)
cp .env.production.example .env               # set a strong POSTGRES_PASSWORD
docker compose -f docker-compose.prod.yml up -d
```

Releases are cut by tagging `vX.Y.Z` and manually triggering the [Release workflow](.github/workflows/release.yml) — tags don't auto-publish.

## Backups

PostgreSQL-native dumps from the Compose `db` service. The backup and restore runbook lives in [`docs/backup-restore.md`](docs/backup-restore.md) and works against both the dev and prod stacks.

## Repo layout

- `src/app/` — Next.js App Router pages and API routes.
- `prisma/` — schema and migrations. Custom Postgres constraints live in raw SQL inside the migration files.
- `Dockerfile` + `docker-compose.yml` — local development.
- `Dockerfile.prod` + `docker-compose.prod.yml` — production deploy on a server.
- `docs/` — deployment and backup runbooks.
- `workout_app_planning_schema_v2.md` — authoritative engineering spec (data model, validation rules, REST shape, MVP scope).
- `prototype/` — visual reference only (HTML + JSX). Not production code.
