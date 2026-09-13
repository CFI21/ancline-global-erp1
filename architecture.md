# ANCLINE Production Architecture — Phase 1

## Applications
- Internal ERP: erp.ancline.net
- Global Control Tower: control.ancline.net
- Customer Portal: portal.ancline.net
- Agent Portal: agent.ancline.net
- API: api.ancline.net

## Security model
- Backend-enforced role and record scope
- Global / region / country / branch scopes
- Producing-agent ownership
- Customer-only portal access
- Maker-checker approvals
- No deletion of posted finance transactions
- Immutable audit-event pattern

## Deployment recommendation
Start with:
- Next.js web app
- NestJS API
- PostgreSQL
- Redis
- Object storage for documents
- Managed OIDC provider
- Reverse proxy / CDN
- Separate development, staging, production environments
