# ANCLINE LIVE BULK BUILD — Finance Close Orchestration

Branch: `bulk/finance-close-orchestration-20260918`

Built from current main including carrier operations.

## Added
- Revenue Recognition control carried forward onto latest main.
- Finance Close Control Board across:
  - Revenue
  - General Ledger
  - AR/AP
  - Treasury
  - Procurement
  - Statutory FX
  - Intercompany
- Deterministic blocker engine.
- Immutable control-board snapshot for audit evidence.

## Safety
No merge to main and no Render deployment until full build, tests, dependency audit and staging UAT pass.
