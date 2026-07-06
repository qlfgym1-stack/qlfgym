import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { signCookie, stringifyCookieValue } from '@/lib/cookie-signature';
import { apiSuccess, apiError } from '@/lib/api-response';

const COOKIE_NAME = 'qlf-auth';
const AUTH_SECRET = process.env.AUTH_SECRET || 'qlf-dev-secret-change-in-production';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync('admin123', 10);

interface StoredUser {
  username: string;
  passwordHash: string;
  role: 'admin' | 'reception';
}

const users: StoredUser[] = [
  { username: ADMIN_USERNAME, passwordHash: ADMIN_PASSWORD_HASH, role: 'admin' },
];

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return apiError('Identifiant et mot de passe requis');
    }

    const user = users.find(u => u.username === username);
    if (!user) {
      return apiError('Identifiant ou mot de passe incorrect', 401);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return apiError('Identifiant ou mot de passe incorrect', 401);
    }

    const cookiePayload = stringifyCookieValue({
      username: user.username,
      role: user.role,
      supabaseUserId: user.username,
      profileId: user.username,
    });

    const signedCookie = signCookie(cookiePayload, AUTH_SECRET);

    const response = NextResponse.json(apiSuccess({
      user: { username: user.username, role: user.role },
      redirect: user.role === 'admin' ? '/admin' : '/reception',
    }));

    response.cookies.set(COOKIE_NAME, signedCookie, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });

    return response;
  } catch (error) {
    return apiError('Erreur serveur', 500);
  }
}
