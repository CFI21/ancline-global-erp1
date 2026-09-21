import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function apiBaseUrl() {
  const raw = process.env.ANCLINE_API_URL || process.env.API_URL || '';
  return raw.replace(/\/+$/, '');
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
  const target = new URL(`${base}/${(path || []).map(encodeURIComponent).join('/')}`);
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
    return new NextResponse(body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch {
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
