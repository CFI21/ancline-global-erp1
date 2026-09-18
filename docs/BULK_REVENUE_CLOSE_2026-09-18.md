# ANCLINE LIVE BULK BUILD — Revenue Recognition & Finance Close

Branch: `bulk/revenue-close-20260918`

This batch adds deterministic, auditable revenue recognition without introducing new database tables. It uses the existing IntegrationEvent ledger and current GL journal event convention.

## Controls
- finance-role access guard
- configurable recognition policy by transport mode / service type
- booking-status trigger
- cumulative target percentage
- prevents recognition above eligible amount
- blocks posting into a closed fiscal period
- automatically creates balanced GL journal events
- keeps recognition and journal source references linked
- period close pack identifies missing policies and revenue still due
- immutable close-pack snapshot for audit evidence

## API
- GET /api/revenue-close/dashboard?period=YYYY-MM
- GET /api/revenue-close/policies
- POST /api/revenue-close/policies
- GET /api/revenue-close/bookings?period=YYYY-MM
- POST /api/revenue-close/bookings/:bookingId/recognize
- GET /api/revenue-close/close-pack/:period
- POST /api/revenue-close/close-pack/:period/snapshot

## UI
- /revenue-close

## Promotion gate
Do not merge/deploy until API build, web build, repository tests, npm audit and staging UAT pass.
