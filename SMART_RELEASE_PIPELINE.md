# ANCLINE Smart Release Pipeline

ANCLINE staging releases use GitHub Actions + immutable GHCR images + Render image runtime.

## Release chain

1. Detect Web/API/shared changes.
2. Run targeted source quality gates.
3. Build immutable OCI candidates tagged `sha-<commit>`.
4. Promote only tested candidates to `latest` and `staging-approved-<sha>`.
5. Render runs the promoted images; optional deploy-hook secrets can accelerate deployment.
6. Web and API identify their own embedded build commit.
7. API startup runs transactional UAT with cleanup.
8. API startup creates an encrypted logical staging backup and records only sanitized evidence.
9. A remote GitHub runner verifies API health, API release evidence, Web image identity, Web -> API proxy, and public routes.
10. The run publishes `ANCLINE_SMART_RELEASE_EVIDENCE.json`.

## Component awareness

- Web-only changes: build/promote Web only.
- API/database changes: build/promote API only.
- Shared dependency changes: build/promote both.
- API UAT + backup are required when API changes.
- Web identity is required when Web changes.

## Immutable identity

Immutable candidates:
- `ghcr.io/cfi21/ancline-web:sha-<commit>`
- `ghcr.io/cfi21/ancline-api:sha-<commit>`

`latest` is only a mutable runtime pointer. Release evidence retains the immutable digest.

## Staging runtime controls

The API runtime should have:
- `UAT_RUNNER_ENABLED=true`
- `UAT_RUN_ON_STARTUP=true`
- `FREE_BACKUP_EXPORT_ENABLED=true`
- `FREE_BACKUP_LOG_ON_STARTUP=true`
- `FREE_BACKUP_EXPORT_TOKEN=<secret outside source control>`

Optional GitHub secrets:
- `RENDER_WEB_DEPLOY_HOOK`
- `RENDER_API_DEPLOY_HOOK`

Without deploy hooks, the remote gate waits for Render image auto-deploy.

## Boundary

This is staging release evidence. It is not proof of real production carrier/provider connectivity, production DR/PITR, human handover acceptance, or final production authorization.
