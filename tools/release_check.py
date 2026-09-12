from pathlib import Path
import sys

root=Path(__file__).resolve().parents[1]
required=[
    "apps/api/src/modules/auth/oidc/oidc.module.ts",
    "apps/api/src/modules/observability/observability.module.ts",
    "infra/docker-compose.staging.yml",
    "infra/RELEASE_GATE.md",
    "infra/SECRETS_POLICY.md",
    "infra/scripts/backup_postgres.sh",
    "infra/scripts/restore_postgres.sh",
]
missing=[p for p in required if not (root/p).exists()]
if missing:
    print("FAIL missing:",missing)
    sys.exit(1)
print("PASS release package structure")
