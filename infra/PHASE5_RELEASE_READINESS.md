# ANCLINE LIVE Phase 5 — Release Readiness

## Added
- Managed OIDC integration structure
- OIDC claim-to-ANCLINE-role mapping
- Readiness and metrics endpoints
- Structured request logging with request IDs
- Stronger CSP/security headers
- Secret-management policy and templates
- PostgreSQL backup and restore scripts
- Smoke-test script
- Healthchecked staging container stack
- Release package structural validator
- CI release validation

## Still required before public staging
- Select and configure actual OIDC provider
- Provision managed PostgreSQL / Redis
- Provision object storage
- Configure staging DNS + TLS
- Configure central logs and alerts
- Apply DB migrations to staging
- Seed safe UAT data
- Perform customer/agent/branch isolation UAT
- Execute backup/restore drill
- Run vulnerability scan

## Still required before production go-live
- Formal UAT sign-off
- Penetration test
- Disaster recovery exercise
- Finance control sign-off
- DG/OOG operational release tests
- Production DNS/TLS
- Production secrets
- Production monitoring/on-call
- Change/release approval
