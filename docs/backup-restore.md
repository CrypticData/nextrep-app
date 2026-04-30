# PostgreSQL Backup and Restore

NextRep is a single-user, self-hosted app. Backups are local files made from the PostgreSQL container with `pg_dump`. Keep backup files outside git-tracked paths; this repo ignores `backups/` for convenience.

These commands work the same against the dev `docker-compose.yml` and the prod `docker-compose.prod.yml` — the service name `db` is unchanged. Add `-f docker-compose.prod.yml` to the commands below if you are running the production stack.

These commands assume the default Compose service name `db` and the default database settings from `.env.example`:

```txt
POSTGRES_USER=nextrep
POSTGRES_DB=nextrep
```

If `.env` changes those values, substitute the matching user and database names in the commands below.

## Create a Backup

From the repo root:

```sh
mkdir -p backups
docker compose exec -T db pg_dump \
  -U nextrep \
  -d nextrep \
  --format=custom \
  --no-owner \
  --no-privileges \
  > "backups/nextrep-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

The custom dump format is compact and works with `pg_restore`. It is not meant to be opened as plain SQL.

After the command finishes, confirm the file is non-empty:

```sh
ls -lh backups/
```

## Restore Verification Dry Run

Do not test restores against the real `nextrep` database. Restore into a disposable database first:

```sh
docker compose exec -T db createdb -U nextrep nextrep_restore_check
docker compose exec -T db pg_restore \
  -U nextrep \
  -d nextrep_restore_check \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  < backups/YOUR_BACKUP_FILE.dump
docker compose exec -T db psql \
  -U nextrep \
  -d nextrep_restore_check \
  -c "select count(*) as workout_sessions from workout_sessions;"
docker compose exec -T db dropdb -U nextrep nextrep_restore_check
```

The `select count(*)` query should return successfully. A zero count is valid for a fresh install; the important check is that PostgreSQL can read the dump and restore the schema/data.

## Restore the Real Database

Restoring the real database is destructive. Stop the app first so it does not write during restore:

```sh
docker compose stop app
docker compose exec -T db dropdb -U nextrep --if-exists nextrep
docker compose exec -T db createdb -U nextrep nextrep
docker compose exec -T db pg_restore \
  -U nextrep \
  -d nextrep \
  --no-owner \
  --no-privileges \
  < backups/YOUR_BACKUP_FILE.dump
docker compose up -d app
```

Then check health:

```sh
curl http://localhost:3000/api/health
```

## Local Server Caveats

- Store important backups outside the repo or sync them to another trusted machine; `backups/` is only a local convenience folder.
- Check disk space before large backups with `df -h`.
- Keep file permissions private if the dump contains personal workout history.
- Compose project names can change container names, but `docker compose exec db ...` works from this repo root.
- If custom database credentials are used, update both backup and restore commands to match `.env`.
- A restore replaces current database contents. Create a fresh backup before restoring an older one.
