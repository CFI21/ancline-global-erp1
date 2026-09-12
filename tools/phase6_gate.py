from pathlib import Path
import json, sys

root=Path(__file__).resolve().parents[1]
gate=json.loads((root/'infra/release-gate.json').read_text())
failed=[x for x in gate['mandatory'] if not x['pass']]
print(f"ANCLINE Phase {gate['phase']} gate status: {gate['status']}")
for x in gate['mandatory']:
    print(('PASS' if x['pass'] else 'BLOCK'), x['id'], '-', x['description'])
if failed:
    print(f"\nGO-LIVE BLOCKED: {len(failed)} mandatory items incomplete.")
    sys.exit(2)
print("\nGO-LIVE GATE: PASS")
