# ANCLINE LIVE Deployment Checklist

## Required before staging
- Managed PostgreSQL
- Managed Redis
- OIDC / SSO provider
- Secrets manager
- Object storage for documents
- HTTPS / DNS for ancline.net subdomains
- CI/CD pipeline
- Database migrations in CI
- Central logging / metrics / alerting
- Backups + restore test
- Audit retention policy
- Role / row-level authorization
- Rate limiting
- WAF / CDN
- Staging environment

## Required before production go-live
- UAT for core transaction flow
- Penetration / vulnerability testing
- Finance maker-checker validation
- Payment / bank-change controls
- Customer and agent scope tests
- DG/OOG release-block tests
- Job close / WIP / accrual tests
- Disaster recovery test
- Data protection / retention review
- Operational runbook
- Support ownership and escalation
