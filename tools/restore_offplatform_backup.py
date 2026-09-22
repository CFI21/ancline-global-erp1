#!/usr/bin/env python3
import argparse, base64, gzip, hashlib, json
from pathlib import Path
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def main():
    ap=argparse.ArgumentParser(description='Decrypt an ANCLINE off-platform staging backup envelope.')
    ap.add_argument('envelope', type=Path)
    ap.add_argument('private_key', type=Path)
    ap.add_argument('--output', type=Path, default=Path('ANCLINE_Restored_Logical_Backup.json'))
    args=ap.parse_args()

    env=json.loads(args.envelope.read_text(encoding='utf-8'))
    if env.get('format') != 'ANCLINE_OFFPLATFORM_BACKUP_ENVELOPE_V1':
        raise SystemExit('Unsupported envelope format')
    if env.get('algorithm') != 'RSA-OAEP-SHA256+AES-256-GCM':
        raise SystemExit('Unsupported encryption algorithm')

    private_key=serialization.load_pem_private_key(args.private_key.read_bytes(), password=None)
    wrapped=base64.b64decode(env['wrappedKey'])
    data_key=private_key.decrypt(
        wrapped,
        padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None),
    )
    ciphertext=base64.b64decode(env['ciphertext'])
    if hashlib.sha256(ciphertext).hexdigest() != env['ciphertextSha256']:
        raise SystemExit('Ciphertext SHA-256 mismatch')

    iv=base64.b64decode(env['iv'])
    tag=base64.b64decode(env['tag'])
    gzip_bytes=AESGCM(data_key).decrypt(iv, ciphertext + tag, None)
    if hashlib.sha256(gzip_bytes).hexdigest() != env['gzipSha256']:
        raise SystemExit('Gzip SHA-256 mismatch')

    logical=gzip.decompress(gzip_bytes)
    parsed=json.loads(logical.decode('utf-8'))
    args.output.write_bytes(logical)
    print(json.dumps({
        'status':'PASS',
        'releaseCommit':env.get('releaseCommit'),
        'database':parsed.get('database'),
        'tableCount':parsed.get('tableCount'),
        'totalRows':sum(int(v) for v in parsed.get('rowCounts',{}).values()),
        'output':str(args.output),
    }, indent=2))

if __name__ == '__main__':
    main()
