# ANCLINE Secrets Policy

- No production secrets in Git, images, compose files, tickets or chat transcripts.
- Use a managed secret store in staging and production.
- Rotate credentials after suspected exposure.
- Separate credentials by environment.
- Application services receive only the minimum secrets needed.
- Database credentials must be non-superuser service accounts.
- OIDC client secrets are never exposed to the browser.
- Object-storage write credentials remain server-side.
