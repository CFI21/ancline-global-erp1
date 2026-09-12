#!/usr/bin/env sh
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
echo "Applying Prisma migrations..."
npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma
echo "Migration complete."
