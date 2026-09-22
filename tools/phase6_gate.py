from pathlib import Path
import json
import sys

root=Path(__file__).resolve().parents[1]
gate=json.loads((root/'infra/release-gate.json').read_text())
phase=json.loads((root/'infra/phase-status.json').read_text())

errors=[]
if gate.get('phase') != phase.get('phase'):
    errors.append(f"phase mismatch gate={gate.get('phase')} phase-status={phase.get('phase')}")
if gate.get('status') != phase.get('status'):
    errors.append(f"status mismatch gate={gate.get('status')} phase-status={phase.get('status')}")
if gate.get('approved_commit') != phase.get('approved_commit'):
    errors.append(
        f"approved commit mismatch gate={gate.get('approved_commit')} "
        f"phase-status={phase.get('approved_commit')}"
    )

failed=[x for x in gate.get('mandatory',[]) if not x.get('pass')]
print(f"ANCLINE Phase {gate.get('phase')} staging gate status: {gate.get('status')}")
for item in gate.get('mandatory',[]):
    print(('PASS' if item.get('pass') else 'BLOCK'), item.get('id'), '-', item.get('description'))

if errors:
    for error in errors:
        print('ERROR', error)
    sys.exit(2)

if failed:
    print(f"\nSTAGING RELEASE BLOCKED: {len(failed)} mandatory item(s) incomplete.")
    sys.exit(2)

print("\nSTAGING RELEASE GATE: PASS")

production=gate.get('production_only',[])
outstanding=[x for x in production if not x.get('pass')]
if outstanding:
    print(f"PRODUCTION AUTHORIZATION: NOT CLAIMED ({len(outstanding)} production-only item(s) remain)")
    for item in outstanding:
        print('PROD-BLOCK', item.get('id'), '-', item.get('description'))
