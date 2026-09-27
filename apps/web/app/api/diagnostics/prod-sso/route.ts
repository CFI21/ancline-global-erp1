import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const raw = process.env.ANCLINE_API_URL || process.env.API_URL || '';
  const base = raw.replace(/\/+$/, '');
  const target = base ? `${base}/auth/oidc/configuration` : '';
  const result:any = {
    runtimeApiBase: base || null,
    target: target || null,
    status: null,
    ok: false,
    oidc: null,
    error: null
  };
  if (!target) {
    result.error = 'ANCLINE_API_URL/API_URL missing';
    return NextResponse.json(result, { status: 503 });
  }
  try {
    const r = await fetch(target, { cache: 'no-store', headers: { accept: 'application/json' } });
    result.status = r.status;
    result.ok = r.ok;
    const text = await r.text();
    let data:any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
    if (data && typeof data === 'object') {
      result.oidc = {
        configured: data.configured ?? null,
        devLoginAllowed: data.devLoginAllowed ?? null,
        issuerPresent: Boolean(data.issuer),
        clientIdPresent: Boolean(data.clientId),
        redirectUri: data.redirectUri ?? null,
        discoveryUrl: data.discoveryUrl ?? null,
        authorizationEndpoint: data.authorizationEndpoint ?? null
      };
    }
    return NextResponse.json(result, { status: r.ok ? 200 : 502 });
  } catch (e:any) {
    result.error = e?.message || 'fetch failed';
    return NextResponse.json(result, { status: 502 });
  }
}
