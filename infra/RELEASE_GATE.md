# ANCLINE Production Release Gate

A production release is blocked unless all are PASS:

- [ ] OIDC/SSO enabled
- [ ] Customer row isolation tested
- [ ] Agent row isolation tested
- [ ] Branch row isolation tested
- [ ] Finance access restrictions tested
- [ ] Audit log generated for sensitive mutations
- [ ] Document storage configured
- [ ] Secrets moved out of files
- [ ] HTTPS enabled
- [ ] Backups enabled and restore tested
- [ ] Monitoring/alerts enabled
- [ ] CI tests passing
- [ ] DB migration tested in staging
- [ ] UAT signed off
- [ ] Security review completed
- [ ] DR procedure tested
