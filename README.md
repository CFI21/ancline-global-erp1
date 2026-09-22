# ANCLINE WORLDWIDE ERP — Phase 10 Integrated Staging

## Current status

ANCLINE is an integrated Global Forwarding + NVOCC ERP running on the approved free-tier staging release-control architecture.

- Current staging status: **STAGING_APPROVED**
- Runtime release authority: `release-registry:approved-digests.json`
- Deployment control: GitHub Actions + immutable GHCR images + authenticated Render API
- Automatic candidate deployment: enabled
- Transactional UAT with cleanup: enabled
- Encrypted off-platform backup evidence: enabled
- Automatic rollback to the approved immutable image: enabled
- Current operating model: NVOCC + Global Forwarding with separate customer/carrier privacy controls

## Core transaction flow

**Forwarding:** Carrier Rate → ANC Quote → customer terms acceptance → ANC Booking → carrier payer/payment control → carrier submission → Shipment / Consol → Documents / Finance → Closeout.

**NVOCC:** ANC NVOCC rate / commercial control → NVOCC Booking → Shipment / Consol → Documents / Finance → Closeout.

Forwarding direct-booking bypass is intentionally blocked. Customer KYC, ANC customer references, House B/L data and house-party identity are not permitted in normal carrier-outbound payloads.

## Main workspaces

The compact workflow navigation covers Customer & Sales, Rates & Quotes, Booking & Carrier, Shipment Execution, Documents & Compliance, Finance & Closeout, Work & Automation, and Administration/Testing. Dedicated NVOCC and Global Forwarding portals remain available from Quick Access.

## Quality and release evidence

Every runtime release is gated by dependency installation, Prisma generation, API tests, API/Web production builds, release-package/status coherence checks, immutable image deployment, direct runtime identity checks, transactional UAT, Web→API proxy verification, public-route verification, encrypted backup evidence, and approved-registry persistence.

The latest exact approved Web/API commit and immutable digests are intentionally read from the durable `release-registry` branch rather than duplicated in this README.

## Production boundary

The staging approval is not production authorization. Production-only work still includes real carrier/provider credentials and contractual connectivity, production OIDC/SSO acceptance, production document/object storage where required, production payment/banking integrations where required, independent security/vulnerability review, a production disaster-recovery/restore exercise, operational handover, and formal go-live authorization.
