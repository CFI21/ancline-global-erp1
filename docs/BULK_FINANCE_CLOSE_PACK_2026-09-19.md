# ANCLINE LIVE BULK BUILD — Legal Entity / Group Close Pack

Built on latest main after the full transaction UAT and Sales Lead / Inquiry UI changes.

## Added
- balance-sheet reconciliation by legal entity and period
- suspense/unallocated balance control
- aged AP exception visibility
- entity close-pack readiness
- sign-off evidence reference
- entity maker-checker approval
- group certification request/approval
- group maker-checker approval
- immutable audit events

## API
- /api/finance-close-pack/*

## UI
- /finance-close-pack
- /finance-close-pack/[entityId]

## Promotion gate
Draft branch only. Full build, tests, npm audit, Prisma validation, UAT and Render verification are mandatory before merge/deploy.
