# ANCLINE Staging UAT & Release Evidence

Current approved staging release: `ee2eefbc1f16789ed3328598d6a807435b68bf91`  
GitHub Actions approval run: `35733993240`  
Transactional UAT run: `UAT-20260922133614-SQHE9`

## Automated release gates — PASS

- [x] Render API key and exact Web/API service preflight
- [x] Approved runtime baseline identity check
- [x] Clean dependency install and Prisma client generation
- [x] API regression suite: **7 suites / 32 tests PASS**
- [x] API production build
- [x] Phase 10 staging-gate and release-package coherence check
- [x] Web production build
- [x] Legacy page-sidebar rejection
- [x] Immutable Web/API image build
- [x] Exact immutable candidate deployment through Render API
- [x] Direct API health and embedded commit identity
- [x] 20-step transactional staging UAT with cleanup
- [x] Web embedded commit identity
- [x] Web -> API proxy health and identity match
- [x] Public Web route checks
- [x] Encrypted off-platform backup-envelope validation
- [x] Hardened release evidence artifact
- [x] Approved digest registry update
- [x] Fully unattended rollback drill previously proven with green workflow

## Regression coverage — PASS

The normal API CI suite now includes:

- [x] Bulk-data controls
- [x] Forwarding commercial and booking controls
- [x] Shipment / consol execution readiness controls
- [x] Web workflow navigation and critical API-contract wiring
- [x] Carrier-outbound privacy policy
- [x] User/organization booking scope
- [x] Booking workflow invariants

The Forwarding regression suite proves direct-booking bypass is blocked, ANC terms must be accepted, accepted quotes create the scoped Forwarding booking, customer responses do not expose carrier quote internals, and 5-digit ANCLINE job-reference rules remain enforced.

The Shipment / Consol suite proves ETA/ETD validation, FCL equipment completeness, loaded-container readiness, and empty-consol departure protection.

The Web contract suite proves every static WorkspaceShell workflow target has a page and verifies the critical Forwarding and Shipment Control Web/API endpoint contracts remain aligned.

## Security / scope — automated coverage

- [x] Global Admin scope
- [x] Agent NVOCC scope
- [x] Authorized Agent direct-co-load / cross-trade Forwarding scope
- [x] Customer booking scope
- [x] Carrier outbound payload blocks ANC customer reference/KYC/house B/L/shipper/consignee data
- [x] Carrier outbound payload permits operational carrier fields and ANC-owned references
- [x] Forwarding direct-booking bypass is blocked; accepted ANC quote and terms are required before booking creation

## Core transactional UAT — PASS

The staging UAT runner creates isolated test data, executes transaction controls, verifies results, and removes test data. Current runtime coverage includes:

- [x] Organization/customer and agent test data
- [x] Rate quote creation and controlled state
- [x] Booking creation
- [x] Confirmation-control blocking before credit/slot/equipment clearance
- [x] Credit/slot/equipment control clearance
- [x] Container creation
- [x] Document create/release transaction
- [x] Revenue and cost finance lines
- [x] Booking P&L validation
- [x] Operational task
- [x] Maker/checker approval record
- [x] Integration-event record
- [x] Notification record
- [x] Audit-event trail
- [x] Portal visibility projection
- [x] Closeout readiness controls
- [x] Financial close state
- [x] Final transaction verification
- [x] UAT data cleanup

## Functional flows present and release-gated

- [x] Carrier Rate -> ANC Quote -> Booking
- [x] Global Forwarding quote acceptance creates booking only after ANC terms acceptance
- [x] Forwarding carrier submission waits for ANC carrier payer/payment instructions
- [x] NVOCC portal booking/rate flow
- [x] Booking -> Shipment / Consol operations
- [x] Vessel schedule / routing / container operations
- [x] Customer/KYC and House B/L data isolation from normal carrier outbound payloads
- [x] 5-digit ANCLINE job-reference enforcement

## Production-only acceptance — not claimed by staging

These remain production/go-live evidence items and are intentionally not marked complete by the staging pipeline:

- [ ] Real carrier production booking/rate credentials and provider acceptance
- [ ] Production OIDC/SSO acceptance
- [ ] Production object/document storage acceptance
- [ ] Production payment/banking integration acceptance where used
- [ ] Independent penetration/vulnerability review
- [ ] Full production restore / disaster-recovery exercise
- [ ] Operational handover and production go-live sign-off

The staging PASS above must not be interpreted as production authorization.
