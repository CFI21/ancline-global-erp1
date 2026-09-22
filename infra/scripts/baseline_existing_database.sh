#!/usr/bin/env sh
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${ALLOW_BASELINE_EXISTING_DB:?Set ALLOW_BASELINE_EXISTING_DB=true only after schema equivalence is independently verified}"
[ "$ALLOW_BASELINE_EXISTING_DB" = "true" ] || { echo "Refusing baseline without ALLOW_BASELINE_EXISTING_DB=true"; exit 1; }
migration="20260922_production_baseline"
echo "Marking $migration applied; this does not execute its SQL."
npx prisma migrate resolve --schema=packages/db/prisma/schema.prisma --applied "$migration"
npx prisma migrate status --schema=packages/db/prisma/schema.prisma
