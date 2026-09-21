import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'online',
    service: 'ANCLINE Web',
    buildCommit: process.env.ANCLINE_BUILD_COMMIT || process.env.ANCLINE_RELEASE_COMMIT || 'unknown',
    apiMode: process.env.NEXT_PUBLIC_API_URL ? 'direct-browser' : 'same-origin-runtime-proxy',
  });
}
