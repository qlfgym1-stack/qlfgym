import { NextRequest } from 'next/server';
import { verifyCookie, parseCookieValue } from '@/lib/cookie-signature';
import type { Session } from '@/types/api';

const COOKIE_NAME = 'qlf-auth';
const AUTH_SECRET = process.env.AUTH_SECRET || 'qlf-dev-secret-change-in-production';

export function getSession(req: NextRequest): Session | null {
  const cookieStr = req.cookies.get(COOKIE_NAME)?.value;
  if (!cookieStr) return null;

  const verified = verifyCookie(cookieStr, AUTH_SECRET);
  if (!verified) return null;

  const parsed = parseCookieValue(verified);
  if (!parsed || !parsed.username || !parsed.role) return null;

  return {
    username: parsed.username,
    role: parsed.role as Session['role'],
    supabaseUserId: parsed.supabaseUserId || '',
    profileId: parsed.profileId || '',
  };
}

export function verifyAuthenticated(req: NextRequest): Session {
  const session = getSession(req);
  if (!session) {
    throw new Error('Non authentifié');
  }
  return session;
}

export function withRole(session: Session, allowedRoles: string[]): void {
  if (!allowedRoles.includes(session.role)) {
    throw new Error(`Accès refusé : rôle ${session.role} non autorisé`);
  }
}
