# ANCLINE LIVE — Phase 6 UAT Matrix

## Security / Scope
- [ ] Customer sees only its own bookings
- [ ] Customer cannot access finance endpoints
- [ ] Agent sees only producing/assigned bookings
- [ ] Agent cannot see ANCLINE buy rates or GP
- [ ] Branch Ops sees only authorized branch records
- [ ] Finance role can access finance lines but cannot override operational controls
- [ ] Requester cannot self-approve maker-checker items

## Booking / Commercial
- [ ] Valid rate can create booking
- [ ] Expired rate blocks confirmation
- [ ] Credit hold blocks confirmation
- [ ] Slot shortage blocks confirmation
- [ ] Equipment unavailable blocks confirmation
- [ ] Material GP deterioration reopens approval

## Documentation
- [ ] BL release hold blocks release
- [ ] Switch BL requires surrender/void + approvals
- [ ] VGM missing blocks manifest readiness
- [ ] DG approval missing blocks CRO release

## Operations
- [ ] Carrier confirmation mismatch creates exception
- [ ] Missing equipment event creates exception
- [ ] Transshipment MCT breach routes re-protection task
- [ ] Empty return overdue creates D&D exposure

## Finance
- [ ] WIP converts to accrual at period close
- [ ] Actual cost clears WIP/accrual without double count
- [ ] Posted finance transaction cannot be deleted
- [ ] CRT creates a new controlled adjustment version
- [ ] Job close blocks on WIP/accrual/open CRT
- [ ] Agent settlement closes only after costs/collections/profit share resolve

## Resilience
- [ ] Backup completes
- [ ] Restore into clean staging DB succeeds
- [ ] API readiness recovers after restart
- [ ] Audit trail remains intact after restart
