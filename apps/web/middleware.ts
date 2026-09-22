import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(_req:NextRequest){
  const res=NextResponse.next();
  res.headers.set('X-Content-Type-Options','nosniff');
  res.headers.set('X-Frame-Options','DENY');
  res.headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  // Next.js App Router emits framework bootstrap data as inline scripts.
  // Keep eval blocked, but permit those framework inline scripts so the client can hydrate.
  res.headers.set('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  return res;
}
