# ANCLINE LIVE — Staging Deployment Runbook

## 1. Provision
Provision:
- PostgreSQL
- Redis
- Object storage
- OIDC application/client
- Web/API hosting
- DNS/TLS

## 2. Secrets
Load secrets through the host's secret manager:
- DATABASE_URL
- REDIS_URL
- OIDC_ISSUER
- OIDC_CLIENT_ID
- OIDC_CLIENT_SECRET
- OBJECT_STORAGE_BUCKET
- OBJECT_STORAGE_REGION
- OBJECT_STORAGE_ACCESS_KEY
- OBJECT_STORAGE_SECRET_KEY
- CORS_ORIGINS

Never commit real values.

## 3. Database
Run:
`infra/scripts/staging_migrate.sh`

## 4. Deploy API
Required readiness:
`GET /api/observability/ready`

Required config diagnostics:
`GET /api/diagnostics/staging-readiness`

## 5. Deploy Web
Set:
`NEXT_PUBLIC_API_URL=https://api-staging.ancline.net`

## 6. DNS
Recommended staging:
- erp-staging.ancline.net
- portal-staging.ancline.net
- agent-staging.ancline.net
- api-staging.ancline.net

## 7. Post-deploy
Run:
`infra/scripts/staging_postdeploy.sh https://api-staging.ancline.net`

## 8. UAT
Execute `infra/UAT_MATRIX.md`.

## 9. Release Gate
Do not promote to production until every mandatory item in `infra/RELEASE_GATE.md` is PASS.
