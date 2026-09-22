# ANCLINE Smart Release Hardened v4

This free-tier staging release pipeline removes Render source-build minutes from the critical path and adds recovery controls.

## Hardening controls

1. **Component-aware build**: only Web/API components affected by a commit are built.
2. **Immutable candidates**: GHCR tags `sha-<commit>` are never mutated.
3. **Baseline capture**: the currently running Web/API digests and runtime commits are recorded before promotion.
4. **Two-phase promotion**:
   - candidate is moved to `latest` only after source quality passes;
   - `staging-approved-current` is updated only after the remote gate succeeds.
5. **Approved digest registry**: every successful release stores a JSON registry artifact with approved digests and runtime identities.
6. **Automated transactional UAT**: API changes require the 20-step cleanup-enabled UAT to pass.
7. **Off-platform backup**: the API creates a hybrid-encrypted logical staging backup envelope. GitHub Actions downloads the ciphertext and retains it as an Actions artifact outside Render.
8. **Private recovery key stays outside GitHub/Render**: only the RSA public key is committed. The private key is kept separately by the operator.
9. **Remote Web/API gate**: direct API health, Web identity, Web→API proxy and public routes must pass.
10. **Automatic rollback**: if the remote gate fails after promotion, the previous GHCR digests are retagged to `latest`, Render rollback hooks are triggered, and runtime recovery is verified.
11. **Release evidence v2**: the final artifact records baseline, candidate, runtime, UAT, backup, digest registry and recovery status.

## Off-platform encryption

- Logical DB snapshot is gzip-compressed.
- A random AES-256 key encrypts the backup with AES-GCM.
- The AES key is wrapped by RSA-OAEP-SHA256 using `apps/api/config/offplatform-backup-public.pem`.
- GitHub stores only the encrypted envelope artifact.
- Recovery requires the separately held private key and `tools/restore_offplatform_backup.py`.

Public key SHA-256:
`dec28b0907a1205a45d1880da7af72669af450992b0c4770fb88ac8dc8b61198`

## Boundary

This is free staging/UAT hardening. It does not turn the free Render database into durable production infrastructure and does not prove live carrier/compliance/provider production connectivity.
