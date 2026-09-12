# Inputs required for actual ANCLINE staging deployment

The code is ready for staging deployment, but these external values must be supplied/connected:

## Render
- Confirm target Render workspace.
- Private Git repository URL containing this project.

## Identity
Choose/configure an OIDC provider and provide:
- OIDC issuer
- Client ID
- Client secret
- Redirect URI

## Object storage
Provide/configure:
- S3-compatible bucket
- Region
- Access key/role
- Secret key/role

## DNS
For staging:
- `erp-staging.ancline.net`
- `portal-staging.ancline.net`
- `agent-staging.ancline.net`
- `api-staging.ancline.net`

## Security
Real secrets must be entered in the hosting platform secret/environment settings. They must never be committed into the repository.
