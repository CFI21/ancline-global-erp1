import json, os, sys, urllib.request

base=os.getenv("ANCLINE_STAGING_API","").rstrip("/")
if not base:
    print("ANCLINE_STAGING_API is required")
    sys.exit(1)

checks=[
    ("/api/observability/ready","ready"),
    ("/api/diagnostics/staging-readiness","pass"),
    ("/api/auth/oidc/configuration","configured"),
]

failed=[]
for path,key in checks:
    url=base+path
    try:
        with urllib.request.urlopen(url,timeout=10) as r:
            data=json.loads(r.read().decode())
        print("OK", path, data)
        if key in data and not data[key]:
            failed.append(path)
    except Exception as e:
        print("FAIL",path,e)
        failed.append(path)

if failed:
    print("STAGING VERIFY FAILED:", failed)
    sys.exit(1)
print("STAGING VERIFY PASS")
