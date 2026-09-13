# ANCLINE LIVE Phase 4 — Authorization, Audit, Tests & Staging Hardening

## Added
- Backend scope enforcement on Booking, Document and Finance endpoints
- Customer / Agent / Branch / Global booking scope foundation
- Finance-only access guard
- Internal-only write protection
- Audit service for sensitive mutations
- Document storage provider adapter contract
- Automated authorization/workflow tests
- Dockerfiles for API and Web
- Staging docker-compose package
- Nginx staging reverse proxy
- Security response headers
- CI build + test workflow

## Required before public staging
- Replace development JWT login with real OIDC/SSO
- Configure a managed PostgreSQL database
- Configure managed Redis
- Configure real S3/Azure/GCS object storage
- Configure TLS certificates and DNS
- Add rate limiting and WAF/CDN
- Add centralized logging, tracing and alerting
- Add secrets manager
- Run DB migrations and seed safe UAT data
- Execute portal isolation/UAT tests
- Complete backup + restore drill

## Required before production
- Penetration testing
- Vulnerability scanning
- Least-privilege DB/service accounts
- Immutable audit retention
- Finance maker-checker/UAT
- DG/OOG block tests
- Disaster recovery test
- Data retention/privacy review
- Signed operational runbook and release checklist
