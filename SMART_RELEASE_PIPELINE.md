# ANCLINE Smart Release Hardened

ANCLINE staging releases use GitHub Actions, immutable GHCR images, Render image runtime, transactional UAT, encrypted off-platform backup, a persistent approved-digest registry, and rollback recovery.

## Release chain

1. Detect Web/API/shared changes.
2. Load the trusted approved baseline from the `release-registry` branch.
3. Refuse release if GHCR `latest` pointers or live runtime identities drift from that approved baseline.
4. Run targeted source quality gates.
5. Build immutable OCI candidates tagged `sha-<commit>`.
6. Promote candidate images to `latest` only after quality succeeds.
7. Deploy the changed image-backed Render services.
8. Require embedded Web/API build identities to match the candidate commit.
9. Run the 20-step transactional API UAT with cleanup.
10. Create an encrypted logical staging backup using RSA-OAEP-SHA256 + AES-256-GCM.
11. Copy the encrypted backup envelope to a GitHub Actions artifact, outside Render.
12. Verify Web -> API proxy and public Web routes.
13. Register approved immutable digests and persist the new baseline to the `release-registry` branch.
14. Publish hardened release evidence.
15. If the remote gate fails after promotion, restore the previously approved image digests and verify runtime recovery.

## Approved digest registry

The durable registry is:

`release-registry:approved-digests.json`

It stores the current approved immutable Web/API digest, commit, immutable image tag, approved tag, and recent approval history. Rollback uses this trusted baseline instead of trusting whatever happens to be tagged `latest`.

## Off-platform backup

The API creates a staging-only logical backup and encrypts it with a random AES-256-GCM data key. That AES key is wrapped with the RSA public key stored at:

`apps/api/config/offplatform-backup-public.pem`

The encrypted envelope is uploaded by GitHub Actions and retained outside Render. The RSA private recovery key must remain offline and must never be committed to GitHub or stored in Render.

## Render deployment control

Render image-backed services do **not** automatically redeploy merely because a registry tag such as `latest` changes. For fully unattended deploy and rollback, configure these GitHub Actions secrets from the Render service deploy-hook URLs:

- `RENDER_WEB_DEPLOY_HOOK`
- `RENDER_API_DEPLOY_HOOK`

Without those secrets, the pipeline can build, promote, register, and prepare rollback automatically, but a Render deploy still needs an operator/API trigger. Runtime identity gates prevent the release from being falsely approved before the correct image is actually running.

## Failure recovery

On a failed post-promotion remote gate:

- candidate approval is denied;
- the previous registry-approved GHCR digest is retagged to `latest`;
- configured Render deploy hooks trigger rollback deployment;
- Web/API build identities and Web -> API proxy are rechecked;
- a failure-recovery evidence artifact is retained.

## Boundary

This is free-tier staging release control. It is not evidence of real production carrier/provider connectivity, managed production PITR/DR, human handover acceptance, or final production authorization.


## Validated failure-recovery drill

A controlled staging rollback drill intentionally failed the post-promotion remote gate on run `35701583300`.

The recovery job:
- restored the registry-approved Web digest `sha256:68c9b55ed326026f55f6144a2c1d65e65e0eaa4e5393eb537e40ef71d85d4d91` to `ghcr.io/cfi21/ancline-web:latest`;
- restored the registry-approved API digest `sha256:0d49b0b661f343db2ba70ffc7697f6001e76072573dd7a6fd74ea4728e36c8c7` to `ghcr.io/cfi21/ancline-api:latest`;
- verified the already-approved Web/API runtime identities and Web -> API proxy;
- published `ANCLINE_FAILURE_RECOVERY_EVIDENCE_V1` with recovery status PASS.

Because Render deploy-hook secrets are not configured, this drill proves automatic approved-digest pointer rollback and runtime recovery while the live runtime remained on the approved release. A future drill with deploy hooks configured is required to prove fully unattended Render runtime rollback after a bad candidate has actually been deployed.
