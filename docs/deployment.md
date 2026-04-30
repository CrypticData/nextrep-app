# Production Deployment

NextRep ships as a versioned Docker image on GitHub Container Registry (GHCR), pulled by `docker-compose.prod.yml` on the deploy host. The image is private — you authenticate once with a GitHub personal access token (PAT).

The deploy host is expected to be reachable over Tailscale only. There is no auth in the app, so do not expose port 3000 publicly.

## First-time host setup

### 1. Create a GitHub PAT for pulling the image

GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token.

- Scopes: `read:packages` is sufficient.
- Save the token somewhere durable (you will not see it again).

### 2. Log in to GHCR on the deploy host

```sh
echo "<your-PAT>" | docker login ghcr.io -u <your-github-username> --password-stdin
```

Credentials are stored in `~/.docker/config.json` and persist across reboots.

### 3. Place the repo (or just the prod files) on the host

You only need three files to run NextRep on the host:
- `docker-compose.prod.yml`
- `.env` (copied from `.env.production.example` and filled in)
- `docs/backup-restore.md` for reference (optional)

Cloning the full repo is fine too — it just won't be used at runtime.

### 4. Configure environment

```sh
cp .env.production.example .env
# Edit .env and set a strong POSTGRES_PASSWORD.
```

Required values:
- `POSTGRES_USER` — Postgres role.
- `POSTGRES_PASSWORD` — strong, random.
- `POSTGRES_DB` — database name.
- `APP_VERSION` — image tag to run, e.g. `1.0.0`.

### 5. Start the stack

```sh
docker compose -f docker-compose.prod.yml up -d
```

The app container runs `prisma migrate deploy` on boot, then starts Next.js. First boot creates the schema. Subsequent boots are no-ops if no new migrations exist.

### 6. Smoke test

```sh
curl http://localhost:3000/api/health
```

Should return `{"status":"ok",...}`.

## Upgrading to a new version

After a new `vX.Y.Z` tag is pushed and the GitHub Actions release workflow finishes:

```sh
# Bump APP_VERSION in .env to the new tag.
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

The old container stops, the new one starts and applies any new migrations during boot.

**Take a backup before upgrading.** See [`backup-restore.md`](backup-restore.md) — the commands work identically against the prod compose (service name `db` is unchanged).

## Cutting a new release (from the dev machine)

Releasing is two explicit steps: tag, then publish. Tagging by itself does not build or publish anything.

**1. Tag and push (local).**

```sh
# After merging your work to main and bumping package.json version:
git tag v1.0.1
git push origin v1.0.1
```

**2. Publish the image (manual workflow run).**

Either:

- **GitHub UI**: Actions → Release → "Run workflow" → pick `v1.0.1` from the ref dropdown → Run workflow.
- **Or CLI**: `gh workflow run release.yml --ref v1.0.1`.

The workflow at `.github/workflows/release.yml` builds `Dockerfile.prod` and pushes `ghcr.io/crypticdata/nextrep-app:1.0.1` plus `:latest`. Then upgrade the host as described above.
