import { NextRequest } from 'next/server';
import { verifyAuthenticated, withRole } from '@/lib/api-auth';
import type { Session } from '@/types/api';

export async function withAuth(req: NextRequest): Promise<Session> {
  return verifyAuthenticated(req);
}

export function withRoleCheck(session: Session, roles: string[]): void {
  withRole(session, roles);
}

export async function csrfProtection(req: NextRequest): Promise<void> {
  const csrfCookie = req.cookies.get('csrf-token')?.value;
  const csrfHeader = req.headers.get('x-csrf-token');
  if (req.method !== 'GET' && (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader)) {
    throw new Error('CSRF token invalide');
  }
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(req: NextRequest): Promise<void> {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  const key = `${ip}:${req.nextUrl.pathname}`;
  const now = Date.now();
  const windowMs = 60000;
  const max = 100;

  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  entry.count++;
  if (entry.count > max) {
    throw new Error('Trop de requêtes. Réessayez plus tard.');
  }
}
