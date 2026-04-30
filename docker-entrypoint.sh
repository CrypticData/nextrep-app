#!/bin/sh
# Production container entrypoint: apply pending migrations, then exec the
# main process. `migrate deploy` is idempotent — it only applies migrations
# that have not already been recorded in `_prisma_migrations`.

set -e

echo "Applying database migrations..."
node ./node_modules/prisma/build/index.js migrate deploy

echo "Starting application..."
exec "$@"
