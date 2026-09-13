#!/usr/bin/env sh
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
OUT="${1:-ancline-backup-$(date +%Y%m%d-%H%M%S).dump}"
pg_dump "$DATABASE_URL" --format=custom --file="$OUT"
echo "Backup written to $OUT"
