# NextRep App

Personal workout tracker — single-user, Tailscale-only, always-on Docker.

**Stack:** Next.js (App Router) + TypeScript + Tailwind + Prisma + PostgreSQL.

## Run it

Requires Docker + Docker Compose.

```sh
git clone git@github.com:CrypticData/nextrep-app.git
cd nextrep-app
cp .env.example .env
docker compose up
```

Then open http://localhost:3000 — and http://localhost:3000/api/health to confirm the database is reachable.

### Local dev (faster hot reload)

If you'd rather run the app outside Docker, keep just the database container up and run Next.js locally:

```sh
docker compose up -d db
npm install
npx prisma generate
npm run dev
```

## Where things live

- `nextrep-app_planning_schema.md` — engineering spec for the whole product. Authoritative for data model, validation rules, API shape, and MVP scope.
- `CLAUDE.md` — repo-specific rules and stack facts for AI coding assistants.
- `prototype/` — visual reference only (HTML + JSX), not production code.
