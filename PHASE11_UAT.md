# Phase 11 UAT

1. Create a transport order on a scoped booking and move it through REQUESTED → ACCEPTED → DISPATCHED → PICKED_UP → COMPLETED.
2. Confirm agent/customer users cannot create internal transport orders outside scope.
3. Create export/import customs declarations, add MRN, simulate HOLD and CLEARED states.
4. Create a warehouse/CFS job and progress RECEIVING → RECEIVED → PROCESSING → READY → RELEASED.
5. Add tracking milestones with planned and actual times and verify booking linkage.
6. Confirm all mutation events create audit records.
7. Verify /transport, /customs, /warehouse and /tracking render with empty and populated datasets.
