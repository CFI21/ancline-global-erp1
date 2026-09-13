#!/usr/bin/env sh
set -eu
BASE="${1:-https://api-staging.ancline.net}"
echo "Checking API readiness..."
curl -fsS "$BASE/api/observability/ready"
echo
echo "Checking staging diagnostics..."
curl -fsS "$BASE/api/diagnostics/staging-readiness"
echo
echo "POST-DEPLOY CHECK COMPLETE"
