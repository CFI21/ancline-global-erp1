#!/usr/bin/env sh
set -eu
BASE="${1:-http://localhost:4000}"
: "${CUSTOMER_TOKEN:?CUSTOMER_TOKEN required}"
: "${AGENT_TOKEN:?AGENT_TOKEN required}"

echo "Customer portal query..."
curl -fsS -H "Authorization: Bearer $CUSTOMER_TOKEN" "$BASE/api/portal/bookings" >/tmp/ancline-customer.json

echo "Agent portal query..."
curl -fsS -H "Authorization: Bearer $AGENT_TOKEN" "$BASE/api/portal/bookings" >/tmp/ancline-agent.json

echo "Portal responses captured."
echo "Review /tmp/ancline-customer.json and /tmp/ancline-agent.json for strict isolation."
