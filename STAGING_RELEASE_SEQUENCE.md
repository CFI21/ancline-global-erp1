# ANCLINE Staging Release Sequence

1. Private Git repository created and Phase 7 code pushed.
2. Render workspace confirmed.
3. Managed PostgreSQL created in Frankfurt.
4. Managed Key Value/Redis created in Frankfurt.
5. API staging service created from repository.
6. Web staging service created from repository.
7. OIDC app configured with exact staging callback.
8. Object-storage bucket configured.
9. Secrets entered in Render environment settings.
10. Prisma migration deployed.
11. UAT seed loaded.
12. API readiness endpoint passes.
13. Customer/agent isolation tests pass.
14. Booking/document/finance workflow UAT passes.
15. Backup/restore drill passes.
16. Security scan passes.
17. Release gate JSON updated.
18. Staging sign-off.

No production promotion before all mandatory gates are PASS.
