# ANCLINE LIVE BULK BUILD — Legal Entity / Group Close Pack

Built on the current finance close branch rebased onto the latest main.

## Added
- balance-sheet account reconciliation control
- evidence/reference capture per reconciliation
- suspense-account detection
- unallocated bank cash detection
- controlled suspense resolution
- aged AP close exceptions
- legal-entity close-pack sign-off evidence
- maker-checker entity sign-off
- consolidated group certification
- maker-checker group certification
- close-pack dashboard and KPIs

## API
- /api/finance-close-pack/*

## UI
- /finance-close-pack

## Promotion gate
Draft only. Do not merge/deploy before complete API/web build, tests, npm audit, Prisma validation and staging UAT.
