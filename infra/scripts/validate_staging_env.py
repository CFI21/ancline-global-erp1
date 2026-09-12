import os, sys

required = [
    "DATABASE_URL","REDIS_URL","OIDC_ISSUER","OIDC_CLIENT_ID","OIDC_CLIENT_SECRET",
    "OIDC_REDIRECT_URI","OBJECT_STORAGE_PROVIDER","OBJECT_STORAGE_BUCKET",
    "OBJECT_STORAGE_REGION","CORS_ORIGINS","NEXT_PUBLIC_API_URL"
]
missing=[k for k in required if not os.getenv(k)]
unsafe=[]
for k in ["OIDC_CLIENT_SECRET","OBJECT_STORAGE_ACCESS_KEY","OBJECT_STORAGE_SECRET_KEY"]:
    v=os.getenv(k,"")
    if v.lower() in {"change-me","replace","use-secret-manager","ci-only"}:
        unsafe.append(k)

if missing:
    print("FAIL missing:", ", ".join(missing))
if unsafe:
    print("FAIL unsafe placeholder values:", ", ".join(unsafe))
if missing or unsafe:
    sys.exit(1)
print("PASS staging environment validation")
