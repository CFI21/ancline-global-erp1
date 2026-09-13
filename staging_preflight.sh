#!/usr/bin/env sh
set -eu

required="DATABASE_URL REDIS_URL OIDC_ISSUER OIDC_CLIENT_ID OIDC_CLIENT_SECRET OBJECT_STORAGE_BUCKET OBJECT_STORAGE_REGION CORS_ORIGINS"
missing=""
for name in $required; do
  eval value="\${$name:-}"
  if [ -z "$value" ]; then
    missing="$missing $name"
  fi
done

if [ -n "$missing" ]; then
  echo "PRE-FLIGHT FAILED. Missing:$missing"
  exit 1
fi

echo "Environment variables: PASS"
echo "Running Prisma generate..."
npm run db:generate
echo "Running tests..."
npm run test
echo "Building applications..."
npm run build
echo "STAGING PRE-FLIGHT: PASS"
