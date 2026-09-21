# ANCLINE Free-Tier Deployment Architecture

## Principle

Render is the runtime, not the build farm.

The release path is:

1. GitHub Actions validates source.
2. GitHub Actions builds immutable API/Web OCI images.
3. Images are pushed to GHCR with both `latest` and `sha-<commit>` tags.
4. Render image services pull those images and run them on the free tier.
5. Release validation compares the Git commit, GHCR image metadata, and Render image SHA.
6. The legacy Render source-build web service is non-gating while free Render build minutes are exhausted.

This avoids waiting for Render build-pipeline minutes and avoids rebuilding the same source twice.

## Web-to-API runtime binding

The browser uses the same-origin `/api-proxy` route by default.
The Next.js server forwards requests to `ANCLINE_API_URL` at runtime.

Benefits:
- one web image can be reused across staging and later production;
- no browser CORS dependency for normal ERP calls;
- no environment URL baked into the client bundle;
- API target can change without rebuilding the web image.

## CI minute control

Only `.github/workflows/container-images.yml` builds OCI images.
The older separate API and Web image workflows are retired to prevent duplicate builds.

The workflow detects changed paths and rebuilds only affected images unless manually dispatched.

## Release gate

A Render source-build deployment is no longer a release requirement.
The required deployment evidence is:
- GitHub CI success;
- GHCR image built from the target commit;
- Render image service running the matching image;
- API/Web integration smoke test;
- transactional UAT;
- backup/recovery evidence.

This architecture is for staging/release-candidate validation. It does not by itself certify durable production hosting or external production provider connectivity.
