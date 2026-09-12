#!/usr/bin/env sh
set -eu
BASE="${1:-http://localhost:4000}"
curl -fsS "$BASE/api/health" >/dev/null || curl -fsS "$BASE/health" >/dev/null
curl -fsS "$BASE/api/observability/ready" >/dev/null
echo "Smoke tests passed"
