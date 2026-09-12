# ANCLINE Repository Setup

Render web services require a Git repository that Render can clone.

Recommended repository name:
`ancline-worldwide-erp`

## Initial repository
From the project root:

```bash
git init
git add .
git commit -m "ANCLINE LIVE Phase 7 staging handoff"
git branch -M main
git remote add origin <YOUR_PRIVATE_GIT_REPOSITORY_URL>
git push -u origin main
```

Do not commit `.env`, credentials, database URLs, OIDC secrets, storage keys, or production certificates.

## Branch policy
- `main`: releasable
- `develop`: integration
- feature branches: reviewed before merge

Protect `main` and require CI before merge.
