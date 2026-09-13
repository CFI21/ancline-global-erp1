# Phase 9 UAT Matrix

1. Service/Voyage: create service, create voyage, verify voyage appears in operations dashboard.
2. Allocation: create purchased allocation, consume TEU, confirm over-allocation is blocked.
3. Routing: add leg 1 and leg 2 to one booking and confirm ordered route visibility.
4. Fleet: add movement event and verify location/status update while prior events remain immutable.
5. Fleet correction: add correction event and confirm prior event remains in ledger.
6. DG: create incomplete DG request and confirm validation; create complete DG record; verify readiness remains blocked until carrier + terminal approval.
7. OOG: create OOG profile and verify effective TEU calculation.
8. BL lineage: create primary BL; create Switch BL only with parent BL reference.
9. Manifest: create export/transit/import manifest records with correct port roles.
10. Finance: create WIP and accrual lines, verify summary GP/margin.
11. CRT: requester raises CRT; same requester approval is blocked; different finance approver approves; final amount updates.
12. Scope: Agent/Customer roles cannot access internal allocation, fleet or confidential finance endpoints.
