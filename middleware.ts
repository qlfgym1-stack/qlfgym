import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyCookie, parseCookieValue } from '@/lib/cookie-signature';

const COOKIE_NAME = 'qlf-auth';
const AUTH_SECRET = process.env.AUTH_SECRET || 'qlf-dev-secret-change-in-production';

const ADMIN_PATHS = ['/admin'];
const RECEPTION_PATHS = ['/reception'];
const PROTECTED_PATHS = [...ADMIN_PATHS, ...RECEPTION_PATHS];
const PUBLIC_PATHS = ['/login'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p)) || pathname === '/') {
    return NextResponse.next();
  }

  const isProtected = PROTECTED_PATHS.some(p => pathname.startsWith(p));
  if (!isProtected && !pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  const cookieStr = request.cookies.get(COOKIE_NAME)?.value;
  if (!cookieStr) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Non authentifié' } }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const verified = verifyCookie(cookieStr, AUTH_SECRET);
  if (!verified) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Session invalide' } }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const parsed = parseCookieValue(verified);
  if (!parsed || !parsed.role) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Session invalide' } }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (pathname.startsWith('/admin') && parsed.role !== 'admin') {
    return NextResponse.redirect(new URL('/reception', request.url));
  }

  if (pathname.startsWith('/reception') && parsed.role !== 'reception') {
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  const response = NextResponse.next();
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js).*)'],
};
