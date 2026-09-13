# Phase 10 UAT

1. Select a booking in Document Control and confirm BL, manifest, document, DG, CRO and exception data render.
2. Create a Switch BL only with a parent BL lineage reference.
3. Create a DG booking and verify CRO is blocked while carrier or terminal DG approval is not APPROVED.
4. Set both DG approvals to APPROVED and verify CRO can be created/released.
5. Assign POL_AGENT, TRANSIT_AGENT and POD_AGENT and confirm each appears in Agent Workflows.
6. Create HIGH/CRITICAL operational exceptions and confirm control-tower counts update.
7. Resolve an exception and confirm immutable audit event exists.
8. Confirm scoped users cannot read bookings outside their branch/agent/customer scope.
