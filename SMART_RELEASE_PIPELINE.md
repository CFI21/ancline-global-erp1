# ANCLINE Smart Release Hardened

ANCLINE staging releases use GitHub Actions, immutable GHCR images, authenticated Render API deployment, transactional UAT, encrypted off-platform backup, a persistent approved-digest registry, and automatic rollback recovery.

## Release chain

1. Detect Web/API/shared changes.
2. Validate the single `RENDER_API_KEY` against the exact ANCLINE Web and API service IDs.
3. Load the trusted approved baseline from the `release-registry` branch and require the live Web/API build identities to match it.
4. Run targeted source quality gates.
5. Build immutable OCI candidates tagged `sha-<commit>`.
6. Deploy the exact immutable candidate images to the changed Render services through the authenticated Render API.
7. Require embedded Web/API build identities to match the candidate commit.
8. Run the 20-step transactional API UAT with cleanup.
9. Require encrypted staging backup evidence and copy the encrypted envelope to a GitHub Actions artifact outside Render.
10. Verify the Web -> API runtime proxy and public Web routes.
11. For a normal successful release, register the candidate as approved, update `latest`, and persist the new baseline to `release-registry`.
12. If a real post-promotion gate fails, automatically deploy the exact previously approved immutable images through the Render API and verify recovery.
13. For a controlled `[rollback-drill]`, validate the candidate completely, skip approval, automatically restore the approved immutable images, verify recovery, and report the workflow as PASS only when the drill checkpoint and recovery both succeed.

## Approved digest registry

The durable registry is:

`release-registry:approved-digests.json`

It stores the current approved immutable Web/API digest, commit, immutable image tag, approved tag, and recent approval history. Release control and rollback trust this registry rather than a mutable registry tag.

## Render deployment control

The pipeline uses one GitHub Actions secret:

`RENDER_API_KEY`

The Render Web and API service IDs are fixed in the workflow. Candidate deployment and rollback both use the authenticated Render API with exact immutable GHCR image tags. This removes the previous per-service URL-copy workflow and prevents a mutable `latest` tag from being used as the rollback source.

## Failure recovery

After a real post-promotion failure, or during a validated rollback drill:

- candidate approval is denied or skipped;
- the exact registry-approved Web and API immutable images are submitted to Render through the API;
- Render runtime identities are required to return to the approved commits;
- the Web -> API proxy is rechecked;
- a failure-recovery evidence artifact is retained.

A controlled recovery was successfully proven on GitHub Actions run `35727286594`: both candidate images were deployed through the Render API, runtime/UAT/proxy/public-route gates passed, and both services were automatically returned to approved commit `fd5f33c84ef2980aa198fa4631721a754b1dffdb` without manual Render intervention.

## Off-platform backup

The API creates a staging-only logical backup and encrypts it with a random AES-256-GCM data key. That AES key is wrapped with the RSA public key stored at:

`apps/api/config/offplatform-backup-public.pem`

The encrypted envelope is uploaded by GitHub Actions and retained outside Render. The RSA private recovery key must remain offline and must never be committed to GitHub or stored in Render.

## Boundary

This is free-tier staging release control. It is not evidence of real production carrier/provider connectivity, managed production PITR/DR, human handover acceptance, or final production authorization.
