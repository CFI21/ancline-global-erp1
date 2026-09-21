# ANCLINE LIVE BULK BUILD — Finance Close Execution

Extends the current finance close orchestration branch.

## Added controls
- configurable AR aging threshold
- mandatory bank reconciliation gate
- tax/VAT prepare + filed workflow
- intercompany settlement gate
- global period close execution
- legal-entity certification workflow
- maker-checker: requester cannot approve their own entity certification
- cross-module execution dashboard
- audit events for policy, tax, global close and certification

## API
- /api/finance-close-execution/*

## UI
- /finance-close-execution

## Promotion gate
Draft only. Do not merge/deploy before full API/web build, tests, npm audit, Prisma validation and staging UAT.
