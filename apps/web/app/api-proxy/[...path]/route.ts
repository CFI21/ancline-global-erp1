import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function apiBaseUrl() {
  const raw = process.env.ANCLINE_API_URL || process.env.API_URL || '';
  const trimmed = raw.replace(/\/+$/, '');
  if (!trimmed) return '';
  return /\/api$/i.test(trimmed) ? trimmed : `${trimmed}/api`;
}

async function forward(request: NextRequest, context: RouteContext) {
  const base = apiBaseUrl();
  if (!base) {
    return NextResponse.json(
      { message: 'ANCLINE API proxy is not configured. Set ANCLINE_API_URL at runtime.' },
      { status: 503 }
    );
  }

  const { path } = await context.params;
  const safePath = (path || []).map(encodeURIComponent).join('/');
  const target = new URL(`${base}/${safePath}`);
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.append(key, value));

  const headers = new Headers(request.headers);
  for (const name of ['host', 'connection', 'content-length', 'transfer-encoding']) headers.delete(name);

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: 'no-store',
    redirect: 'manual',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  try {
    const response = await fetch(target, init);
    const responseHeaders = new Headers(response.headers);
    for (const name of ['content-encoding', 'content-length', 'transfer-encoding', 'connection']) {
      responseHeaders.delete(name);
    }
    const body = await response.arrayBuffer();

    if (safePath === 'auth/oidc/configuration') {
      let oidc:any = null;
      try {
        oidc = JSON.parse(new TextDecoder().decode(body));
      } catch {}
      console.log(JSON.stringify({
        event: 'prod_sso_proxy_diagnostic',
        apiBase: base,
        target: target.toString(),
        status: response.status,
        configured: oidc?.configured ?? null,
        devLoginAllowed: oidc?.devLoginAllowed ?? null,
        authorizationEndpointPresent: Boolean(oidc?.authorizationEndpoint)
      }));
    }

    return new NextResponse(body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (e:any) {
    if (safePath === 'auth/oidc/configuration') {
      console.log(JSON.stringify({
        event: 'prod_sso_proxy_diagnostic',
        apiBase: base,
        target: target.toString(),
        status: 'FETCH_ERROR',
        error: e?.message || 'fetch failed'
      }));
    }
    return NextResponse.json(
      { message: 'ANCLINE API is temporarily unavailable through the web proxy.' },
      { status: 502 }
    );
  }
}

export const GET = forward;
export const HEAD = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
export const OPTIONS = forward;
