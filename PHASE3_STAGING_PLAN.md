# ANCLINE LIVE Phase 3 — Security, Portals & Staging Foundation

## Added
- JWT development authentication
- Role guard and scope helper
- Customer and agent portal endpoints
- Customer and agent portal UI shells
- Document/object-storage adapter contract
- Branch/UserAccount database models
- CI build workflow
- Staging environment template

## Before real staging deployment
1. Replace development login with managed OIDC/SSO.
2. Create managed PostgreSQL and Redis.
3. Configure S3-compatible object storage.
4. Add backend row-scope checks to every sensitive endpoint.
5. Add audit middleware for mutations.
6. Configure DNS/TLS for staging subdomains.
7. Run schema migration in staging.
8. Seed only non-sensitive UAT data.
9. Execute customer/agent isolation tests.
10. Enable centralized logs, metrics and alerts.

## Security invariant
Frontend hiding is never considered authorization. Every protected read/write must be scope-checked in the API.
