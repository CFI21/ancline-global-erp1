# ANCLINE Automated UAT Runner

Controlled staging-only transaction smoke test.

## Enable
Set `UAT_RUNNER_ENABLED=true` on the API service. The endpoint requires an authenticated `GLOBAL_ADMIN` token.

## Endpoints
- `GET /api/uat/status`
- `POST /api/uat/run` body: `{ "cleanup": true }`

The runner executes a full synthetic transaction chain: customer + agent → rate → booking → confirmation controls → container → document → revenue/cost and P&L → task → maker-checker approval → integration event → notification → audit → portal projection → closeout → final persistence check → cleanup.

Cleanup is enabled by default, so successful UAT does not leave synthetic operational data behind.

## CLI
Run from repository root with Node 18+:

```bash
ANCLINE_API_URL=https://ancline-api-staging.onrender.com node scripts/run-live-uat.mjs
```

Set `UAT_KEEP_DATA=true` only when an operator explicitly wants to inspect generated UAT records after the run.
