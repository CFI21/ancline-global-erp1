#!/usr/bin/env sh
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
echo "Checking production Prisma migration status..."
npx prisma migrate status --schema=packages/db/prisma/schema.prisma
echo "Applying committed production migrations..."
npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma
echo "Production migration deploy complete."
